import { getDb } from '../db'
import { logEvent } from './events'
import type { Task, TaskStatus } from '../../shared/types'

/** Task row shape + serialization + transition logging. */

export interface TaskRow {
  id: string
  number: number
  project_id: string | null
  parent_id: string | null
  title: string
  description: string
  status: string
  priority: string
  created_by: string
  assigned_agent_id: string | null
  result: string
  created_at: string
  updated_at: string
  completed_at: string | null
  project_name?: string | null
  parent_number?: number | null
  parent_title?: string | null
  assigned_agent_name?: string | null
}

export const TASK_SELECT = `
  SELECT t.*, p.name AS project_name,
         pt.number AS parent_number, pt.title AS parent_title,
         a.name AS assigned_agent_name
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN tasks pt ON pt.id = t.parent_id
  LEFT JOIN agents a ON a.id = t.assigned_agent_id
`

export function serializeTask(row: TaskRow): Task {
  return {
    id: row.id,
    number: row.number,
    projectId: row.project_id,
    projectName: row.project_name ?? null,
    parentId: row.parent_id,
    parentNumber: row.parent_number ?? null,
    parentTitle: row.parent_title ?? null,
    title: row.title,
    description: row.description,
    status: row.status as TaskStatus,
    priority: row.priority as Task['priority'],
    createdBy: row.created_by,
    assignedAgentId: row.assigned_agent_id,
    assignedAgentName: row.assigned_agent_name ?? null,
    result: row.result,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }
}

export function getTaskById(id: string): Task | null {
  const row = getDb().prepare(`${TASK_SELECT} WHERE t.id = ?`).get(id) as
    | TaskRow
    | undefined
  return row ? serializeTask(row) : null
}

/** Next human-facing task number (#1042, …). */
export function nextTaskNumber(): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(number), 0) AS max_number FROM tasks')
    .get() as { max_number: number }
  return row.max_number + 1
}

/** Reject a parent assignment that would create a cycle. */
export function taskWouldCycle(parentId: string, taskId: string): boolean {
  const db = getDb()
  let current: string | null = parentId
  while (current) {
    if (current === taskId) return true
    const row = db.prepare('SELECT parent_id FROM tasks WHERE id = ?').get(current) as
      | { parent_id: string | null }
      | undefined
    current = row?.parent_id ?? null
  }
  return false
}

/** Log a task transition into the global event log. */
export function logTaskEvent(type: string, task: Task, extra?: string): void {
  logEvent({
    type,
    projectId: task.projectId,
    agentId: task.assignedAgentId,
    summary: `task #${task.number} ${task.title}${extra ? ` ${extra}` : ''}`,
    data: { taskId: task.id },
  })
}
