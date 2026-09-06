import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { definitionsForEntity, TOOL_DEFINITIONS } from '../../../runtime/tools/definitions'
import { asString } from '../../../utils/validate'
import type { ToolId } from '../../../../shared/types'

interface ListBody {
  agentId?: unknown
  protocolOnly?: unknown
}

/**
 * Internal: tool definitions for one entity.
 * Used by the Claude Code MCP bridge (authenticated with a session token).
 * protocolOnly limits the list to EREBUS protocol tools (entities, tasks,
 * messages, operator questions) — the CLI supplies its own file/git/shell
 * tools natively.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const body = (await readBody(event).catch(() => ({}))) as ListBody
  const agentId = asString(body.agentId, 'agentId', { required: true, max: 64 })
  const protocolOnly = body.protocolOnly === true

  const agent = getDb().prepare('SELECT tools_json FROM agents WHERE id = ?').get(agentId) as
    | { tools_json: string }
    | undefined
  if (!agent) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }

  let tools: string[] = []
  try {
    tools = JSON.parse(agent.tools_json) as string[]
  } catch {
    /* fall through to empty */
  }

  const entityTools = tools.filter((t): t is ToolId => typeof t === 'string') as ToolId[]
  const definitions = protocolOnly
    ? TOOL_DEFINITIONS.filter((d) => d.permission === 'mcp' && entityTools.includes('mcp'))
    : definitionsForEntity(entityTools)

  return definitions.map((d) => ({
    name: d.name,
    description: d.description,
    inputSchema: d.inputSchema,
  }))
})
