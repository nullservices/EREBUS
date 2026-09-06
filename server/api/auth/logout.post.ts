import { getCookie } from 'h3'
import { clearSessionCookie, destroySessionToken, SESSION_COOKIE } from '../../utils/auth'

export default defineEventHandler((event) => {
  destroySessionToken(getCookie(event, SESSION_COOKIE))
  clearSessionCookie(event)
  return { ok: true }
})
