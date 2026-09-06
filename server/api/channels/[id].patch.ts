import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { encryptSecret } from '../../utils/crypto'
import { logEvent } from '../../utils/events'
import {
  NOTIFY_CATEGORIES,
  channelConfigHint,
  parseChannelConfig,
  serializeChannel,
  type ChannelRow,
  type NotifyCategory,
} from '../../runtime/notifications'
import { asString } from '../../utils/validate'

interface ChannelBody {
  label?: unknown
  enabled?: unknown
  events?: unknown
  config?: { url?: unknown; topic?: unknown; server?: unknown }
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as ChannelBody

  const db = getDb()
  const existing = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as
    | ChannelRow
    | undefined
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Channel not found' })
  }

  const fields: string[] = []
  const values: unknown[] = []

  if ('label' in body) {
    fields.push('label = ?')
    values.push(asString(body.label, 'label', { required: true, min: 1, max: 64 }))
  }
  if ('enabled' in body) {
    fields.push('enabled = ?')
    values.push(body.enabled ? 1 : 0)
  }
  if ('events' in body) {
    if (!Array.isArray(body.events)) {
      throw createError({ statusCode: 400, message: 'events must be an array' })
    }
    const events: NotifyCategory[] = body.events.filter((e): e is NotifyCategory =>
      (NOTIFY_CATEGORIES as readonly string[]).includes(String(e)),
    )
    if (events.length === 0) {
      throw createError({ statusCode: 400, message: 'At least one event category is required' })
    }
    fields.push('events_json = ?')
    values.push(JSON.stringify(events))
  }
  if ('config' in body) {
    const configJson = parseChannelConfig(existing.kind, body.config)
    fields.push('config_enc = ?')
    values.push(encryptSecret(configJson))
    fields.push('config_hint = ?')
    values.push(channelConfigHint(existing.kind, configJson))
  }

  if (fields.length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  db.prepare(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)

  logEvent({ type: 'notify.channel-updated', summary: `notification channel ${existing.label} updated` })

  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as ChannelRow
  return serializeChannel(row)
})
