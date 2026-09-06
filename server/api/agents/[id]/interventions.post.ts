import { requireUser } from '../../../utils/auth'
import { createIntervention } from '../../../runtime/interventions'
import { asString } from '../../../utils/validate'

interface InterventionBody {
  prompt?: unknown
  kind?: unknown
  options?: unknown
}

/**
 * Raise an intervention for an entity (WAITING_FOR_HUMAN).
 * Used by the internal runtime (operator questions parsed from agent output)
 * and by future agent tools; exposed here for smoke coverage.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as InterventionBody

  const prompt = asString(body.prompt, 'prompt', { required: true, max: 4000 })
  const kind = asString(body.kind, 'kind', { max: 16 }) === 'approval' ? 'approval' as const : 'input' as const
  const options = Array.isArray(body.options)
    ? (body.options.filter((o): o is string => typeof o === 'string').slice(0, 8) as string[])
    : undefined

  return createIntervention({ agentId: id, kind, prompt, options })
})
