import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { serializeTask, TASK_SELECT, type TaskRow } from '../../../utils/tasks'
import { asString } from '../../../utils/validate'

/** Tasks assigned to one entity, newest first. */
export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const db = getDb()
  if (!db.prepare('SELECT 1 FROM agents WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }

  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200)

  const rows = db
    .prepare(`${TASK_SELECT} WHERE t.assigned_agent_id = ? ORDER BY t.number DESC LIMIT ?`)
    .all(id, limit) as TaskRow[]

  return rows.map(serializeTask)
})
