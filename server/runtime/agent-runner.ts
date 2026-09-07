import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { logEvent } from '../utils/events'
import { getAgentById, type ProviderRow } from '../utils/models'
import { createAdapterFor } from './providers/types'
import { stopProcess, type ManagedProcess } from './process-manager'
import { setAgentStatus } from './agent-status'
import { pendingInterventionsFor } from './interventions'
import { processAgentOutput } from './orchestration'
import type { Agent } from '../../shared/types'

/**
 * Agent runtime — the bridge between entities, providers and host processes.
 *
 * - One runner per started entity (in-memory; EREBUS restarts reset entities
 *   to OFFLINE — see runtime-recovery plugin).
 * - Instructions arrive through the message endpoint and are processed from
 *   a per-entity queue, one at a time.
 * - All activity is real: statuses, streamed output and errors come from the
 *   provider adapter / host process. Nothing is fabricated.
 */

interface ActiveRunner {
  agentId: string
  state: 'idle' | 'busy' | 'waiting' | 'stopping'
  abort: AbortController | null
  sessionId: string | null
  processes: ManagedProcess[]
}

const runners = new Map<string, ActiveRunner>()
const queues = new Map<string, { messageId: string; content: string }[]>()

export function isAgentStarted(agentId: string): boolean {
  return runners.has(agentId)
}

function getProviderRowForAgent(agent: Agent): ProviderRow | undefined {
  if (!agent.providerId) return undefined
  return getDb().prepare('SELECT * FROM providers WHERE id = ?').get(agent.providerId) as
    | ProviderRow
    | undefined
}

function insertMessageRow(agentId: string, role: string, kind: string, content: string): string {
  const id = randomUUID()
  getDb()
    .prepare('INSERT INTO messages (id, agent_id, role, kind, content) VALUES (?, ?, ?, ?, ?)')
    .run(id, agentId, role, kind, content)
  return id
}

function appendMessageContent(messageId: string, content: string): void {
  const db = getDb()
  const row = db.prepare('SELECT content FROM messages WHERE id = ?').get(messageId) as
    | { content: string }
    | undefined
  if (!row) return
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(row.content + content, messageId)
}

function updateSessionUsage(
  sessionId: string | null,
  usageIn: number,
  usageOut: number,
): void {
  if (!sessionId) return
  const db = getDb()
  const row = db
    .prepare('SELECT token_usage_in, token_usage_out FROM agent_sessions WHERE id = ?')
    .get(sessionId) as
    | { token_usage_in: number | null; token_usage_out: number | null }
    | undefined
  if (!row) return
  db.prepare(
    'UPDATE agent_sessions SET token_usage_in = ?, token_usage_out = ? WHERE id = ?',
  ).run((row.token_usage_in ?? 0) + usageIn, (row.token_usage_out ?? 0) + usageOut, sessionId)
}

export async function startAgent(agentId: string): Promise<void> {
  if (runners.has(agentId)) {
    throw createError({ statusCode: 409, message: 'Entity runtime is already started' })
  }
  const agent = getAgentById(agentId)
  if (!agent) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }
  if (!agent.providerId) {
    throw createError({ statusCode: 400, message: 'Entity has no provider configured' })
  }

  const sessionId = randomUUID()
  getDb()
    .prepare(
      `INSERT INTO agent_sessions (id, agent_id, provider_id, provider_kind, model, status)
       VALUES (?, ?, ?, ?, ?, 'RUNNING')`,
    )
    .run(sessionId, agentId, agent.providerId, agent.providerKind, agent.modelOverride || '')

  runners.set(agentId, { agentId, state: 'idle', abort: null, sessionId, processes: [] })
  setAgentStatus(agentId, 'IDLE')
  logEvent({ type: 'agent.started', agentId, summary: `entity ${agent.name} started` })
}

export async function stopAgent(agentId: string): Promise<void> {
  const runner = runners.get(agentId)
  if (!runner) return

  runner.state = 'stopping'
  runner.abort?.abort()
  setAgentStatus(agentId, 'STOPPING')

  await Promise.all(runner.processes.map((p) => stopProcess(p)))
  runner.processes = []

  if (runner.sessionId) {
    getDb()
      .prepare(
        "UPDATE agent_sessions SET status = 'ENDED', ended_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'RUNNING'",
      )
      .run(runner.sessionId)
  }

  runners.delete(agentId)
  queues.delete(agentId)
  setAgentStatus(agentId, 'OFFLINE')
  const agent = getAgentById(agentId)
  logEvent({ type: 'agent.stopped', agentId, summary: `entity ${agent?.name ?? agentId} stopped` })
}

export async function restartAgent(agentId: string): Promise<void> {
  await stopAgent(agentId)
  await startAgent(agentId)
}

/** Called by the message endpoint after persisting an operator instruction. */
export function submitInstruction(agentId: string, messageId: string, content: string): boolean {
  const runner = runners.get(agentId)
  if (!runner) return false

  const queue = queues.get(agentId) ?? []
  queue.push({ messageId, content })
  queues.set(agentId, queue)

  if (runner.state === 'idle') {
    void processQueue(agentId)
  }
  return true
}

/** Read the runner state without TS property narrowing (it mutates across awaits). */
function stateOf(runner: ActiveRunner): ActiveRunner['state'] {
  return runner.state
}

async function processQueue(agentId: string): Promise<void> {
  const runner = runners.get(agentId)
  if (!runner) return

  for (;;) {
    if (stateOf(runner) === 'stopping') return

    // Unresolved operator requests pause the queue until answered.
    if (pendingInterventionsFor(agentId).length > 0) {
      runner.state = 'waiting'
      setAgentStatus(agentId, 'WAITING_FOR_HUMAN')
      return
    }
    if (stateOf(runner) === 'waiting') return

    const queue = queues.get(agentId) ?? []
    const next = queue.shift()
    queues.set(agentId, queue)
    if (!next) return

    runner.state = 'busy'
    try {
      await runInstruction(agentId, runner, next)
    } finally {
      if (stateOf(runner) !== 'stopping' && stateOf(runner) !== 'waiting') {
        runner.state = 'idle'
      }
    }
  }
}

/** Called by the intervention API after the operator resolves a request. */
export function resumeAgentQueue(agentId: string): void {
  const runner = runners.get(agentId)
  if (!runner || stateOf(runner) !== 'waiting') return
  runner.state = 'idle'
  void processQueue(agentId)
}

async function runInstruction(
  agentId: string,
  runner: ActiveRunner,
  instruction: { messageId: string; content: string },
): Promise<void> {
  const agent = getAgentById(agentId)
  if (!agent) return

  // A fresh abort controller per instruction — stop() cancels the active run.
  runner.abort = new AbortController()
  const signal = runner.abort.signal

  try {
    if (!agent.providerKind) {
      throw new Error('Entity provider has no runtime adapter')
    }
    const adapter = createAdapterFor(agent.providerKind)
    if (!adapter) {
      throw new Error(`No adapter for provider kind ${agent.providerKind}`)
    }
    const provider = getProviderRowForAgent(agent)
    if (!provider) {
      throw new Error('Provider configuration missing')
    }

    const resumeSessionId = runner.sessionId
      ? ((getDb()
          .prepare('SELECT external_session_id FROM agent_sessions WHERE id = ?')
          .get(runner.sessionId)) as { external_session_id: string | null } | undefined)
          ?.external_session_id ?? null
      : null

    setAgentStatus(agentId, 'THINKING')
    logEvent({
      type: 'agent.thinking',
      agentId,
      summary: `entity ${agent.name} is thinking`,
    })

    const replyId = insertMessageRow(agentId, 'agent', 'text', '')
    let buffer = ''
    let lastFlush = Date.now()

    const appConfig = useRuntimeConfig()
    const result = await adapter.run(provider, {
      agentId,
      erebusBaseUrl: `http://127.0.0.1:${appConfig.port || 4521}`,
      history: loadHistory(agentId),
      instruction: instruction.content,
      systemPrompt: agent.systemPrompt,
      workingDir: agent.workingDir || '',
      resumeSessionId,
      model: agent.modelOverride || undefined,
      tools: agent.tools,
      permissions: agent.permissions,
      signal,
      onProcess: (process) => runner.processes.push(process),
      onEvent: (event) => {
        if (event.type === 'text' && event.content) {
          buffer += event.content
          const now = Date.now()
          if (now - lastFlush > 400) {
            appendMessageContent(replyId, buffer)
            buffer = ''
            lastFlush = now
          }
          return
        }
        if (event.type === 'status' && event.data) {
          const data = event.data
          if (typeof data.tool === 'string') {
            insertMessageRow(agentId, 'tool', 'tool_call', data.tool)
            setAgentStatus(agentId, 'WORKING')
          } else if (data.phase === 'thinking') {
            setAgentStatus(agentId, 'THINKING')
          } else if (data.phase === 'working') {
            setAgentStatus(agentId, 'WORKING')
          } else if (typeof data.output === 'string' && data.output.trim()) {
            insertMessageRow(agentId, 'command', 'command_output', data.output)
          }
        }
      },
    })

    if (buffer) appendMessageContent(replyId, buffer)

    if (result.sessionId && runner.sessionId) {
      getDb()
        .prepare('UPDATE agent_sessions SET external_session_id = ? WHERE id = ?')
        .run(result.sessionId, runner.sessionId)
    }
    updateSessionUsage(runner.sessionId, result.tokenUsageIn ?? 0, result.tokenUsageOut ?? 0)

    if (runner.state !== 'stopping') setAgentStatus(agentId, 'IDLE')
    logEvent({
      type: 'agent.completed',
      agentId,
      summary: `entity ${agent.name} completed a task`,
    })

    // Honor the communication protocol in the finished output
    // (delegations to other entities, operator questions).
    processAgentOutput(agentId, result.text)
  } catch (err) {
    if (stateOf(runner) === 'stopping') return
    const message = err instanceof Error ? err.message : String(err)

    setAgentStatus(agentId, 'ERROR')
    insertMessageRow(agentId, 'error', 'error', message)
    logEvent({
      type: 'agent.error',
      agentId,
      summary: `entity ${agent.name} failed: ${message.slice(0, 120)}`,
    })
  }
}

function loadHistory(
  agentId: string,
  limit = 30,
): { role: 'user' | 'assistant'; content: string }[] {
  const rows = getDb()
    .prepare(
      `SELECT role, sender_agent_id, content FROM messages
       WHERE agent_id = ? AND kind = 'text' AND role IN ('user','agent')
       ORDER BY created_at DESC, id DESC LIMIT ?`,
    )
    .all(agentId, limit) as { role: string; sender_agent_id: string | null; content: string }[]
  return rows
    .reverse()
    .map((r) => ({
      // The provider API only knows user/assistant. This entity's own
      // replies are assistant turns; instructions received from another
      // entity are functionally user turns.
      role: r.role === 'agent'
        ? r.sender_agent_id
          ? ('user' as const)
          : ('assistant' as const)
        : ('user' as const),
      content: r.content,
    }))
    .filter((m) => m.content.length > 0)
}

/** Server shutdown: abort everything and mark agents offline. */
export async function shutdownRuntime(): Promise<void> {
  await Promise.all([...runners.keys()].map((id) => stopAgent(id)))
}
