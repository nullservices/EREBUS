import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { asString, nullableString } from '../../utils/validate'
import {
  getTaskById,
  logTaskEvent,
  taskWouldCycle,
} from '../../utils/tasks'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskStatus } from '../../../shared/types'

interface TaskBody {
  title?: unknown
  description?: unknown
  status?: unknown
  priority?: unknown
  projectId?: unknown
  parentId?: unknown
  assignedAgentId?: unknown
  result?: unknown
}

const FINAL_STATUSES: TaskStatus[] = ['DONE', 'FAILED', 'CANCELLED']

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as TaskBody

  const db = getDb()
  const existing = getTaskById(id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Task not found' })
  }

  const fields: string[] = []
  const values: unknown[] = []

  if ('title' in body) {
    fields.push('title = ?')
    values.push(asString(body.title, 'title', { required: true, min: 2, max: 200 }))
  }
  if ('description' in body) {
    fields.push('description = ?')
    values.push(asString(body.description, 'description', { max: 8000 }))
  }
  if ('result' in body) {
    fields.push('result = ?')
    values.push(asString(body.result, 'result', { max: 8000 }))
  }
  if ('priority' in body) {
    const priority = asString(body.priority, 'priority', { required: true, max: 32 })
    if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) {
      throw createError({ statusCode: 400, message: `Unknown priority: ${priority}` })
    }
    fields.push('priority = ?')
    values.push(priority)
  }
  if ('projectId' in body) {
    const projectId = nullableString(body.projectId, 'projectId', { max: 64 })
    if (projectId && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
      throw createError({ statusCode: 400, message: 'Unknown project' })
    }
    fields.push('project_id = ?')
    values.push(projectId)
  }
  if ('assignedAgentId' in body) {
    const agentId = nullableString(body.assignedAgentId, 'assignedAgentId', { max: 64 })
    if (agentId && !db.prepare('SELECT 1 FROM agents WHERE id = ?').get(agentId)) {
      throw createError({ statusCode: 400, message: 'Unknown entity' })
    }
    fields.push('assigned_agent_id = ?')
    values.push(agentId)
  }
  if ('parentId' in body) {
    const parentId = nullableString(body.parentId, 'parentId', { max: 64 })
    if (parentId) {
      if (!db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(parentId)) {
        throw createError({ statusCode: 400, message: 'Unknown parent task' })
      }
      if (taskWouldCycle(parentId, id)) {
        throw createError({ statusCode: 400, message: 'Parent assignment would create a cycle' })
      }
    }
    fields.push('parent_id = ?')
    values.push(parentId)
  }
  if ('status' in body) {
    const statusRaw = asString(body.status, 'status', { required: true, max: 32 })
    if (!(TASK_STATUSES as readonly string[]).includes(statusRaw)) {
      throw createError({ statusCode: 400, message: `Unknown task status: ${statusRaw}` })
    }
    const status = statusRaw as TaskStatus
    fields.push('status = ?')
    values.push(status)
    if (FINAL_STATUSES.includes(status)) {
      fields.push("completed_at = COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
    } else {
      fields.push('completed_at = NULL')
    }
  }

  if (fields.length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)

  const task = getTaskById(id)!
  const statusChanged = 'status' in body && body.status !== existing.status
  const agentChanged =
    'assignedAgentId' in body && body.assignedAgentId !== existing.assignedAgentId
  if (statusChanged) {
    logTaskEvent('task.updated', task, `→ ${task.status.toLowerCase()}`)
  } else if (agentChanged) {
    logTaskEvent(
      'task.assigned',
      task,
      task.assignedAgentName ? `assigned to ${task.assignedAgentName}` : 'unassigned',
    )
  } else {
    logTaskEvent('task.updated', task, 'updated')
  }
  return task
})
