import { randomUUID } from 'node:crypto'
import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { logEvent } from '../../../utils/events'
import { serializeMessage, MESSAGE_SELECT, type MessageRow } from '../../../utils/models'
import { asString, nullableString } from '../../../utils/validate'
import { submitInstruction } from '../../../runtime/agent-runner'
import { processAgentOutput } from '../../../runtime/orchestration'

interface MessageBody {
  content?: unknown
  senderAgentId?: unknown
}

/**
 * Record a message into an entity's conversation.
 * - Operator messages: recorded; queued to the runtime when started.
 * - Entity messages (senderAgentId set): recorded with sender attribution,
 *   and directives inside the content (@ENTITY / @OPERATOR) are acted on.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as MessageBody
  const content = asString(body.content, 'content', { required: true, max: 16000 })
  const senderAgentId = nullableString(body.senderAgentId, 'senderAgentId', { max: 64 })

  const db = getDb()
  const agent = db.prepare('SELECT name, status FROM agents WHERE id = ?').get(id) as
    | { name: string; status: string }
    | undefined
  if (!agent) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }
  if (senderAgentId && !db.prepare('SELECT 1 FROM agents WHERE id = ?').get(senderAgentId)) {
    throw createError({ statusCode: 400, message: 'Unknown sender entity' })
  }

  const messageId = randomUUID()
  db.prepare(
    `INSERT INTO messages (id, agent_id, sender_agent_id, role, kind, content)
     VALUES (?, ?, ?, 'user', 'text', ?)`,
  ).run(messageId, id, senderAgentId, content)

  if (senderAgentId) {
    // Entity-to-entity traffic: honor the communication protocol.
    logEvent({
      type: 'agent.message',
      agentId: id,
      summary: `${senderAgentId} → ${agent.name}: ${content.slice(0, 80)}`,
      data: { messageId, senderAgentId },
    })
    processAgentOutput(senderAgentId, content)
  } else {
    logEvent({
      type: 'message.user',
      agentId: id,
      summary: `${agent.name} received instruction from operator`,
    })
    const queued = submitInstruction(id, messageId, content)
    const row = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(messageId) as MessageRow
    return { ...serializeMessage(row), queued }
  }

  const row = db.prepare(`${MESSAGE_SELECT} WHERE m.id = ?`).get(messageId) as MessageRow
  return serializeMessage(row)
})
