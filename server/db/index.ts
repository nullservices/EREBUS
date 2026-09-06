import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { MIGRATIONS } from './schema'

/**
 * Single SQLite connection for the whole process.
 * Cached on globalThis so Nitro dev hot-reloads reuse the open handle
 * instead of leaking a new one per reload.
 */
declare global {
  // eslint-disable-next-line no-var
  var __erebusDb: Database.Database | undefined
  // eslint-disable-next-line no-var
  var __erebusMigrationsApplied: number
}

export function getDataDir(): string {
  const dir =
    process.env.EREBUS_DATA_DIR ||
    process.env.NUXT_DATA_DIR ||
    join(process.cwd(), 'data')
  mkdirSync(dir, { recursive: true })
  return dir
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )
  `)
  const appliedRows = db
    .prepare('SELECT version FROM _migrations')
    .all() as { version: number }[]
  const applied = new Set(appliedRows.map((r) => r.version))

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue
    db.transaction(() => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(
        migration.version,
        migration.name,
      )
    })()
  }
}

export function getDb(): Database.Database {
  if (globalThis.__erebusDb) {
    // Nitro dev reloads recreate modules but keep globalThis — apply any
    // migrations added while the server was running.
    if (globalThis.__erebusMigrationsApplied !== MIGRATIONS.length) {
      runMigrations(globalThis.__erebusDb)
      globalThis.__erebusMigrationsApplied = MIGRATIONS.length
    }
    return globalThis.__erebusDb
  }

  const db = new Database(join(getDataDir(), 'erebus.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)

  globalThis.__erebusDb = db
  globalThis.__erebusMigrationsApplied = MIGRATIONS.length
  return db
}
