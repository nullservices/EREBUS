import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { logEvent } from '../../utils/events'
import type { ChannelRow } from '../../runtime/notifications'
import { asString } from '../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const db = getDb()
  const row = db.prepare('SELECT label FROM channels WHERE id = ?').get(id) as
    | { label: string }
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, message: 'Channel not found' })
  }

  db.prepare('DELETE FROM channels WHERE id = ?').run(id)
  logEvent({ type: 'notify.channel-deleted', summary: `notification channel ${row.label} deleted` })
  return { ok: true }
})
