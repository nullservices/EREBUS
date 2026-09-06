import { requireUser } from '../../utils/auth'

export default defineEventHandler((event) => {
  return requireUser(event)
})
