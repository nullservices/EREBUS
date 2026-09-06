import { createError } from 'h3'
import type { Permissions, PermissionLevel, ToolId } from '../../shared/types'

/** Throw an HTTP error with a clean message. */
export function fail(statusCode: number, message: string): never {
  throw createError({ statusCode, message })
}

/** Validate an optional/required string body field. */
export function asString(
  value: unknown,
  field: string,
  opts: { required?: boolean; min?: number; max?: number } = {},
): string {
  const s = typeof value === 'string' ? value.trim() : ''
  if (opts.required && !s) fail(400, `${field} is required`)
  if (s && opts.min !== undefined && s.length < opts.min) {
    fail(400, `${field} must be at least ${opts.min} characters`)
  }
  if (s && opts.max !== undefined && s.length > opts.max) {
    fail(400, `${field} must be at most ${opts.max} characters`)
  }
  return s
}

/** Validate a nullable string body field: null/undefined/'' → null. */
export function nullableString(
  value: unknown,
  field: string,
  opts: { max?: number } = {},
): string | null {
  if (value === null || value === undefined || value === '') return null
  const s = asString(value, field, opts)
  return s || null
}

const TOOL_ID_SET = new Set<string>(['filesystem', 'git', 'terminal', 'network', 'mcp'])
const PERMISSION_LEVEL_SET = new Set<string>(['allow', 'auto', 'ask', 'readonly', 'deny'])

/** Validate a tools array from the client; default when absent. */
export function parseTools(value: unknown): ToolId[] {
  if (value === undefined || value === null) {
    return ['filesystem', 'git', 'terminal']
  }
  if (!Array.isArray(value)) fail(400, 'tools must be an array')
  const tools: ToolId[] = []
  for (const t of value) {
    if (typeof t !== 'string' || !TOOL_ID_SET.has(t)) {
      fail(400, `unknown tool: ${String(t)}`)
    }
    if (!tools.includes(t as ToolId)) tools.push(t as ToolId)
  }
  return tools
}

/** Validate a permissions map from the client; default when absent. */
export function parsePermissions(value: unknown): Permissions {
  if (value === undefined || value === null) {
    return {
      filesystem: 'ask',
      git: 'ask',
      terminal: 'ask',
      network: 'deny',
      mcp: 'allow',
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    fail(400, 'permissions must be an object')
  }
  const permissions: Permissions = {}
  for (const [tool, level] of Object.entries(value as Record<string, unknown>)) {
    if (!TOOL_ID_SET.has(tool)) fail(400, `unknown permission tool: ${tool}`)
    if (typeof level !== 'string' || !PERMISSION_LEVEL_SET.has(level)) {
      fail(400, `invalid permission level for ${tool}: ${String(level)}`)
    }
    permissions[tool as ToolId] = level as PermissionLevel
  }
  return permissions
}

/** Validate a numeric field with an inclusive range. */
export function asNumber(
  value: unknown,
  field: string,
  opts: { required?: boolean; min?: number; max?: number } = {},
): number | undefined {
  if (value === undefined || value === null) {
    if (opts.required) fail(400, `${field} is required`)
    return undefined
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    fail(400, `${field} must be a number`)
  }
  if (opts.min !== undefined && value < opts.min) {
    fail(400, `${field} must be at least ${opts.min}`)
  }
  if (opts.max !== undefined && value > opts.max) {
    fail(400, `${field} must be at most ${opts.max}`)
  }
  return value
}

/** True when the SQLite error is a UNIQUE constraint violation. */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  )
}
