import { getDb } from '../db'
import { requireUser } from '../utils/auth'
import { listEvents } from '../utils/events'
import type { DashboardStats } from '../../shared/types'

/** Aggregates for the command dashboard. */
export default defineEventHandler((event): DashboardStats => {
  requireUser(event)
  const db = getDb()

  const byStatusRows = db
    .prepare('SELECT status, COUNT(*) AS c FROM agents GROUP BY status')
    .all() as { status: string; c: number }[]
  const byStatus: Record<string, number> = {}
  let total = 0
  let online = 0
  for (const row of byStatusRows) {
    byStatus[row.status] = row.c
    total += row.c
    if (row.status !== 'OFFLINE') online += row.c
  }

  const { c: projects } = db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }

  return {
    agents: { total, online, byStatus },
    projects,
    recentEvents: listEvents({ limit: 15 }),
  }
})
