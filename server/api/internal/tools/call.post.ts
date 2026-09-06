import { requireUser } from '../../../utils/auth'
import { executeToolCall } from '../../../runtime/tools/execute'
import { asString } from '../../../utils/validate'

interface CallBody {
  agentId?: unknown
  name?: unknown
  args?: unknown
}

/**
 * Internal: execute one tool call for an entity.
 * The permission gate (allow/readonly/ask/deny) applies here — the bridge
 * never bypasses it.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = (await readBody(event).catch(() => ({}))) as CallBody

  const agentId = asString(body.agentId, 'agentId', { required: true, max: 64 })
  const name = asString(body.name, 'name', { required: true, max: 64 })
  const args =
    body.args && typeof body.args === 'object' && !Array.isArray(body.args)
      ? (body.args as Record<string, unknown>)
      : {}

  const result = await executeToolCall(agentId, name, args)
  return result
})
