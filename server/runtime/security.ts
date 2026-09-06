import { getDb } from '../db'

/**
 * Security policies.
 *
 * - Terminal deny patterns: operator-maintained regex list stored in the
 *   settings table; every terminal tool call is checked against it.
 * - Login throttling: in-memory per-username failure counter with a lockout
 *   window (single-process; a restart clears it — honest local hardening).
 */

const DENY_PATTERNS_KEY = 'security.terminal_deny_patterns'

const DEFAULT_DENY_PATTERNS = [
  String.raw`^\s*format\b`,
  String.raw`rm\s+(-[a-z]*\s+)*(-rf\s+)?(/|\\)`,
  String.raw`diskpart`,
  String.raw`reg\s+(delete|add)`,
  String.raw`shutdown`,
  String.raw`bcdedit`,
  String.raw`takeown`,
  String.raw`cipher\s+/w`,
]

export function getDenyPatterns(): string[] {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(DENY_PATTERNS_KEY) as
    | { value: string }
    | undefined
  if (!row) return DEFAULT_DENY_PATTERNS
  try {
    const parsed = JSON.parse(row.value) as unknown
    if (Array.isArray(parsed)) return parsed.filter((p): p is string => typeof p === 'string')
  } catch {
    /* malformed — defaults */
  }
  return DEFAULT_DENY_PATTERNS
}

export function setDenyPatterns(patterns: string[]): string[] {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(DENY_PATTERNS_KEY, JSON.stringify(patterns))
  return patterns
}

/** Returns the matching pattern when the command is blocked. */
export function deniedCommandPattern(command: string): string | null {
  for (const pattern of getDenyPatterns()) {
    try {
      if (new RegExp(pattern, 'i').test(command)) return pattern
    } catch {
      /* invalid pattern — skip */
    }
  }
  return null
}

// ── Login throttling ──────────────────────────────────────────────────

const MAX_FAILURES = 5
const LOCKOUT_MS = 60_000
const WINDOW_MS = 5 * 60_000

interface AttemptRecord {
  failures: number
  firstFailureAt: number
  lockedUntil: number
}

const loginAttempts = new Map<string, AttemptRecord>()

/** Throws 429 when the username is currently locked out. */
export function checkLoginThrottle(username: string): void {
  const key = username.toLowerCase()
  const record = loginAttempts.get(key)
  if (!record) return
  if (record.lockedUntil > Date.now()) {
    throw createError({
      statusCode: 429,
      message: `Too many failed attempts — try again in ${Math.ceil((record.lockedUntil - Date.now()) / 1000)}s`,
    })
  }
}

export function recordLoginFailure(username: string): void {
  const key = username.toLowerCase()
  const now = Date.now()
  const record = loginAttempts.get(key) ?? { failures: 0, firstFailureAt: now, lockedUntil: 0 }
  if (now - record.firstFailureAt > WINDOW_MS) {
    record.failures = 0
    record.firstFailureAt = now
  }
  record.failures += 1
  if (record.failures >= MAX_FAILURES) {
    record.lockedUntil = now + LOCKOUT_MS
    record.failures = 0
  }
  loginAttempts.set(key, record)
}

export function resetLoginFailures(username: string): void {
  loginAttempts.delete(username.toLowerCase())
}
