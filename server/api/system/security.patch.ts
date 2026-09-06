import { requireUser } from '../../utils/auth'
import { setDenyPatterns } from '../../runtime/security'

interface SecurityBody {
  denyPatterns?: unknown
}

export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = (await readBody(event).catch(() => ({}))) as SecurityBody

  if (!Array.isArray(body.denyPatterns)) {
    throw createError({ statusCode: 400, message: 'denyPatterns must be an array' })
  }
  const patterns = body.denyPatterns
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 50)
  if (patterns.length === 0) {
    throw createError({ statusCode: 400, message: 'At least one pattern is required' })
  }

  return { denyPatterns: setDenyPatterns(patterns) }
})
