import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { logEvent } from '../../utils/events'
import { asString } from '../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const db = getDb()
  const row = db.prepare('SELECT name FROM agents WHERE id = ?').get(id) as
    | { name: string }
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }

  // Children are kept and detached (FK ON DELETE SET NULL); messages cascade;
  // the historical event log keeps the agent id as a plain value.
  db.prepare('DELETE FROM agents WHERE id = ?').run(id)

  logEvent({ type: 'entity.deleted', summary: `entity ${row.name} deleted` })
  return { ok: true }
})
