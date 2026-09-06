import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { encryptSecret } from '../../utils/crypto'
import { logEvent } from '../../utils/events'
import { serializeProvider, type ProviderRow } from '../../utils/models'
import { asNumber, asString, nullableString } from '../../utils/validate'

interface ProviderBody {
  kind?: unknown
  label?: unknown
  baseUrl?: unknown
  model?: unknown
  temperature?: unknown
  maxTokens?: unknown
  apiKey?: unknown
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as ProviderBody

  const db = getDb()
  const existing = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as
    | ProviderRow
    | undefined
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Provider not found' })
  }

  const fields: string[] = []
  const values: unknown[] = []

  if ('kind' in body) {
    const kind = asString(body.kind, 'kind', { max: 32 })
    fields.push('kind = ?')
    values.push(kind)
  }
  if ('label' in body) {
    fields.push('label = ?')
    values.push(asString(body.label, 'label', { required: true, min: 1, max: 64 }))
  }
  if ('baseUrl' in body) {
    const baseUrl = asString(body.baseUrl, 'baseUrl', { required: true, min: 4, max: 512 })
    if (!/^https?:\/\//i.test(baseUrl)) {
      throw createError({ statusCode: 400, message: 'baseUrl must start with http(s)://' })
    }
    fields.push('base_url = ?')
    values.push(baseUrl)
  }
  if ('model' in body) {
    fields.push('model = ?')
    values.push(asString(body.model, 'model', { max: 64 }))
  }
  if ('temperature' in body) {
    fields.push('temperature = ?')
    values.push(asNumber(body.temperature, 'temperature', { min: 0, max: 2 }) ?? 0.7)
  }
  if ('maxTokens' in body) {
    fields.push('max_tokens = ?')
    values.push(Math.round(asNumber(body.maxTokens, 'maxTokens', { min: 1, max: 131072 }) ?? 8192))
  }

  // apiKey: string → replace; null → clear; absent → keep as-is.
  if ('apiKey' in body) {
    const apiKey = nullableString(body.apiKey, 'apiKey', { max: 512 })
    fields.push('api_key_enc = ?')
    values.push(apiKey ? encryptSecret(apiKey) : null)
    fields.push('api_key_hint = ?')
    values.push(apiKey ? `••••${apiKey.slice(-4)}` : null)
  }

  if (fields.length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  db.prepare(`UPDATE providers SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)

  logEvent({ type: 'provider.updated', summary: `provider ${existing.label} updated` })

  const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as ProviderRow
  return serializeProvider(row)
})
