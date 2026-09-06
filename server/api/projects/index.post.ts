import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { logEvent } from '../../utils/events'
import { getAgentById, serializeProject, type ProjectRow } from '../../utils/models'
import { asString, nullableString } from '../../utils/validate'

interface ProjectBody {
  name?: unknown
  description?: unknown
  rootDir?: unknown
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = (await readBody(event).catch(() => ({}))) as ProjectBody
  const name = asString(body.name, 'name', { required: true, min: 1, max: 64 })
  const description = asString(body.description, 'description', { max: 2000 })
  const rootDir = nullableString(body.rootDir, 'rootDir', { max: 1024 })

  const db = getDb()
  const id = randomUUID()
  db.prepare('INSERT INTO projects (id, name, description, root_dir) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    description,
    rootDir ?? '',
  )

  logEvent({ type: 'project.created', projectId: id, summary: `project ${name} created` })

  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow
  return serializeProject(row)
})
