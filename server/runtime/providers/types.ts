import type { ModelOption, Permissions, ProviderKind, ToolId } from '../../../shared/types'
import type { ProviderRow } from '../../utils/models'
import type { ManagedProcess } from '../process-manager'
import { getDeepSeekAdapter } from './deepseek'
import { getClaudeCodeAdapter } from './claude-code'

/**
 * Provider abstraction.
 *
 * Every AI provider — HTTP API or external CLI runtime — implements this
 * interface. The agent runner only ever talks to the interface, so adding a
 * provider means adding one file + one registry entry.
 *
 * StreamEvent.data conventions (adapter → runner):
 *   { phase: 'thinking' | 'working' }  — status transition
 *   { tool: string }                   — a tool invocation began
 *   { output: string }                 — a raw runtime output line to record
 */

export interface StreamEvent {
  /** 'text' — token chunk; 'status' — runtime note; 'error' — failure. */
  type: 'text' | 'status' | 'error'
  content?: string
  data?: Record<string, unknown>
}

export interface RunOptions {
  /** Full conversation so far (user/assistant turns), oldest first. */
  history: { role: 'user' | 'assistant'; content: string }[]
  /** The instruction that triggered this run. */
  instruction: string
  /** Entity system prompt. */
  systemPrompt: string
  /** Working directory on the host. */
  workingDir: string
  /** External session id to resume, when supported by the provider. */
  resumeSessionId?: string | null
  /** Model override for this run, when the entity configures one. */
  model?: string
  /** Entity tool config — adapters translate this into runtime permissions. */
  tools?: ToolId[]
  permissions?: Permissions
  /** Abort signal — the runner sets this on stop/restart. */
  signal: AbortSignal
  onEvent: (event: StreamEvent) => void
  /** Hand over a spawned host process so the runner can kill it on stop. */
  onProcess?: (process: ManagedProcess) => void
}

export interface RunResult {
  /** Full assistant text (all text events joined). */
  text: string
  /** Provider session id to store for future resumes. */
  sessionId?: string | null
  tokenUsageIn?: number | null
  tokenUsageOut?: number | null
  exitCode?: number | null
}

export interface TestResult {
  ok: boolean
  detail: string
}

export interface ProviderAdapter {
  readonly kind: ProviderKind
  /** Streaming chat run. Resolves on completion, rejects on failure. */
  run(config: ProviderRow, options: RunOptions): Promise<RunResult>
  /** Real connectivity check — used by the TEST button in settings. */
  test(config: ProviderRow): Promise<TestResult>
  /**
   * Live model list, when the provider exposes one. Adapters without a
   * models endpoint omit this — the endpoint falls back to the curated
   * catalog (see catalog.ts).
   */
  listModels?(config: ProviderRow): Promise<ModelOption[]>
}

export function createAdapterFor(kind: ProviderKind): ProviderAdapter | null {
  switch (kind) {
    case 'deepseek':
      return getDeepSeekAdapter()
    case 'claude':
      return getClaudeCodeAdapter()
    default:
      return null
  }
}
