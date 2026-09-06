import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { asString, nullableString } from '../../utils/validate'
import {
  getTaskById,
  logTaskEvent,
  nextTaskNumber,
  serializeTask,
  TASK_SELECT,
  taskWouldCycle,
  type TaskRow,
} from '../../utils/tasks'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '../../../shared/types'

interface TaskBody {
  title?: unknown
  description?: unknown
  status?: unknown
  priority?: unknown
  projectId?: unknown
  parentId?: unknown
  assignedAgentId?: unknown
}

export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const body = (await readBody(event).catch(() => ({}))) as TaskBody

  const title = asString(body.title, 'title', { required: true, min: 2, max: 200 })
  const description = asString(body.description, 'description', { max: 8000 })
  const projectId = nullableString(body.projectId, 'projectId', { max: 64 })
  const parentId = nullableString(body.parentId, 'parentId', { max: 64 })
  const assignedAgentId = nullableString(body.assignedAgentId, 'assignedAgentId', { max: 64 })

  const statusRaw = asString(body.status, 'status', { max: 32 }) || 'TODO'
  if (!(TASK_STATUSES as readonly string[]).includes(statusRaw)) {
    throw createError({ statusCode: 400, message: `Unknown task status: ${statusRaw}` })
  }
  const status = statusRaw as TaskStatus

  const priorityRaw = asString(body.priority, 'priority', { max: 32 }) || 'NORMAL'
  if (!(TASK_PRIORITIES as readonly string[]).includes(priorityRaw)) {
    throw createError({ statusCode: 400, message: `Unknown priority: ${priorityRaw}` })
  }
  const priority = priorityRaw as TaskPriority

  const db = getDb()
  if (projectId && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw createError({ statusCode: 400, message: 'Unknown project' })
  }
  if (parentId && !db.prepare('SELECT 1 FROM tasks WHERE id = ?').get(parentId)) {
    throw createError({ statusCode: 400, message: 'Unknown parent task' })
  }
  if (
    assignedAgentId &&
    !db.prepare('SELECT 1 FROM agents WHERE id = ?').get(assignedAgentId)
  ) {
    throw createError({ statusCode: 400, message: 'Unknown entity' })
  }

  const id = randomUUID()
  const number = nextTaskNumber()
  db.prepare(
    `INSERT INTO tasks
       (id, number, project_id, parent_id, title, description, status, priority,
        created_by, assigned_agent_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    number,
    projectId,
    parentId,
    title,
    description,
    status,
    priority,
    user.username === 'operator' ? 'operator' : `operator:${user.username}`,
    assignedAgentId,
  )

  const task = getTaskById(id)!
  logTaskEvent('task.created', task, `created (${task.status.toLowerCase()})`)
  return task
})
