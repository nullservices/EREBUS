import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { encryptSecret } from '../../utils/crypto'
import { logEvent } from '../../utils/events'
import { serializeProvider, type ProviderRow } from '../../utils/models'
import { asNumber, asString, nullableString } from '../../utils/validate'
import { PROVIDER_KINDS, type ProviderKind } from '../../../shared/types'

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
  const body = (await readBody(event).catch(() => ({}))) as ProviderBody

  const kindRaw = asString(body.kind, 'kind', { required: true, max: 32 })
  if (!(PROVIDER_KINDS as readonly string[]).includes(kindRaw)) {
    throw createError({ statusCode: 400, message: `Unknown provider kind: ${kindRaw}` })
  }
  const kind = kindRaw as ProviderKind

  const label = asString(body.label, 'label', { required: true, min: 1, max: 64 })
  const baseUrl = asString(body.baseUrl, 'baseUrl', { required: true, min: 4, max: 512 })
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw createError({ statusCode: 400, message: 'baseUrl must start with http(s)://' })
  }
  const model = asString(body.model, 'model', { max: 64 })
  const temperature = asNumber(body.temperature, 'temperature', { min: 0, max: 2 }) ?? 0.7
  const maxTokens = Math.round(asNumber(body.maxTokens, 'maxTokens', { min: 1, max: 131072 }) ?? 8192)
  const apiKey = nullableString(body.apiKey, 'apiKey', { max: 512 })

  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO providers (id, kind, label, base_url, model, temperature, max_tokens, api_key_enc, api_key_hint)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    kind,
    label,
    baseUrl,
    model,
    temperature,
    maxTokens,
    apiKey ? encryptSecret(apiKey) : null,
    apiKey ? `••••${apiKey.slice(-4)}` : null,
  )

  logEvent({ type: 'provider.created', summary: `provider ${label} added` })

  const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as ProviderRow
  return serializeProvider(row)
})
