import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { serializeProvider, type ProviderRow } from '../../utils/models'

/** Provider configurations — API keys are NEVER included, only masked hints. */
export default defineEventHandler((event) => {
  requireUser(event)
  const rows = getDb()
    .prepare('SELECT * FROM providers ORDER BY label COLLATE NOCASE')
    .all() as ProviderRow[]
  return rows.map(serializeProvider)
})
