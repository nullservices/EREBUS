import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { testChannel, type ChannelRow } from '../../../runtime/notifications'
import { asString } from '../../../utils/validate'

/** Send a real test delivery through the channel — the honest TEST button. */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const row = getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id) as
    | ChannelRow
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, message: 'Channel not found' })
  }

  try {
    await testChannel(row)
    return { ok: true, detail: `test delivery accepted by ${row.label}` }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw createError({ statusCode: 502, message: `Delivery failed: ${message.slice(0, 200)}` })
  }
})
