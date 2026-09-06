import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { logEvent } from '../../utils/events'
import { asString } from '../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const db = getDb()
  const row = db.prepare('SELECT label FROM providers WHERE id = ?').get(id) as
    | { label: string }
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, message: 'Provider not found' })
  }

  // Entities using this provider keep existing; assignment clears via SET NULL.
  db.prepare('DELETE FROM providers WHERE id = ?').run(id)

  logEvent({ type: 'provider.deleted', summary: `provider ${row.label} deleted` })
  return { ok: true }
})
