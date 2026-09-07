import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import readline from 'node:readline'

/**
 * Reset the operator password without touching anything else.
 * Usage:
 *   npm run reset-password                 (single-account installs)
 *   npm run reset-password <username>      (disambiguates)
 * All existing sessions are signed out.
 */

const dataDir = resolve(process.env.EREBUS_DATA_DIR || join(process.cwd(), 'data'))
const dbPath = join(dataDir, 'erebus.db')

if (!existsSync(dbPath)) {
  console.error(`No EREBUS database found at ${dbPath}`)
  console.error('Start EREBUS once (npm run dev), then retry.')
  process.exit(1)
}

const db = new Database(dbPath)
const users = db.prepare('SELECT id, username FROM users ORDER BY created_at').all()

if (users.length === 0) {
  console.log('No operator account exists — the initialization screen will handle setup.')
  process.exit(0)
}

let target = process.argv[2]
if (!target && users.length === 1) target = users[0].username
if (!target) {
  console.error('Multiple operator accounts found — pass a username:')
  console.error(`  npm run reset-password ${users.map((u) => u.username).join('|')}`)
  process.exit(1)
}

const user = users.find((u) => u.username.toLowerCase() === target.toLowerCase())
if (!user) {
  console.error(`Unknown operator "${target}" (found: ${users.map((u) => u.username).join(', ')})`)
  process.exit(1)
}

/** Masked prompt (asterisks) where the terminal supports raw mode. */
function maskedPrompt(promptText) {
  return new Promise((resolve) => {
    process.stdout.write(promptText)
    if (typeof process.stdin.setRawMode !== 'function') {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question('', (answer) => {
        rl.close()
        process.stdout.write('\n')
        resolve(answer.trim())
      })
      return
    }
    process.stdin.setEncoding('utf8')
    process.stdin.setRawMode(true)
    process.stdin.resume()
    let buffer = ''
    const onData = (data) => {
      for (const ch of data) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.pause()
          process.stdin.off('data', onData)
          process.stdout.write('\n')
          resolve(buffer)
          return
        }
        if (ch === '') {
          process.stdout.write('\n')
          process.exit(130)
        }
        if (ch === '' || ch === '\b') {
          buffer = buffer.slice(0, -1)
        } else {
          buffer += ch
          process.stdout.write('*')
        }
      }
    }
    process.stdin.on('data', onData)
  })
}

const first = await maskedPrompt(`New password for operator ${user.username} (8+ characters): `)
if (first.length < 8) {
  console.error('\nPassword must be at least 8 characters.')
  process.exit(1)
}
const second = await maskedPrompt('Confirm password: ')
if (first !== second) {
  console.error('\nPasswords do not match.')
  process.exit(1)
}

const hash = await bcrypt.hash(first, 10)
db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id)
db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
db.close()

console.log(`\nPassword updated for operator ${user.username}. All sessions were signed out.`)
console.log('Sign in at the login screen with the new password.')
