import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { serializeIntervention, type InterventionRow } from '../../runtime/interventions'

/** Intervention queue: all, or filtered by agent/status. */
export default defineEventHandler((event) => {
  requireUser(event)
  const q = getQuery(event)

  const conditions: string[] = []
  const params: unknown[] = []

  if (typeof q.agentId === 'string' && q.agentId) {
    conditions.push('agent_id = ?')
    params.push(q.agentId)
  }
  if (typeof q.status === 'string' && q.status) {
    conditions.push('status = ?')
    params.push(q.status.toUpperCase())
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(
      `SELECT * FROM interventions ${where}
       ORDER BY created_at ASC`,
    )
    .all(...params) as InterventionRow[]

  return rows.map(serializeIntervention)
})
