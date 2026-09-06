import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnProcess, stopProcess, type ManagedProcess } from '../process-manager'
import type { Permissions, PermissionLevel, ToolId } from '../../../shared/types'
import type { ProviderAdapter, RunOptions, RunResult, TestResult } from './types'

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
