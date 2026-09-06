import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { logEvent } from '../../utils/events'
import { serializeProject, type ProjectRow } from '../../utils/models'
import { asString, nullableString } from '../../utils/validate'

interface ProjectBody {
  name?: unknown
  description?: unknown
  rootDir?: unknown
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as ProjectBody

  const fields: string[] = []
  const values: unknown[] = []

  if ('name' in body) {
    fields.push('name = ?')
    values.push(asString(body.name, 'name', { required: true, min: 1, max: 64 }))
  }
  if ('description' in body) {
    fields.push('description = ?')
    values.push(asString(body.description, 'description', { max: 2000 }))
  }
  if ('rootDir' in body) {
    fields.push('root_dir = ?')
    values.push(nullableString(body.rootDir, 'rootDir', { max: 1024 }) ?? '')
  }

  if (fields.length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  const db = getDb()
  fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  const result = db
    .prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values, id)

  if (result.changes === 0) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }

  logEvent({ type: 'project.updated', projectId: id, summary: 'project configuration updated' })

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow
  return serializeProject(row)
})
