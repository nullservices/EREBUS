import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { createAdapterFor } from '../../../runtime/providers/types'
import type { ProviderRow } from '../../../utils/models'
import { asString } from '../../../utils/validate'

/**
 * Real provider connectivity test.
 * The adapter makes an actual request (or launches the CLI) and reports
 * what happened. The API key stays server-side throughout.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const row = getDb().prepare('SELECT * FROM providers WHERE id = ?').get(id) as
    | ProviderRow
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, message: 'Provider not found' })
  }

  const adapter = createAdapterFor(row.kind)
  if (!adapter) {
    throw createError({
      statusCode: 400,
      message: `No runtime adapter for provider kind ${row.kind} yet`,
    })
  }

  return await adapter.test(row)
})
