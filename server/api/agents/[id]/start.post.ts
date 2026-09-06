import { requireUser } from '../../../utils/auth'
import { startAgent } from '../../../runtime/agent-runner'
import { getAgentById } from '../../../utils/models'
import { asString } from '../../../utils/validate'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  await startAgent(id)
  return getAgentById(id)
})
