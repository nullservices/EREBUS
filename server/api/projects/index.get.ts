import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { serializeProject, type ProjectRow } from '../../utils/models'

export default defineEventHandler((event) => {
  requireUser(event)
  const rows = getDb()
    .prepare(
      `SELECT pr.*, COUNT(a.id) AS agent_count
       FROM projects pr
       LEFT JOIN agents a ON a.project_id = pr.id
       GROUP BY pr.id
       ORDER BY pr.name COLLATE NOCASE`,
    )
    .all() as ProjectRow[]
  return rows.map(serializeProject)
})
