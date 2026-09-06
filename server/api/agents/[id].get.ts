import { requireUser } from '../../utils/auth'
import { getAgentById } from '../../utils/models'
import { asString } from '../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const agent = getAgentById(id)
  if (!agent) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }
  return agent
})
