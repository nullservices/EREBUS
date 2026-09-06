import { appendFileSync, existsSync, renameSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { getDataDir } from '../db'

/**
 * Structured JSONL log in the data directory (rotated at 10 MB, one copy).
 * The global event log is the primary record; every event is appended here
 * too, alongside provider-level entries.
 */

const MAX_BYTES = 10 * 1024 * 1024

function logPath(): string {
  return join(getDataDir(), 'erebus.log')
}

export function appendLog(entry: Record<string, unknown>): void {
  try {
    const path = logPath()
    if (existsSync(path) && statSync(path).size > MAX_BYTES) {
      const rotated = `${path}.1`
      if (existsSync(rotated)) {
        renameSync(rotated, `${rotated}.old`)
      }
      renameSync(path, rotated)
    }
    appendFileSync(path, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
  } catch (err) {
    console.warn('[erebus] log write failed:', err instanceof Error ? err.message : err)
  }
}

export function tailLog(lines: number): string[] {
  try {
    const path = logPath()
    if (!existsSync(path)) return []
    const content = readFileSync(path, 'utf8')
    const all = content.split('\n').filter(Boolean)
    return all.slice(-lines)
  } catch {
    return []
  }
}
