import { getCookie } from 'h3'
import { getDb } from '../../db'
import { requireUser, SESSION_COOKIE } from '../../utils/auth'
import { hashPassword, sha256hex, verifyPassword } from '../../utils/crypto'
import { asString } from '../../utils/validate'

interface PasswordBody {
  current?: unknown
  next?: unknown
}

/** Change the operator password; all other sessions are invalidated. */
export default defineEventHandler(async (event) => {
  const user = requireUser(event)
  const body = (await readBody(event).catch(() => ({}))) as PasswordBody
  const current = asString(body.current, 'current', { required: true })
  const next = asString(body.next, 'next', { required: true, min: 8, max: 128 })

  const db = getDb()
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as
    | { password_hash: string }
    | undefined
  if (!row || !(await verifyPassword(current, row.password_hash))) {
    throw createError({ statusCode: 401, message: 'Current password is incorrect' })
  }

  const nextHash = await hashPassword(next)
  const token = getCookie(event, SESSION_COOKIE)
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(nextHash, user.id)
    // Invalidate every session except the one making the change.
    if (token) {
      db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(
        user.id,
        sha256hex(token),
      )
    }
  })
  tx()

  return { ok: true }
})
