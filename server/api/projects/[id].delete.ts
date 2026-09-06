import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { logEvent } from '../../utils/events'
import { asString } from '../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const db = getDb()
  const row = db.prepare('SELECT name FROM projects WHERE id = ?').get(id) as
    | { name: string }
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }

  // Agents in this project keep existing; their project assignment is cleared
  // by the FK's ON DELETE SET NULL.
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)

  logEvent({ type: 'project.deleted', summary: `project ${row.name} deleted` })
  return { ok: true }
})
