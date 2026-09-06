import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { requireUser } from '../../utils/auth'
import { logEvent } from '../../utils/events'
import { getAgentById } from '../../utils/models'
import {
  asString,
  isUniqueViolation,
  nullableString,
  parsePermissions,
  parseTools,
} from '../../utils/validate'

interface AgentBody {
  name?: unknown
  role?: unknown
  description?: unknown
  systemPrompt?: unknown
  providerId?: unknown
  modelOverride?: unknown
  projectId?: unknown
  parentId?: unknown
  workingDir?: unknown
  tools?: unknown
  permissions?: unknown
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = (await readBody(event).catch(() => ({}))) as AgentBody
  const name = asString(body.name, 'name', { required: true, min: 2, max: 32 })
  const role = asString(body.role, 'role', { max: 64 })
  const description = asString(body.description, 'description', { max: 2000 })
  const systemPrompt = asString(body.systemPrompt, 'systemPrompt', { max: 16000 })
  const providerId = nullableString(body.providerId, 'providerId', { max: 64 })
  const modelOverride = asString(body.modelOverride, 'modelOverride', { max: 64 })
  const projectId = nullableString(body.projectId, 'projectId', { max: 64 })
  const parentId = nullableString(body.parentId, 'parentId', { max: 64 })
  const workingDir = nullableString(body.workingDir, 'workingDir', { max: 1024 })
  const tools = parseTools(body.tools)
  const permissions = parsePermissions(body.permissions)

  const db = getDb()
  if (providerId && !db.prepare('SELECT 1 FROM providers WHERE id = ?').get(providerId)) {
    throw createError({ statusCode: 400, message: 'Unknown provider' })
  }
  if (projectId && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
    throw createError({ statusCode: 400, message: 'Unknown project' })
  }
  if (parentId && !db.prepare('SELECT 1 FROM agents WHERE id = ?').get(parentId)) {
    throw createError({ statusCode: 400, message: 'Unknown parent entity' })
  }

  const id = randomUUID()
  try {
    db.prepare(
      `INSERT INTO agents
         (id, name, role, description, system_prompt, provider_id, model_override,
          project_id, parent_id, working_dir, status, tools_json, permissions_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OFFLINE', ?, ?)`,
    ).run(
      id,
      name,
      role,
      description,
      systemPrompt,
      providerId,
      modelOverride,
      projectId,
      parentId,
      workingDir ?? '',
      JSON.stringify(tools),
      JSON.stringify(permissions),
    )
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, message: `An entity named ${name} already exists` })
    }
    throw err
  }

  logEvent({ type: 'entity.created', agentId: id, projectId, summary: `entity ${name} created` })
  return getAgentById(id)
})
