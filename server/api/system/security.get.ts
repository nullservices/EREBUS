import { requireUser } from '../../utils/auth'
import { getDenyPatterns } from '../../runtime/security'

/** Security policy (no secrets — patterns only). */
export default defineEventHandler((event) => {
  requireUser(event)
  return { denyPatterns: getDenyPatterns() }
})
