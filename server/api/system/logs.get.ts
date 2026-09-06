import { requireUser } from '../../utils/auth'
import { tailLog } from '../../runtime/logger'

/** Tail of the structured log (settings viewer). */
export default defineEventHandler((event) => {
  requireUser(event)
  const q = getQuery(event)
  const lines = Math.min(Math.max(Number(q.lines) || 100, 1), 500)
  return { lines: tailLog(lines) }
})
