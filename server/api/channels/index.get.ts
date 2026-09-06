import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { serializeChannel, type ChannelRow } from '../../runtime/notifications'

/** Notification channels — config is encrypted; only hints are exposed. */
export default defineEventHandler((event) => {
  requireUser(event)
  const rows = getDb()
    .prepare('SELECT * FROM channels ORDER BY label COLLATE NOCASE')
    .all() as ChannelRow[]
  return rows.map(serializeChannel)
})
