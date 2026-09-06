import { requireUser } from '../../../utils/auth'
import { restartAgent } from '../../../runtime/agent-runner'
import { getAgentById } from '../../../utils/models'
import { asString } from '../../../utils/validate'

export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  await restartAgent(id)
  return getAgentById(id)
})
