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

/** Reject a parent assignment that would create a cycle in the hierarchy. */
function wouldCreateCycle(db: ReturnType<typeof getDb>, agentId: string, parentId: string): boolean {
  let current: string | null = parentId
  while (current) {
    if (current === agentId) return true
    const row = db.prepare('SELECT parent_id FROM agents WHERE id = ?').get(current) as
      | { parent_id: string | null }
      | undefined
    current = row?.parent_id ?? null
  }
  return false
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as AgentBody

  const db = getDb()
  if (!db.prepare('SELECT 1 FROM agents WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }

  const fields: string[] = []
  const values: unknown[] = []

  if ('name' in body) {
    fields.push('name = ?')
    values.push(asString(body.name, 'name', { required: true, min: 2, max: 32 }))
  }
  if ('role' in body) {
    fields.push('role = ?')
    values.push(asString(body.role, 'role', { max: 64 }))
  }
  if ('description' in body) {
    fields.push('description = ?')
    values.push(asString(body.description, 'description', { max: 2000 }))
  }
  if ('systemPrompt' in body) {
    fields.push('system_prompt = ?')
    values.push(asString(body.systemPrompt, 'systemPrompt', { max: 16000 }))
  }
  if ('modelOverride' in body) {
    fields.push('model_override = ?')
    values.push(asString(body.modelOverride, 'modelOverride', { max: 64 }))
  }
  if ('workingDir' in body) {
    fields.push('working_dir = ?')
    values.push(nullableString(body.workingDir, 'workingDir', { max: 1024 }) ?? '')
  }
  if ('tools' in body) {
    fields.push('tools_json = ?')
    values.push(JSON.stringify(parseTools(body.tools)))
  }
  if ('permissions' in body) {
    fields.push('permissions_json = ?')
    values.push(JSON.stringify(parsePermissions(body.permissions)))
  }

  if ('providerId' in body) {
    const providerId = nullableString(body.providerId, 'providerId', { max: 64 })
    if (providerId && !db.prepare('SELECT 1 FROM providers WHERE id = ?').get(providerId)) {
      throw createError({ statusCode: 400, message: 'Unknown provider' })
    }
    fields.push('provider_id = ?')
    values.push(providerId)
  }
  if ('projectId' in body) {
    const projectId = nullableString(body.projectId, 'projectId', { max: 64 })
    if (projectId && !db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId)) {
      throw createError({ statusCode: 400, message: 'Unknown project' })
    }
    fields.push('project_id = ?')
    values.push(projectId)
  }
  if ('parentId' in body) {
    const parentId = nullableString(body.parentId, 'parentId', { max: 64 })
    if (parentId) {
      if (!db.prepare('SELECT 1 FROM agents WHERE id = ?').get(parentId)) {
        throw createError({ statusCode: 400, message: 'Unknown parent entity' })
      }
      if (wouldCreateCycle(db, id, parentId)) {
        throw createError({ statusCode: 400, message: 'Parent assignment would create a cycle' })
      }
    }
    fields.push('parent_id = ?')
    values.push(parentId)
  }

  if (fields.length === 0) {
    throw createError({ statusCode: 400, message: 'No fields to update' })
  }

  fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')")
  try {
    db.prepare(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`).run(...values, id)
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw createError({ statusCode: 409, message: 'That entity name is already taken' })
    }
    throw err
  }

  logEvent({ type: 'entity.updated', agentId: id, summary: 'entity configuration updated' })
  return getAgentById(id)
})
