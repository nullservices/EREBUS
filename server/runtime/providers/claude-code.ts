import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getDataDir } from '../../db'
import { createSessionToken, destroySessionToken, operatorUserId } from '../../utils/auth'
import { spawnProcess, stopProcess, type ManagedProcess } from '../process-manager'
import type { Permissions, PermissionLevel, ToolId } from '../../../shared/types'
import type { ProviderAdapter, RunOptions, RunResult, TestResult } from './types'

/**
 * Minimal MCP stdio bridge, generated into the data directory at runtime.
 * Newline-delimited JSON-RPC; every tool call goes through the EREBUS
 * permission gate via the internal API — the CLI never bypasses it.
 */
const MCP_BRIDGE_SOURCE = `// EREBUS MCP bridge — generated at runtime; do not edit.
const BASE = process.env.EREBUS_URL || 'http://127.0.0.1:4521'
const TOKEN = process.env.EREBUS_SESSION || ''
const AGENT_ID = process.argv[2] || ''

let buffer = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buffer += chunk
  let idx
  while ((idx = buffer.indexOf('\\n')) >= 0) {
    const line = buffer.slice(0, idx).trim()
    buffer = buffer.slice(idx + 1)
    if (line) void handle(line)
  }
})

function send(payload) {
  process.stdout.write(JSON.stringify(payload) + '\\n')
}

async function api(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'erebus_session=' + TOKEN },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || 'EREBUS API ' + res.status)
  return json
}

function fail(id, message) {
  send({ jsonrpc: '2.0', id, error: { code: -32000, message } })
}

async function handle(line) {
  let msg
  try { msg = JSON.parse(line) } catch { return }
  const { id, method, params } = msg

  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'erebus', version: '0.1.0' },
    } })
    return
  }
  if (method === 'notifications/initialized') return
  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} })
    return
  }

  if (method === 'tools/list') {
    try {
      const tools = await api('/api/internal/tools/list', { agentId: AGENT_ID, protocolOnly: true })
      send({ jsonrpc: '2.0', id, result: { tools } })
    } catch (err) {
      fail(id, String(err && err.message ? err.message : err))
    }
    return
  }

  if (method === 'tools/call') {
    try {
      const data = await api('/api/internal/tools/call', {
        agentId: AGENT_ID,
        name: params && params.name,
        args: (params && params.arguments) || {},
      })
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: data.content }],
        isError: Boolean(data.isError),
      } })
    } catch (err) {
      send({ jsonrpc: '2.0', id, result: {
        content: [{ type: 'text', text: 'tool failed: ' + (err && err.message ? err.message : err) }],
        isError: true,
      } })
    }
    return
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'method not found: ' + method } })
}
`

/**
 * Resolve the best launchable Claude Code executable, cached per process:
 * 1. the native installer binary (may not be on PATH), else
 * 2. an `claude.exe` line from `where claude`, else
 * 3. null — spawn `claude` by name and fall back to cmd.exe for .cmd shims.
 */
let cachedExe: string | null | undefined

function resolveClaudeExecutable(): string | null {
  if (cachedExe !== undefined) return cachedExe

  const native = join(homedir(), '.local', 'bin', 'claude.exe')
  if (existsSync(native)) {
    cachedExe = native
    return cachedExe
  }
  try {
    const out = execFileSync('where.exe', ['claude'], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const exeLine = out
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /\.exe$/i.test(l))
    cachedExe = exeLine ?? null
  } catch {
    cachedExe = null
  }
  return cachedExe
}

/**
 * Claude Code adapter — drives the host `claude` CLI as an external runtime.
 *
 * Each instruction launches a headless print-mode run in the entity's
 * working directory; stdout stream-json events become real activity
 * (assistant text, tool invocations, raw output). The session id arrives in
 * the system/init event and follow-ups resume it with --resume.
 *
 * The entity's tool permissions are translated into the CLI's
 * --allowedTools / --disallowedTools rules. "ask" cannot be honored in a
 * headless run — it resolves to auto-deny until the Phase VII approval
 * system exists.
 */

interface StreamJsonEvent {
  type?: string
  subtype?: string
  message?: { content?: { type?: string; text?: string }[] }
  tool_name?: string
  session_id?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

function parseLine(line: string): StreamJsonEvent | null {
  try {
    const parsed = JSON.parse(line) as unknown
    if (parsed && typeof parsed === 'object') return parsed as StreamJsonEvent
  } catch {
    /* not JSON */
  }
  return null
}

/**
 * Translate entity permissions into CLI tool rules.
 * allow → explicit --allowedTools entry; deny → --disallowedTools entry;
 * readonly → read-shaped allow entries; ask → nothing (auto-denied headless).
 */
function buildPermissionArgs(permissions: Permissions): { allowed: string[]; disallowed: string[] } {
  const allowed: string[] = []
  const disallowed: string[] = []

  const level = (tool: ToolId): PermissionLevel => permissions[tool] ?? 'ask'

  if (level('filesystem') === 'allow') {
    allowed.push('Edit', 'Write', 'Read')
  } else if (level('filesystem') === 'readonly') {
    allowed.push('Read')
  } else if (level('filesystem') === 'deny') {
    disallowed.push('Edit', 'Write')
  }

  if (level('git') === 'allow') {
    allowed.push('Bash(git *)')
  } else if (level('git') === 'readonly') {
    allowed.push('Bash(git status)', 'Bash(git diff *)', 'Bash(git log *)', 'Bash(git show *)')
  } else if (level('git') === 'deny') {
    disallowed.push('Bash(git *)')
  }

  if (level('terminal') === 'allow') {
    allowed.push('Bash(*)')
  } else if (level('terminal') === 'deny') {
    disallowed.push('Bash(*)')
  }

  return { allowed, disallowed }
}

/**
 * When the entity has the EREBUS protocol tools enabled, generate the MCP
 * bridge + config and return the extra CLI args (plus the session token to
 * clean up afterwards).
 */
function attachMcpBridge(options: RunOptions): { args: string[]; sessionToken: string | null } {
  if (!options.tools?.includes('mcp')) {
    return { args: [], sessionToken: null }
  }

  const userId = operatorUserId()
  if (!userId) return { args: [], sessionToken: null }
  const sessionToken = createSessionToken(userId, 'erebus-mcp-bridge')

  const dataDir = getDataDir()
  writeFileSync(join(dataDir, 'mcp-bridge.mjs'), MCP_BRIDGE_SOURCE, 'utf8')

  const mcpConfig = {
    mcpServers: {
      erebus: {
        command: process.execPath,
        args: [join(dataDir, 'mcp-bridge.mjs'), options.agentId],
        env: {
          EREBUS_URL: options.erebusBaseUrl,
          EREBUS_SESSION: sessionToken,
        },
      },
    },
  }
  const configPath = join(dataDir, `mcp-${options.agentId}.json`)
  writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2), 'utf8')

  return {
    args: ['--mcp-config', configPath, '--allowedTools', 'mcp__erebus__*'],
    sessionToken,
  }
}

function buildArgs(options: RunOptions, model: string | null): string[] {
  const args = [
    '-p',
    options.instruction,
    '--output-format',
    'stream-json',
    '--verbose',
    // Headless runs auto-deny anything not explicitly allowed; these two
    // make that explicit and stop the CLI from retrying denied calls.
    '--permission-mode',
    'dontAsk',
    '--permission-prompts',
    'none',
  ]

  const chosenModel = options.model?.trim() || model
  if (chosenModel) args.push('--model', chosenModel)

  if (options.systemPrompt.trim()) {
    args.push('--append-system-prompt', options.systemPrompt)
  }

  const { allowed, disallowed } = buildPermissionArgs(options.permissions ?? {})
  for (const rule of allowed) args.push('--allowedTools', rule)
  for (const rule of disallowed) args.push('--disallowedTools', rule)

  const bridge = attachMcpBridge(options)
  args.push(...bridge.args)
  options.signal.addEventListener(
    'abort',
    () => {
      if (bridge.sessionToken) destroySessionToken(bridge.sessionToken)
    },
    { once: true },
  )

  if (options.resumeSessionId) {
    args.push('--resume', options.resumeSessionId)
  }
  return args
}

function wireEvents(
  processRecord: ManagedProcess,
  options: RunOptions,
  state: { sessionId: string | null; usageIn: number | null; usageOut: number | null },
): void {
  processRecord.onLine = (stream, line) => {
    if (stream !== 'stdout') {
      options.onEvent({ type: 'status', data: { output: line } })
      return
    }
    const event = parseLine(line)
    if (!event) {
      options.onEvent({ type: 'status', data: { output: line } })
      return
    }
    switch (event.type) {
      case 'assistant': {
        const text = (event.message?.content ?? [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text ?? '')
          .join('')
        if (text) options.onEvent({ type: 'text', content: text })
        options.onEvent({ type: 'status', data: { phase: 'thinking' } })
        break
      }
      case 'tool_use':
        options.onEvent({
          type: 'status',
          data: { tool: event.tool_name ?? 'unknown tool', phase: 'working' },
        })
        break
      case 'tool_result':
        options.onEvent({ type: 'status', data: { phase: 'working' } })
        break
      case 'system':
        if (event.subtype === 'init' && event.session_id) state.sessionId = event.session_id
        break
      case 'result':
        if (event.session_id) state.sessionId = event.session_id
        state.usageIn = event.usage?.input_tokens ?? state.usageIn
        state.usageOut = event.usage?.output_tokens ?? state.usageOut
        break
      default:
        break
    }
  }
}

function adapter(): ProviderAdapter {
  return {
    kind: 'claude',

    async run(config, options: RunOptions): Promise<RunResult> {
      options.onEvent({ type: 'status', data: { phase: 'thinking' } })

      const state: { sessionId: string | null; usageIn: number | null; usageOut: number | null } = {
        sessionId: options.resumeSessionId ?? null,
        usageIn: null,
        usageOut: null,
      }
      let text = ''
      const wrapped: RunOptions = {
        ...options,
        onEvent: (event) => {
          if (event.type === 'text' && event.content) text += event.content
          options.onEvent(event)
        },
      }

      const args = buildArgs(wrapped, config.model)
      let bridgeToken: string | null = null
      const configArgIndex = args.indexOf('--mcp-config')
      // The bridge token rides in the generated config's env — recover it
      // from the config file to clean up after the run.
      if (configArgIndex >= 0) {
        try {
          const configPath = args[configArgIndex + 1]
          if (typeof configPath !== 'string') throw new Error('missing mcp config path')
          const raw = JSON.parse(readFileSync(configPath, 'utf8')) as {
            mcpServers?: { erebus?: { env?: { EREBUS_SESSION?: string } } }
          }
          bridgeToken = raw.mcpServers?.erebus?.env?.EREBUS_SESSION ?? null
        } catch {
          /* no bridge token — nothing to clean */
        }
      }
      try {
        const processRecord = await launchClaude(
          args,
          wrapped.workingDir || process.cwd(),
          (record) => wireEvents(record, wrapped, state),
          wrapped.onProcess,
        )
        const exitCode = processRecord.exitCode
        const tail = processRecord.stderrRing

        if (exitCode !== 0) {
          const detail = tail.slice(-5).join('\n')
          throw new Error(
            `Claude Code exited with code ${exitCode ?? 'unknown'}${detail ? `: ${detail}` : ''}`,
          )
        }

        return {
          text,
          sessionId: state.sessionId,
          tokenUsageIn: state.usageIn,
          tokenUsageOut: state.usageOut,
          exitCode,
        }
      } finally {
        if (bridgeToken) destroySessionToken(bridgeToken)
      }
    },

    async test(): Promise<TestResult> {
      const processRecord = await launchClaude(['--version'], process.cwd(), () => {})
      const timeout = setTimeout(() => void stopProcess(processRecord), 10_000)
      try {
        const outcome = await processRecord.done
        if (outcome.status === 'FAILED') {
          const detail = processRecord.stderrRing.join(' ')
          if (detail.includes('ENOENT')) {
            return { ok: false, detail: 'claude CLI not found on PATH' }
          }
          return { ok: false, detail: detail.slice(0, 200) || 'failed to launch claude' }
        }
        const versionLine = processRecord.stdoutRing.find((l) => /\d+\.\d+/.test(l)) ?? ''
        return {
          ok: outcome.exitCode === 0,
          detail:
            outcome.exitCode === 0
              ? `claude CLI available${versionLine ? ` · ${versionLine.trim()}` : ''}`
              : `claude exited with code ${outcome.exitCode}`,
        }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

/**
 * Spawn the CLI with the best-known executable and return the process that
 * actually runs — following the cmd.exe fallback when `claude` resolves to a
 * .cmd shim that CreateProcess cannot launch directly.
 */
async function launchClaude(
  args: string[],
  cwd: string,
  wire: (record: ManagedProcess) => void,
  onProcess?: (process: ManagedProcess) => void,
): Promise<ManagedProcess> {
  const exe = resolveClaudeExecutable()

  const spawnOne = (command: string, finalArgs: string[]): ManagedProcess => {
    const record = spawnProcess({ command, args: finalArgs, cwd, agentId: null, sessionId: null })
    onProcess?.(record)
    wire(record)
    return record
  }

  let record = spawnOne(exe ?? 'claude', args)
  if (!exe) {
    const outcome = await record.done
    if (outcome.status === 'FAILED' && record.stderrRing.join(' ').includes('ENOENT')) {
      record = spawnOne('cmd.exe', ['/c', 'claude', ...args])
      await record.done
    }
  }
  return record
}

let cached: ProviderAdapter | null = null

export function getClaudeCodeAdapter(): ProviderAdapter {
  if (!cached) cached = adapter()
  return cached
}
