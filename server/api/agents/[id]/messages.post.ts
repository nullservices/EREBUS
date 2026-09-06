import { randomUUID } from 'node:crypto'
import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { logEvent } from '../../../utils/events'
import { serializeMessage, type MessageRow } from '../../../utils/models'
import { asString } from '../../../utils/validate'
import { submitInstruction } from '../../../runtime/agent-runner'

interface MessageBody {
  content?: unknown
}

/**
 * Record an operator instruction to an entity.
 * If the entity's runtime is started, the instruction is queued and executed
 * by the provider adapter; otherwise it is persisted for later.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as MessageBody
  const content = asString(body.content, 'content', { required: true, max: 16000 })

  const db = getDb()
  const agent = db.prepare('SELECT name, status FROM agents WHERE id = ?').get(id) as
    | { name: string; status: string }
    | undefined
  if (!agent) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }

  const messageId = randomUUID()
  db.prepare(
    `INSERT INTO messages (id, agent_id, role, kind, content)
     VALUES (?, ?, 'user', 'text', ?)`,
  ).run(messageId, id, content)

  logEvent({
    type: 'message.user',
    agentId: id,
    summary: `${agent.name} received instruction from operator`,
  })

  const queued = submitInstruction(id, messageId, content)

  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId) as MessageRow
  return { ...serializeMessage(row), queued }
})
