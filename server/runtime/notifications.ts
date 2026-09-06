import { getDb } from '../db'
import { decryptSecret } from '../utils/crypto'
import { asString } from '../utils/validate'
import type { EventRecord } from '../../shared/types'

/**
 * Notification fan-out.
 *
 * logEvent() hands every recorded event here; the notifier filters by each
 * enabled channel's event categories and delivers asynchronously (never
 * blocking or failing the event itself). Delivery failures are logged to the
 * server console — structured logging lands in Phase VIII.
 *
 * Kinds:
 *   discord — Discord webhook (plain HTTP POST, no bot required)
 *   ntfy    — ntfy.sh (or self-hosted) push topic
 *   generic — any HTTP endpoint receiving JSON { title, body, severity }
 */

export type ChannelKind = 'discord' | 'ntfy' | 'generic'
export const CHANNEL_KINDS: ChannelKind[] = ['discord', 'ntfy', 'generic']

export const NOTIFY_CATEGORIES = ['error', 'completion', 'lifecycle', 'message'] as const
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]

export interface ChannelRow {
  id: string
  kind: ChannelKind
  label: string
  enabled: number
  config_enc: string
  config_hint: string | null
  events_json: string
  created_at: string
  updated_at: string
}

interface ChannelConfig {
  url?: string
  topic?: string
  server?: string
}

export interface Notification {
  category: NotifyCategory
  title: string
  body: string
  severity: 'error' | 'info'
}

const CATEGORY_BY_EVENT_TYPE: Record<string, NotifyCategory> = {
  'agent.error': 'error',
  'agent.completed': 'completion',
  'agent.started': 'lifecycle',
  'agent.stopped': 'lifecycle',
  'agent.recovered': 'lifecycle',
  'system.initialized': 'lifecycle',
  'message.user': 'message',
}

/** Minimum interval between two deliveries per channel (anti-spam). */
const MIN_INTERVAL_MS = 5_000
const lastSentAt = new Map<string, number>()

const SEVERITY_COLORS: Record<string, number> = {
  error: 0xc25b52,
  info: 0x7d73c7,
}

export function serializeChannel(row: ChannelRow) {
  const events = parseEvents(row.events_json)
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    enabled: row.enabled === 1,
    events,
    configHint: row.config_hint,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseEvents(json: string): NotifyCategory[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed)
      ? parsed.filter((e): e is NotifyCategory => (NOTIFY_CATEGORIES as readonly string[]).includes(e))
      : []
  } catch {
    return []
  }
}

function notificationForEvent(event: EventRecord): Notification | null {
  const category = CATEGORY_BY_EVENT_TYPE[event.type]
  if (!category) return null

  const title = event.agentName
    ? `EREBUS · ${event.agentName.toUpperCase()}`
    : 'EREBUS · SYSTEM'
  return {
    category,
    title,
    body: event.summary,
    severity: category === 'error' ? 'error' : 'info',
  }
}

async function deliver(channel: ChannelRow, notification: Notification): Promise<void> {
  const config = JSON.parse(decryptSecret(channel.config_enc) ?? '{}') as ChannelConfig

  switch (channel.kind) {
    case 'discord': {
      const url = config.url
      if (!url) throw new Error('channel has no webhook URL')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: notification.title,
              description: notification.body,
              color: SEVERITY_COLORS[notification.severity],
            },
          ],
        }),
      })
      if (!res.ok) throw new Error(`discord webhook HTTP ${res.status}`)
      break
    }
    case 'ntfy': {
      const topic = config.topic
      if (!topic) throw new Error('channel has no topic')
      const server = (config.server || 'https://ntfy.sh').replace(/\/+$/, '')
      const res = await fetch(`${server}/${topic}`, {
        method: 'POST',
        headers: {
          Title: notification.title,
          Priority: notification.severity === 'error' ? 'high' : 'default',
          Tags: notification.severity === 'error' ? 'warning' : 'robot',
        },
        body: notification.body,
      })
      if (!res.ok) throw new Error(`ntfy HTTP ${res.status}`)
      break
    }
    case 'generic': {
      const url = config.url
      if (!url) throw new Error('channel has no URL')
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: notification.title,
          body: notification.body,
          severity: notification.severity,
          at: new Date().toISOString(),
        }),
      })
      if (!res.ok) throw new Error(`generic webhook HTTP ${res.status}`)
      break
    }
  }
}

/** Fire-and-forget entry point called from logEvent. */
export function notifyEvent(event: EventRecord): void {
  // Internal bookkeeping events never fan out (prevents notify loops).
  if (event.type.startsWith('notify.')) return

  const notification = notificationForEvent(event)
  if (!notification) return

  const channels = getDb()
    .prepare('SELECT * FROM channels WHERE enabled = 1')
    .all() as ChannelRow[]

  for (const channel of channels) {
    if (!parseEvents(channel.events_json).includes(notification.category)) continue

    // Coalesce bursts within one category, but never let one category's
    // traffic suppress another — an error right after a lifecycle event
    // must still go out.
    const debounceKey = `${channel.id}:${notification.category}`
    const last = lastSentAt.get(debounceKey) ?? 0
    if (Date.now() - last < MIN_INTERVAL_MS) continue
    lastSentAt.set(debounceKey, Date.now())

    void deliver(channel, notification).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`[erebus] notification channel ${channel.label} failed: ${message}`)
    })
  }
}

/** Direct delivery — used by the TEST button (bypasses category filter). */
export async function testChannel(channel: ChannelRow): Promise<void> {
  await deliver(channel, {
    category: 'completion',
    title: 'EREBUS · CHANNEL TEST',
    body: `This channel (${channel.label}) is configured correctly.`,
    severity: 'info',
  })
}

interface RawChannelConfig {
  url?: unknown
  topic?: unknown
  server?: unknown
}

/** Validate the client-supplied config for a kind; returns JSON to encrypt. */
export function parseChannelConfig(kind: ChannelKind, config: RawChannelConfig | undefined): string {
  if (!config || typeof config !== 'object') {
    throw createError({ statusCode: 400, message: 'config is required' })
  }
  const clean: Record<string, string> = {}

  if (kind === 'discord' || kind === 'generic') {
    const url = asString(config.url, 'config.url', { required: true, max: 1024 })
    if (!/^https?:\/\//i.test(url)) {
      throw createError({ statusCode: 400, message: 'config.url must start with http(s)://' })
    }
    clean.url = url
  }
  if (kind === 'ntfy') {
    clean.topic = asString(config.topic, 'config.topic', { required: true, min: 1, max: 128 })
    const server = asString(config.server, 'config.server', { max: 512 })
    if (server) {
      if (!/^https?:\/\//i.test(server)) {
        throw createError({ statusCode: 400, message: 'config.server must start with http(s)://' })
      }
      clean.server = server
    }
  }
  return JSON.stringify(clean)
}

/** Human-readable masked hint for a channel config. */
export function channelConfigHint(kind: ChannelKind, configJson: string): string | null {
  try {
    const config = JSON.parse(configJson) as ChannelConfig
    if (kind === 'ntfy') return config.topic ?? null
    const url = config.url ?? ''
    return hostOf(url)
  } catch {
    return null
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
