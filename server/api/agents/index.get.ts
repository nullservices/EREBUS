import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { serializeAgent, type AgentRow } from '../../utils/models'

export default defineEventHandler((event) => {
  requireUser(event)
  const q = getQuery(event)
  const projectId = typeof q.projectId === 'string' && q.projectId ? q.projectId : null

  const rows = getDb()
    .prepare(
      `SELECT a.*, p.label AS provider_label, p.kind AS provider_kind,
              pr.name AS project_name, pa.name AS parent_name
       FROM agents a
       LEFT JOIN providers p ON p.id = a.provider_id
       LEFT JOIN projects pr ON pr.id = a.project_id
       LEFT JOIN agents pa ON pa.id = a.parent_id
       ${projectId ? 'WHERE a.project_id = ?' : ''}
       ORDER BY a.name COLLATE NOCASE`,
    )
    .all(...(projectId ? [projectId] : [])) as AgentRow[]

  return rows.map(serializeAgent)
})
