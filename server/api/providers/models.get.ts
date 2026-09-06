import { requireUser } from '../../utils/auth'
import { catalogFor } from '../../runtime/providers/catalog'
import { fail } from '../../utils/validate'
import { PROVIDER_KINDS, type ModelCatalog, type ProviderKind } from '../../../shared/types'

/**
 * Catalog-only model list by provider kind — used while configuring a
 * provider that has not been saved yet (no id → no live fetch possible).
 */
export default defineEventHandler((event): ModelCatalog => {
  requireUser(event)
  const q = getQuery(event)
  const kind = typeof q.kind === 'string' ? q.kind : ''
  if (!(PROVIDER_KINDS as readonly string[]).includes(kind)) {
    fail(400, 'A valid provider kind is required')
  }
  return { source: 'catalog', models: catalogFor(kind as ProviderKind) }
})
