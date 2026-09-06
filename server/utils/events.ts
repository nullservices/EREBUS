import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { notifyEvent } from '../runtime/notifications'
import { broadcast } from '../runtime/realtime'
import type { EventRecord } from '../../shared/types'

/**
 * Durable global activity log. Every notable system action goes through
 * here. In Phase 3 the same events are fanned out over WebSockets.
 */

export interface NewEvent {
  type: string
  agentId?: string | null
  projectId?: string | null
  summary: string
  data?: Record<string, unknown> | null
}

interface EventRow {
  id: string
  type: string
  agent_id: string | null
  agent_name: string | null
  project_id: string | null
  summary: string
  data: string | null
  created_at: string
}

export function serializeEvent(row: EventRow): EventRecord {
  return {
    id: row.id,
    type: row.type,
    agentId: row.agent_id,
    agentName: row.agent_name,
    projectId: row.project_id,
    summary: row.summary,
    data: row.data ? (JSON.parse(row.data) as Record<string, unknown>) : null,
    createdAt: row.created_at,
  }
}

export function logEvent(event: NewEvent): EventRecord {
  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO events (id, type, agent_id, project_id, summary, data)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    event.type,
    event.agentId ?? null,
    event.projectId ?? null,
    event.summary,
    event.data ? JSON.stringify(event.data) : null,
  )

  const row = db
    .prepare(
      `SELECT e.*, a.name AS agent_name
       FROM events e
       LEFT JOIN agents a ON a.id = e.agent_id
       WHERE e.id = ?`,
    )
    .get(id) as EventRow
  const serialized = serializeEvent(row)

  // Fan out to notification channels and realtime peers (fire-and-forget).
  notifyEvent(serialized)
  broadcast({ kind: 'event', event: serialized })

  return serialized
}

export function listEvents(opts: {
  limit?: number
  agentId?: string | null
  projectId?: string | null
}): EventRecord[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  const conditions: string[] = []
  const params: unknown[] = []

  if (opts.agentId) {
    conditions.push('e.agent_id = ?')
    params.push(opts.agentId)
  }
  if (opts.projectId) {
    conditions.push('e.project_id = ?')
    params.push(opts.projectId)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(
      `SELECT e.*, a.name AS agent_name
       FROM events e
       LEFT JOIN agents a ON a.id = e.agent_id
       ${where}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT ?`,
    )
    .all(...params, limit) as EventRow[]

  return rows.map(serializeEvent)
}
