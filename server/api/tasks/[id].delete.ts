import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { getTaskById, logTaskEvent } from '../../utils/tasks'
import { asString } from '../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const db = getDb()
  const task = getTaskById(id)
  if (!task) {
    throw createError({ statusCode: 404, message: 'Task not found' })
  }

  // Child tasks are kept and detached (FK ON DELETE SET NULL).
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  logTaskEvent('task.deleted', task, 'deleted')
  return { ok: true }
})
