import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { createAdapterFor } from '../../../runtime/providers/types'
import { catalogFor } from '../../../runtime/providers/catalog'
import type { ProviderRow } from '../../../utils/models'
import { asString } from '../../../utils/validate'
import type { ModelCatalog } from '../../../../shared/types'

/**
 * Model list for one provider.
 * Live fetch from the provider API when the adapter supports it; the curated
 * catalog otherwise (or when the live fetch fails). The currently configured
 * model is always included so a saved free-typed value never vanishes.
 */
export default defineEventHandler(async (event): Promise<ModelCatalog> => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const row = getDb().prepare('SELECT * FROM providers WHERE id = ?').get(id) as
    | ProviderRow
    | undefined
  if (!row) {
    throw createError({ statusCode: 404, message: 'Provider not found' })
  }

  const adapter = createAdapterFor(row.kind)
  let source: ModelCatalog['source'] = 'catalog'
  let models = catalogFor(row.kind)

  if (adapter?.listModels) {
    try {
      const live = await adapter.listModels(row)
      if (live.length > 0) {
        models = live
        source = 'live'
      }
    } catch {
      // No key / unreachable / provider error — the catalog still works.
    }
  }

  const current = row.model.trim()
  if (current && !models.some((m) => m.id === current)) {
    models = [{ id: current, label: current }, ...models]
  }

  return { source, models: models.slice(0, 100) }
})
