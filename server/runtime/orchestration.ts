import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { logEvent } from '../utils/events'
import { parseDirectives } from '../utils/directives'
import { createIntervention } from './interventions'
import { isAgentStarted, submitInstruction } from './agent-runner'

/**
 * Act on the directives inside a completed agent output:
 *   @ENTITY instruction  → recorded in the target's conversation and queued
 *                          to its runtime when it is started
 *   @OPERATOR question   → the agent pauses (WAITING_FOR_HUMAN) and an
 *                          intervention is raised for the operator
 */
export function processAgentOutput(agentId: string, text: string): void {
  if (!text) return

  const db = getDb()
  const sender = db.prepare('SELECT id, name FROM agents WHERE id = ?').get(agentId) as
    | { id: string; name: string }
    | undefined
  if (!sender) return

  const known = db.prepare('SELECT id, name FROM agents').all() as { id: string; name: string }[]
  const { mentions, operatorQuestions } = parseDirectives(text, known)

  for (const mention of mentions) {
    const messageId = randomUUID()
    db.prepare(
      `INSERT INTO messages (id, agent_id, sender_agent_id, role, kind, content)
       VALUES (?, ?, ?, 'agent', 'text', ?)`,
    ).run(messageId, mention.targetId, agentId, mention.content)

    const target = known.find((a) => a.id === mention.targetId)
    logEvent({
      type: 'agent.message',
      agentId: mention.targetId,
      summary: `${sender.name} → ${target?.name ?? mention.targetId}: ${mention.content.slice(0, 80)}`,
      data: { messageId, senderAgentId: agentId },
    })

    if (isAgentStarted(mention.targetId)) {
      submitInstruction(mention.targetId, messageId, mention.content)
    }
  }

  for (const question of operatorQuestions) {
    createIntervention({ agentId, kind: 'input', prompt: question })
  }
}
