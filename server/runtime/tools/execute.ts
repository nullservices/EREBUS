import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { promisify } from 'node:util'
import { resolve, sep } from 'node:path'
import { getDb } from '../../db'
import { getAgentById } from '../../utils/models'
import { createIntervention, resolveIntervention } from '../interventions'
import { setAgentStatus } from '../agent-status'
import { logEvent } from '../../utils/events'
import { logTaskEvent, nextTaskNumber, serializeTask, TASK_SELECT, type TaskRow } from '../../utils/tasks'
import { deniedCommandPattern } from '../security'
import { definitionByName, levelAllows, levelNeedsApproval } from './definitions'
import type { Agent } from '../../../shared/types'

const execFileAsync = promisify(execFile)

/**
 * Tool execution with the permission gate.
 *
 * deny        → the agent is told it may not run this
 * readonly    → read-shaped tools only (mutating tools are refused)
 * allow       → runs directly
 * ask         → the operator approves/denies through an intervention; the
 *               run waits (bounded) for the answer — this is the approval
 *               system's core
 */

export interface ToolResult {
  content: string
  isError: boolean
}

const APPROVAL_TIMEOUT_MS = 15 * 60 * 1000
const APPROVAL_POLL_MS = 500

function resolveWithin(base: string, input: string): string {
  const candidate = resolve(base, input || '.')
  if (candidate !== base && !candidate.startsWith(base + sep)) {
    throw new Error('Path escapes the working directory')
  }
  return candidate
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    })
    return { stdout, stderr, exitCode: 0 }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number | string }
    return {
      stdout: String(e.stdout ?? ''),
      stderr: String(e.stderr ?? ''),
      exitCode: typeof e.code === 'number' ? e.code : 1,
    }
  }
}

async function awaitApproval(agentId: string, prompt: string): Promise<boolean> {
  const intervention = createIntervention({
    agentId,
    kind: 'approval',
    prompt,
    options: ['APPROVE', 'DENY'],
  })

  const deadline = Date.now() + APPROVAL_TIMEOUT_MS
  for (;;) {
    await new Promise((r) => setTimeout(r, APPROVAL_POLL_MS))
    const row = getDb()
      .prepare('SELECT status, resolution FROM interventions WHERE id = ?')
      .get(intervention.id) as { status: string; resolution: string | null } | undefined
    if (!row || row.status !== 'PENDING') {
      return row?.status === 'RESOLVED' && /approve/i.test(row.resolution ?? '')
    }
    if (Date.now() > deadline) {
      resolveIntervention(intervention.id, 'DENY (operator did not respond in time)')
      return false
    }
  }
}

async function executeFsRead(agent: Agent, input: { path?: string }): Promise<ToolResult> {
  const base = resolve(agent.workingDir || process.cwd())
  const target = resolveWithin(base, String(input.path ?? ''))
  const stat = await fs.stat(target)
  if (stat.size > 512 * 1024) {
    throw new Error('File exceeds the 512 KB read limit')
  }
  const content = await fs.readFile(target, 'utf8')
  return { content, isError: false }
}

async function executeFsWrite(agent: Agent, input: { path?: string; content?: string }): Promise<ToolResult> {
  const base = resolve(agent.workingDir || process.cwd())
  const target = resolveWithin(base, String(input.path ?? ''))
  await fs.mkdir(resolve(target, '..'), { recursive: true })
  await fs.writeFile(target, String(input.content ?? ''), 'utf8')
  return { content: `written ${target}`, isError: false }
}

async function executeFsList(agent: Agent, input: { dir?: string }): Promise<ToolResult> {
  const base = resolve(agent.workingDir || process.cwd())
  const target = resolveWithin(base, String(input.dir ?? ''))
  const entries = await fs.readdir(target, { withFileTypes: true })
  const lines = entries.map((e) => `${e.isDirectory() ? 'd' : '-'}  ${e.name}`).sort()
  return { content: lines.join('\n'), isError: false }
}

const GIT_READ_COMMANDS = new Set(['status', 'log', 'diff', 'show', 'branch', 'rev-parse', 'ls-files'])

async function executeGit(agent: Agent, input: { args?: string }): Promise<ToolResult> {
  const argsRaw = String(input.args ?? '').trim()
  if (!argsRaw) throw new Error('git requires arguments')
  const subcommand = argsRaw.split(/\s+/)[0] ?? ''
  const level = agent.permissions.git ?? 'ask'

  if (!GIT_READ_COMMANDS.has(subcommand) && level === 'readonly') {
    throw new Error(`git ${subcommand} requires write access; entity has read-only git`)
  }
  const timeoutMs = 30_000
  const result = await runCommand('git', argsRaw.split(/\s+/), agent.workingDir || process.cwd(), timeoutMs)
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  return {
    content: output || `git ${argsRaw} (exit ${result.exitCode})`,
    isError: result.exitCode !== 0,
  }
}

async function executeTerminal(agent: Agent, input: { command?: string; timeout_ms?: string }): Promise<ToolResult> {
  const command = String(input.command ?? '').trim()
  if (!command) throw new Error('terminal requires a command')

  const deniedBy = deniedCommandPattern(command)
  if (deniedBy) {
    logEvent({
      type: 'agent.tool_blocked',
      agentId: agent.id,
      summary: `blocked command from ${agent.name} (policy match)`,
    })
    return { content: `command blocked by operator policy (pattern: ${deniedBy})`, isError: true }
  }

  const timeoutMs = Math.min(Math.max(Number(input.timeout_ms) || 30_000, 1000), 60_000)
  const result = await runCommand('powershell.exe', ['-NoProfile', '-Command', command], agent.workingDir || process.cwd(), timeoutMs)
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  return {
    content: output || `(exit ${result.exitCode})`,
    isError: result.exitCode !== 0,
  }
}

// ── EREBUS protocol tools ─────────────────────────────────────────────

function entityByName(name: string): { id: string; name: string } | undefined {
  return getDb()
    .prepare('SELECT id, name FROM agents WHERE UPPER(name) = UPPER(?)')
    .get(name) as { id: string; name: string } | undefined
}

async function executeListEntities(): Promise<ToolResult> {
  const rows = getDb()
    .prepare('SELECT name, role, status FROM agents ORDER BY name COLLATE NOCASE')
    .all() as { name: string; role: string; status: string }[]
  const lines = rows.map((r) => `${r.name.padEnd(20)} ${(r.role || '—').padEnd(16)} ${r.status}`)
  return { content: lines.join('\n'), isError: false }
}

async function executeTaskList(input: { status?: string; assigned_agent?: string }): Promise<ToolResult> {
  const conditions: string[] = []
  const params: unknown[] = []
  if (input.status) {
    conditions.push('t.status = ?')
    params.push(input.status.toUpperCase())
  }
  if (input.assigned_agent) {
    conditions.push('a.name = ?')
    params.push(input.assigned_agent.toUpperCase())
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = getDb()
    .prepare(
      `SELECT t.number, t.title, t.status, t.priority, a.name AS agent
       FROM tasks t LEFT JOIN agents a ON a.id = t.assigned_agent_id ${where}
       ORDER BY t.number DESC LIMIT 50`,
    )
    .all(...params) as { number: number; title: string; status: string; priority: string; agent: string | null }[]
  if (rows.length === 0) return { content: '(no tasks)', isError: false }
  const lines = rows.map((r) => `#${r.number} [${r.status}] ${r.title}${r.agent ? ` — ${r.agent}` : ''}`)
  return { content: lines.join('\n'), isError: false }
}

async function executeTaskCreate(agent: Agent, input: Record<string, unknown>): Promise<ToolResult> {
  const title = String(input.title ?? '').trim()
  if (!title) throw new Error('task_create requires a title')
  const status = String(input.status ?? 'TODO').toUpperCase()
  const priority = String(input.priority ?? 'NORMAL').toUpperCase()
  const assigned = input.assigned_agent ? entityByName(String(input.assigned_agent)) : undefined

  const db = getDb()
  const id = randomUUID()
  const number = nextTaskNumber()
  db.prepare(
    `INSERT INTO tasks (id, number, title, description, status, priority, created_by, assigned_agent_id, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    number,
    title,
    String(input.description ?? ''),
    status,
    priority,
    agent.name,
    assigned?.id ?? null,
    agent.projectId,
  )
  logEvent({ type: 'task.created', agentId: agent.id, projectId: agent.projectId, summary: `task #${number} ${title} created by ${agent.name}` })
  return { content: `task #${number} created (${status})`, isError: false }
}

async function executeTaskUpdate(input: { number?: string; status?: string; result?: string }): Promise<ToolResult> {
  const number = Number(input.number)
  if (!Number.isFinite(number)) throw new Error('task_update requires a valid task number')
  const db = getDb()
  const row = db.prepare('SELECT id FROM tasks WHERE number = ?').get(number) as { id: string } | undefined
  if (!row) throw new Error(`task #${number} not found`)

  const status = String(input.status ?? '').toUpperCase()
  db.prepare(
    `UPDATE tasks SET status = ?, result = ?,
       completed_at = CASE WHEN ? IN ('DONE','FAILED','CANCELLED') THEN COALESCE(completed_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE NULL END,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  ).run(status, String(input.result ?? ''), status, row.id)

  const taskRow = getDb()
    .prepare(`${TASK_SELECT} WHERE t.id = ?`)
    .get(row.id) as TaskRow | undefined
  if (taskRow) {
    logTaskEvent('task.updated', serializeTask(taskRow), `→ ${status.toLowerCase()}`)
  }
  return { content: `task #${number} → ${status}`, isError: false }
}

async function executeSendMessage(agent: Agent, input: { entity?: string; content?: string }): Promise<ToolResult> {
  const target = entityByName(String(input.entity ?? ''))
  if (!target) throw new Error(`unknown entity ${input.entity}`)
  const content = String(input.content ?? '').trim()
  if (!content) throw new Error('send_message requires content')

  const db = getDb()
  const messageId = randomUUID()
  db.prepare(
    `INSERT INTO messages (id, agent_id, sender_agent_id, role, kind, content)
     VALUES (?, ?, ?, 'agent', 'text', ?)`,
  ).run(messageId, target.id, agent.id, content)
  logEvent({ type: 'agent.message', agentId: target.id, summary: `${agent.name} → ${target.name}: ${content.slice(0, 80)}` })
  return { content: `delivered to ${target.name}`, isError: false }
}

async function executeAskOperator(agent: Agent, input: { question?: string; options?: string }): Promise<ToolResult> {
  const question = String(input.question ?? '').trim()
  if (!question) throw new Error('ask_operator requires a question')
  const options = String(input.options ?? '')
    .split('|')
    .map((o) => o.trim())
    .filter(Boolean)

  const intervention = createIntervention({ agentId: agent.id, kind: 'input', prompt: question, options })
  const approved = await awaitApprovalFor(intervention.id)
  return { content: approved ? 'operator answered' : 'operator denied', isError: !approved }
}

async function awaitApprovalFor(interventionId: string): Promise<boolean> {
  const deadline = Date.now() + APPROVAL_TIMEOUT_MS
  for (;;) {
    await new Promise((r) => setTimeout(r, APPROVAL_POLL_MS))
    const row = getDb()
      .prepare('SELECT status, resolution FROM interventions WHERE id = ?')
      .get(interventionId) as { status: string; resolution: string | null } | undefined
    if (!row || row.status !== 'PENDING') {
      return row?.status === 'RESOLVED' && !/deny/i.test(row.resolution ?? '')
    }
    if (Date.now() > deadline) {
      resolveIntervention(interventionId, 'DENY (operator did not respond in time)')
      return false
    }
  }
}

// ── Gate + dispatch ───────────────────────────────────────────────────

export async function executeToolCall(
  agentId: string,
  name: string,
  rawArgs: Record<string, unknown>,
): Promise<ToolResult> {
  const agent = getAgentById(agentId)
  if (!agent) throw new Error('entity not found')

  const definition = definitionByName(name)
  if (!definition) throw new Error(`unknown tool ${name}`)
  if (!agent.tools.includes(definition.permission)) {
    return { content: `tool ${name} is not enabled for this entity`, isError: true }
  }

  const level = agent.permissions[definition.permission] ?? 'ask'
  if (!levelAllows(level, definition)) {
    return { content: `tool ${name} is ${level === 'deny' ? 'denied' : 'read-only'} for this entity`, isError: true }
  }

  if (levelNeedsApproval(level, definition)) {
    setAgentStatus(agentId, 'WAITING_FOR_HUMAN')
    const approved = await awaitApproval(
      agentId,
      `APPROVE TOOL CALL?\n\n${name}(${JSON.stringify(rawArgs, null, 2)})`,
    )
    if (!approved) {
      setAgentStatus(agentId, 'IDLE')
      return { content: `tool ${name} was denied by the operator`, isError: true }
    }
    setAgentStatus(agentId, 'WORKING')
  }

  logEvent({ type: 'agent.tool_started', agentId, summary: `tool ${name} invoked by ${agent.name}` })

  try {
    let result: ToolResult
    switch (name) {
      case 'fs_read':
        result = await executeFsRead(agent, rawArgs as { path?: string })
        break
      case 'fs_write':
        result = await executeFsWrite(agent, rawArgs as { path?: string; content?: string })
        break
      case 'fs_list':
        result = await executeFsList(agent, rawArgs as { dir?: string })
        break
      case 'git':
        result = await executeGit(agent, rawArgs as { args?: string })
        break
      case 'terminal':
        result = await executeTerminal(agent, rawArgs as { command?: string; timeout_ms?: string })
        break
      case 'list_entities':
        result = await executeListEntities()
        break
      case 'task_list':
        result = await executeTaskList(rawArgs as { status?: string; assigned_agent?: string })
        break
      case 'task_create':
        result = await executeTaskCreate(agent, rawArgs)
        break
      case 'task_update':
        result = await executeTaskUpdate(rawArgs as { number?: string; status?: string; result?: string })
        break
      case 'send_message':
        result = await executeSendMessage(agent, rawArgs as { entity?: string; content?: string })
        break
      case 'ask_operator':
        result = await executeAskOperator(agent, rawArgs as { question?: string; options?: string })
        break
      default:
        result = { content: `tool ${name} has no executor`, isError: true }
    }
    return { content: result.content.slice(0, 60000), isError: result.isError }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: message, isError: true }
  }
}
