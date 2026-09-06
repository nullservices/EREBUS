import { randomBytes, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getCookie, setCookie } from 'h3'
import { getDb } from '../db'
import { sha256hex } from './crypto'

/**
 * Session authentication.
 * The client holds a random 256-bit token in an HttpOnly cookie; the server
 * stores only its SHA-256 hash. Sessions expire after 30 days.
 */

export const SESSION_COOKIE = 'erebus_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

export interface SessionUser {
  id: string
  username: string
  createdAt: string
  lastLoginAt: string | null
}

interface SessionRow {
  id: string
  username: string
  created_at: string
  last_login_at: string | null
  expires_at: string
}

function getSessionByTokenHash(tokenHash: string): SessionRow | undefined {
  return getDb()
    .prepare(
      `SELECT u.id, u.username, u.created_at, u.last_login_at, s.expires_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(tokenHash) as SessionRow | undefined
}

export function createSession(
  event: H3Event,
  userId: string,
): string {
  const db = getDb()
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  const userAgent = event.headers.get('user-agent') ?? null

  db.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, expires_at, user_agent)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), sha256hex(token), userId, expiresAt, userAgent)

  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  })
  return token
}

export function destroySessionToken(token: string | undefined): void {
  if (!token) return
  getDb()
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .run(sha256hex(token))
}

/** Validate a raw session token (shared by HTTP handlers and the WS upgrade). */
export function validateSessionToken(token: string): SessionUser | null {
  const row = getSessionByTokenHash(sha256hex(token))
  if (!row) return null

  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySessionToken(token)
    return null
  }

  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  }
}

export function getUser(event: H3Event): SessionUser | null {
  const token = getCookie(event, SESSION_COOKIE)
  if (!token) return null
  return validateSessionToken(token)
}

export function requireUser(event: H3Event): SessionUser {
  const user = getUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }
  return user
}

export function clearSessionCookie(event: H3Event): void {
  setCookie(event, SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export function userCount(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }
  return row.c
}
