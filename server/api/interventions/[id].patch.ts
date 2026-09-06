import { requireUser } from '../../utils/auth'
import { resolveIntervention } from '../../runtime/interventions'
import { resumeAgentQueue } from '../../runtime/agent-runner'
import { asString } from '../../utils/validate'

interface ResolveBody {
  resolution?: unknown
}

/** The operator answers an entity's request; its runtime resumes. */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as ResolveBody
  const resolution = asString(body.resolution, 'resolution', { required: true, max: 8000 })

  const intervention = resolveIntervention(id, resolution)
  resumeAgentQueue(intervention.agentId)
  return intervention
})
