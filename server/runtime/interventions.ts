import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { logEvent } from '../utils/events'
import { setAgentStatus } from './agent-status'
import { isAgentStarted } from './agent-runner'
import type { Intervention } from '../../shared/types'

/**
 * Human intervention queue.
 *
 * A running entity that needs the operator pauses (WAITING_FOR_HUMAN) and
 * raises an intervention. The operator's resolution is injected into the
 * entity's conversation and its queue resumes. The API layer wires the
 * resume (see agents/[id]/interventions handlers) to avoid a module cycle.
 */

export interface InterventionRow {
  id: string
  agent_id: string
  session_id: string | null
  kind: string
  prompt: string
  options_json: string | null
  status: string
  resolution: string | null
  created_at: string
  resolved_at: string | null
}

export function serializeIntervention(row: InterventionRow): Intervention {
  let options: string[] | null = null
  try {
    const parsed = row.options_json ? JSON.parse(row.options_json) : null
    if (Array.isArray(parsed)) options = parsed as string[]
  } catch {
    /* malformed options — treat as none */
  }
  return {
    id: row.id,
    agentId: row.agent_id,
    sessionId: row.session_id,
    kind: row.kind as Intervention['kind'],
    prompt: row.prompt,
    options,
    status: row.status as Intervention['status'],
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }
}

export function pendingInterventionsFor(agentId: string): Intervention[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM interventions WHERE agent_id = ? AND status = 'PENDING' ORDER BY created_at ASC",
    )
    .all(agentId) as InterventionRow[]
  return rows.map(serializeIntervention)
}

export function createIntervention(input: {
  agentId: string
  sessionId?: string | null
  kind?: 'input' | 'approval'
  prompt: string
  options?: string[]
}): Intervention {
  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO interventions (id, agent_id, session_id, kind, prompt, options_json, status)
     VALUES (?, ?, ?, ?, ?, ?, 'PENDING')`,
  ).run(
    id,
    input.agentId,
    input.sessionId ?? null,
    input.kind ?? 'input',
    input.prompt,
    input.options?.length ? JSON.stringify(input.options) : null,
  )

  setAgentStatus(input.agentId, 'WAITING_FOR_HUMAN')
  logEvent({
    type: 'intervention.created',
    agentId: input.agentId,
    summary: `entity requires human input: ${input.prompt.slice(0, 100)}`,
  })

  const row = db.prepare('SELECT * FROM interventions WHERE id = ?').get(id) as InterventionRow
  return serializeIntervention(row)
}

export function resolveIntervention(id: string, resolution: string): Intervention {
  const db = getDb()
  const row = db.prepare('SELECT * FROM interventions WHERE id = ?').get(id) as
    | InterventionRow
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, message: 'Intervention not found' })
  }
  if (row.status !== 'PENDING') {
    throw createError({ statusCode: 409, message: 'Intervention already resolved' })
  }

  db.prepare(
    `UPDATE interventions
     SET status = 'RESOLVED', resolution = ?,
         resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  ).run(resolution, id)

  // Inject the operator's answer into the entity's conversation so its
  // history carries the decision.
  db.prepare(
    `INSERT INTO messages (id, agent_id, role, kind, content, meta)
     VALUES (?, ?, 'user', 'text', ?, ?)`,
  ).run(
    randomUUID(),
    row.agent_id,
    `OPERATOR: ${resolution}`,
    JSON.stringify({ interventionId: id }),
  )

  // Back to a runnable state; a started runtime resumes its queue.
  setAgentStatus(row.agent_id, isAgentStarted(row.agent_id) ? 'IDLE' : 'OFFLINE')
  logEvent({
    type: 'intervention.resolved',
    agentId: row.agent_id,
    summary: `operator resolved a request from the entity`,
  })

  const updated = db.prepare('SELECT * FROM interventions WHERE id = ?').get(id) as InterventionRow
  return serializeIntervention(updated)
}
