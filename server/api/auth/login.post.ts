import { getDb } from '../../db'
import { createSession } from '../../utils/auth'
import { verifyPassword } from '../../utils/crypto'
import { logEvent } from '../../utils/events'
import { asString } from '../../utils/validate'

interface LoginBody {
  username?: unknown
  password?: unknown
}

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) as LoginBody
  const username = asString(body.username, 'username', { required: true })
  const password = asString(body.password, 'password', { required: true })

  const db = getDb()
  const row = db
    .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
    .get(username) as { id: string; username: string; password_hash: string } | undefined

  // Same error whether the user or the password is wrong.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    throw createError({ statusCode: 401, message: 'Invalid username or password' })
  }

  db.prepare(
    "UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(row.id)

  createSession(event, row.id)
  logEvent({ type: 'auth.login', summary: `operator ${row.username} signed in` })

  return { ok: true, username: row.username }
})
