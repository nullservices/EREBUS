import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { encryptSecret } from '../../utils/crypto'
import { logEvent } from '../../utils/events'
import {
  CHANNEL_KINDS,
  NOTIFY_CATEGORIES,
  channelConfigHint,
  parseChannelConfig,
  serializeChannel,
  type ChannelKind,
  type ChannelRow,
  type NotifyCategory,
} from '../../runtime/notifications'
import { asString } from '../../utils/validate'

interface ChannelBody {
  kind?: unknown
  label?: unknown
  enabled?: unknown
  events?: unknown
  config?: { url?: unknown; topic?: unknown; server?: unknown }
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = (await readBody(event).catch(() => ({}))) as ChannelBody

  const kind = asString(body.kind, 'kind', { required: true, max: 32 }) as ChannelKind
  if (!(CHANNEL_KINDS as readonly string[]).includes(kind)) {
    throw createError({ statusCode: 400, message: `Unknown channel kind: ${kind}` })
  }
  const label = asString(body.label, 'label', { required: true, min: 1, max: 64 })

  const events: NotifyCategory[] = Array.isArray(body.events)
    ? body.events.filter((e): e is NotifyCategory =>
        (NOTIFY_CATEGORIES as readonly string[]).includes(String(e)),
      )
    : []
  if (events.length === 0) {
    throw createError({ statusCode: 400, message: 'At least one event category is required' })
  }

  const configJson = parseChannelConfig(kind, body.config)

  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO channels (id, kind, label, enabled, config_enc, config_hint, events_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    kind,
    label,
    body.enabled === false ? 0 : 1,
    encryptSecret(configJson),
    channelConfigHint(kind, configJson),
    JSON.stringify(events),
  )

  logEvent({ type: 'notify.channel-created', summary: `notification channel ${label} added` })

  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as ChannelRow
  return serializeChannel(row)
})
