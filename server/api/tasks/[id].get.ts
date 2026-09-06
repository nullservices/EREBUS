import { requireUser } from '../../utils/auth'
import { getTaskById } from '../../utils/tasks'
import { asString } from '../../utils/validate'

export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const task = getTaskById(id)
  if (!task) {
    throw createError({ statusCode: 404, message: 'Task not found' })
  }
  return task
})
