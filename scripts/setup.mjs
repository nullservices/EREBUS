import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * EREBUS environment bootstrap.
 * Verifies the runtime and prepares the data directory (SQLite + secret keys).
 * Safe to re-run at any time.
 */
const [major] = process.versions.node.split('.').map(Number)

if (major < 20) {
  console.error(`EREBUS requires Node.js 20 or newer. Current: ${process.versions.node}`)
  process.exit(1)
}

const dataDir = resolve(process.env.EREBUS_DATA_DIR || join(process.cwd(), 'data'))
mkdirSync(dataDir, { recursive: true })

const secretKey = join(dataDir, 'erebus-secret.key')
if (!existsSync(secretKey)) {
  writeFileSync(secretKey, randomBytes(32).toString('hex'))
  console.log('Generated encryption key: erebus-secret.key')
}

console.log('EREBUS environment ready.')
console.log(`Data directory: ${dataDir}`)
console.log('Next: npm run dev  →  http://127.0.0.1:4521')
