import { randomUUID } from 'node:crypto'
import { getDb } from '../../db'
import { createSession, userCount } from '../../utils/auth'
import { encryptSecret, hashPassword } from '../../utils/crypto'
import { logEvent } from '../../utils/events'
import { asString, nullableString } from '../../utils/validate'
import { getAgentById } from '../../utils/models'

const ARCHON_PROMPT = `You are ARCHON, the primary orchestrator of EREBUS.

You receive high-level objectives, decompose them into discrete tasks, assign
tasks to the appropriate entities, monitor progress, detect failures, reassign
work, and report overall status concisely.

Principles:
- Prefer action over discussion. Begin work on every request you receive.
- When you finish, report exactly what was done and what remains.
- Be precise. The operator reads your output from another room.`

interface SetupBody {
  username?: unknown
  password?: unknown
  projectName?: unknown
  projectDir?: unknown
  provider?: { kind?: unknown; apiKey?: unknown }
}

/** First-run initialization: create the operator account, first project, and ARCHON. */
export default defineEventHandler(async (event) => {
  if (userCount() > 0) {
    throw createError({ statusCode: 403, message: 'EREBUS is already initialized' })
  }

  const body = (await readBody(event).catch(() => ({}))) as SetupBody
  const username = asString(body.username, 'username', { required: true, min: 3, max: 32 })
  const password = asString(body.password, 'password', { required: true, min: 8, max: 128 })
  const projectName = nullableString(body.projectName, 'projectName', { max: 64 })
  const projectDir = nullableString(body.projectDir, 'projectDir', { max: 1024 })

  const db = getDb()

  // Optional provider key configured during setup (never logged or returned).
  let providerId: string | null = null
  if (body.provider && typeof body.provider === 'object') {
    const kind = nullableString(body.provider.kind, 'provider.kind', { max: 32 })
    const apiKey = nullableString(body.provider.apiKey, 'provider.apiKey', { max: 512 })
    if (kind && apiKey) {
      const existing = db
        .prepare('SELECT id FROM providers WHERE kind = ?')
        .get(kind) as { id: string } | undefined
      if (existing) {
        db.prepare(
          "UPDATE providers SET api_key_enc = ?, api_key_hint = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        ).run(encryptSecret(apiKey), `••••${apiKey.slice(-4)}`, existing.id)
        providerId = existing.id
      }
    }
  }

  const userId = randomUUID()
  const passwordHash = await hashPassword(password)

  const tx = db.transaction(() => {
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)').run(
      userId,
      username,
      passwordHash,
    )

    let projectId: string | null = null
    if (projectName) {
      projectId = randomUUID()
      db.prepare(
        'INSERT INTO projects (id, name, root_dir) VALUES (?, ?, ?)',
      ).run(projectId, projectName, projectDir ?? '')
    }

    const archonId = randomUUID()
    db.prepare(
      `INSERT INTO agents
         (id, name, role, description, system_prompt, provider_id, project_id, working_dir, tools_json, permissions_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      archonId,
      'ARCHON',
      'Orchestrator',
      'Primary orchestrator of EREBUS. Decomposes objectives into tasks, assigns them to entities, monitors progress and reports status.',
      ARCHON_PROMPT,
      providerId,
      projectId,
      projectDir ?? '',
      JSON.stringify(['filesystem', 'git', 'terminal']),
      JSON.stringify({
        filesystem: 'ask',
        git: 'ask',
        terminal: 'ask',
        network: 'deny',
        mcp: 'allow',
      }),
    )
  })
  tx()

  createSession(event, userId)

  logEvent({ type: 'system.initialized', summary: 'EREBUS initialized — operator account established' })
  if (projectName) {
    logEvent({ type: 'project.created', summary: `project ${projectName} created` })
  }
  logEvent({ type: 'entity.created', summary: 'entity ARCHON created' })

  const archon = db.prepare('SELECT id FROM agents WHERE name = ?').get('ARCHON') as { id: string }
  return { ok: true, archon: getAgentById(archon.id) }
})
