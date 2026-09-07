import { requireUser } from '../../../utils/auth'
import { isAutoApproving } from '../../../runtime/agent-status'
import { asString } from '../../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  return { autoApproving: isAutoApproving(id) }
})
