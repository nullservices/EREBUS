import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { serializeTask, TASK_SELECT, type TaskRow } from '../../utils/tasks'

export default defineEventHandler((event) => {
  requireUser(event)
  const q = getQuery(event)

  const conditions: string[] = []
  const params: unknown[] = []

  if (typeof q.projectId === 'string' && q.projectId) {
    conditions.push('t.project_id = ?')
    params.push(q.projectId)
  }
  if (typeof q.assignedAgentId === 'string' && q.assignedAgentId) {
    conditions.push('t.assigned_agent_id = ?')
    params.push(q.assignedAgentId)
  }
  if (typeof q.status === 'string' && q.status) {
    conditions.push('t.status = ?')
    params.push(q.status.toUpperCase())
  }
  if (typeof q.parentId === 'string' && q.parentId) {
    conditions.push('t.parent_id = ?')
    params.push(q.parentId)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(
      `${TASK_SELECT} ${where}
       ORDER BY t.number DESC`,
    )
    .all(...params) as TaskRow[]

  return rows.map(serializeTask)
})
