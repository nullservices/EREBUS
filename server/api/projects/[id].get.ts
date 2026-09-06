import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { serializeProject, type ProjectRow } from '../../utils/models'
import { asString } from '../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const row = getDb()
    .prepare(
      `SELECT pr.*, COUNT(a.id) AS agent_count
       FROM projects pr
       LEFT JOIN agents a ON a.project_id = pr.id
       WHERE pr.id = ?
       GROUP BY pr.id`,
    )
    .get(id) as ProjectRow | undefined

  if (!row) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }
  return serializeProject(row)
})
