import { getDb } from '../db'
import { requireUser } from '../utils/auth'

/**
 * Global search across entities, tasks, projects, messages and events.
 * Results carry enough context to navigate straight to the object.
 */
export default defineEventHandler((event) => {
  requireUser(event)
  const q = getQuery(event)
  const query = typeof q.q === 'string' ? q.q.trim() : ''
  if (query.length < 2) {
    return { agents: [], tasks: [], projects: [], messages: [], events: [] }
  }

  const db = getDb()
  const like = `%${query}%`

  const agents = db
    .prepare(
      `SELECT id, name, role, status FROM agents
       WHERE name LIKE ? OR role LIKE ? OR description LIKE ? COLLATE NOCASE
       ORDER BY name LIMIT 20`,
    )
    .all(like, like, like) as { id: string; name: string; role: string; status: string }[]

  const tasks = db
    .prepare(
      `SELECT t.id, t.number, t.title, t.status, a.name AS agent_name
       FROM tasks t LEFT JOIN agents a ON a.id = t.assigned_agent_id
       WHERE t.title LIKE ? OR t.description LIKE ? OR CAST(t.number AS TEXT) = ? COLLATE NOCASE
       ORDER BY t.number DESC LIMIT 20`,
    )
    .all(like, like, query) as {
    id: string
    number: number
    title: string
    status: string
    agent_name: string | null
  }[]

  const projects = db
    .prepare(
      `SELECT id, name, description, root_dir FROM projects
       WHERE name LIKE ? OR description LIKE ? OR root_dir LIKE ? COLLATE NOCASE
       ORDER BY name LIMIT 10`,
    )
    .all(like, like, like) as { id: string; name: string; description: string; root_dir: string }[]

  const messageRows = db
    .prepare(
      `SELECT m.id, m.agent_id, m.role, substr(m.content, 1, 140) AS snippet, m.created_at, a.name AS agent_name
       FROM messages m LEFT JOIN agents a ON a.id = m.agent_id
       WHERE m.content LIKE ? COLLATE NOCASE
       ORDER BY m.created_at DESC LIMIT 10`,
    )
    .all(like) as {
    id: string
    agent_id: string
    role: string
    snippet: string
    created_at: string
    agent_name: string | null
  }[]

  const eventRows = db
    .prepare(
      `SELECT e.id, e.type, e.summary, e.created_at, a.name AS agent_name
       FROM events e LEFT JOIN agents a ON a.id = e.agent_id
       WHERE e.summary LIKE ? COLLATE NOCASE
       ORDER BY e.created_at DESC LIMIT 10`,
    )
    .all(like) as { id: string; type: string; summary: string; created_at: string; agent_name: string | null }[]

  return {
    agents,
    tasks,
    projects,
    messages: messageRows.map((m) => ({
      id: m.id,
      agentId: m.agent_id,
      agentName: m.agent_name,
      role: m.role,
      snippet: m.snippet,
      createdAt: m.created_at,
    })),
    events: eventRows,
  }
})
