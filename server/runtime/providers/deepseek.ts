import { decryptSecret } from '../../utils/crypto'
import { definitionsForEntity } from '../tools/definitions'
import { executeToolCall } from '../tools/execute'
import type { ModelOption } from '../../../shared/types'
import type { ProviderRow } from '../../utils/models'
import type { ProviderAdapter, RunOptions, RunResult, TestResult } from './types'

/**
 * DeepSeek adapter — OpenAI-compatible chat completions over HTTP, with a
 * full agentic tool-calling loop.
 *
 * The run streams assistant text; when the model emits tool calls, EREBUS
 * executes them through the permission-gated ToolManager and feeds the
 * results back until the model produces a final answer (bounded turns).
 */

const DEFAULT_TIMEOUT_MS = 180_000
const TEST_TIMEOUT_MS = 15_000
const MAX_TOOL_TURNS = 10

type Role = 'system' | 'user' | 'assistant' | 'tool'

interface ApiMessage {
  role: Role
  content: string
  tool_call_id?: string
  tool_calls?: {
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }[]
}

interface ChatCompletionChunk {
  choices?: {
    delta?: {
      content?: string | null
      tool_calls?: {
        index: number
        id?: string
        function?: { name?: string; arguments?: string }
      }[]
    }
    finish_reason?: string | null
  }[]
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

function apiKeyOf(config: ProviderRow): string {
  const key = decryptSecret(config.api_key_enc)
  if (!key) {
    throw new Error('No API key configured for this provider')
  }
  return key
}

interface StreamOutcome {
  text: string
  toolCalls: { id: string; name: string; arguments: string }[]
  finishReason: string
  input: number
  output: number
}

async function streamChat(
  config: ProviderRow,
  messages: ApiMessage[],
  tools: ReturnType<typeof definitionsForEntity>,
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<StreamOutcome> {
  const res = await fetch(`${config.base_url.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKeyOf(config)}`,
    },
    body: JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages,
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      stream: true,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
    }),
    signal,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DeepSeek API ${res.status}: ${text.slice(0, 300)}`)
  }

  let text = ''
  let finishReason = 'stop'
  let input = 0
  let output = 0
  const toolCalls = new Map<number, { id: string; name: string; arguments: string }>()

  const reader = res.body?.getReader()
  if (!reader) throw new Error('DeepSeek API returned no response body')

  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      let chunk: ChatCompletionChunk
      try {
        chunk = JSON.parse(payload) as ChatCompletionChunk
      } catch {
        continue
      }
      const choice = chunk.choices?.[0]
      if (!choice) continue

      const delta = choice.delta?.content
      if (delta) {
        text += delta
        onDelta(delta)
      }
      if (choice.finish_reason) finishReason = choice.finish_reason

      for (const call of choice.delta?.tool_calls ?? []) {
        const existing = toolCalls.get(call.index) ?? { id: '', name: '', arguments: '' }
        if (call.id) existing.id = call.id
        if (call.function?.name) existing.name = call.function.name
        if (call.function?.arguments) existing.arguments += call.function.arguments
        toolCalls.set(call.index, existing)
      }
      if (chunk.usage) {
        input = chunk.usage.prompt_tokens ?? input
        output = chunk.usage.completion_tokens ?? output
      }
    }
  }

  return {
    text,
    toolCalls: [...toolCalls.values()].filter((c) => c.name),
    finishReason,
    input,
    output,
  }
}

function adapter(): ProviderAdapter {
  return {
    kind: 'deepseek',

    async run(config: ProviderRow, options: RunOptions): Promise<RunResult> {
      const messages: ApiMessage[] = [
        ...(options.systemPrompt
          ? [{ role: 'system' as const, content: options.systemPrompt }]
          : []),
        ...options.history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: options.instruction },
      ]

      const tools = definitionsForEntity(options.tools ?? [])

      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      options.signal.addEventListener('abort', forwardAbort, { once: true })
      const hardTimeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

      let totalInput = 0
      let totalOutput = 0

      try {
        let finalText = ''
        for (let turn = 0; turn <= MAX_TOOL_TURNS; turn++) {
          const outcome = await streamChat(config, messages, tools, controller.signal, (delta) => {
            finalText += delta
            options.onEvent({ type: 'text', content: delta })
          })
          totalInput += outcome.input
          totalOutput += outcome.output

          if (outcome.toolCalls.length === 0 || outcome.finishReason !== 'tool_calls') {
            return {
              text: finalText || outcome.text,
              tokenUsageIn: totalInput || null,
              tokenUsageOut: totalOutput || null,
            }
          }
          if (turn === MAX_TOOL_TURNS) {
            throw new Error(`Tool loop exceeded ${MAX_TOOL_TURNS} turns`)
          }

          // Append the assistant tool-call message, execute each call,
          // then feed the results back.
          messages.push({
            role: 'assistant',
            content: '',
            tool_calls: outcome.toolCalls.map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: c.arguments },
            })),
          })
          for (const call of outcome.toolCalls) {
            options.onEvent({
              type: 'status',
              data: { tool: call.name, phase: 'working' },
            })
            let result: { content: string; isError: boolean }
            try {
              const parsed = JSON.parse(call.arguments || '{}') as Record<string, unknown>
              result = await executeToolCall(options.agentId ?? '', call.name, parsed)
            } catch (err) {
              result = {
                content: err instanceof Error ? err.message : String(err),
                isError: true,
              }
            }
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: result.isError ? `ERROR: ${result.content}` : result.content,
            })
            if (!result.isError) {
              options.onEvent({ type: 'status', data: { phase: 'thinking' } })
            }
          }
        }
        throw new Error('Tool loop ended without a final answer')
      } catch (err) {
        if (controller.signal.aborted && !options.signal.aborted) {
          throw new Error(`DeepSeek request exceeded ${DEFAULT_TIMEOUT_MS / 1000}s timeout`)
        }
        throw err
      } finally {
        clearTimeout(hardTimeout)
        options.signal.removeEventListener('abort', forwardAbort)
      }
    },

    async listModels(config: ProviderRow): Promise<ModelOption[]> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
      try {
        const res = await fetch(`${config.base_url.replace(/\/+$/, '')}/models`, {
          headers: { authorization: `Bearer ${apiKeyOf(config)}` },
          signal: controller.signal,
        })
        if (!res.ok) {
          throw new Error(`models request failed: HTTP ${res.status}`)
        }
        const body = (await res.json()) as { data?: { id?: string }[] }
        const models = (body.data ?? [])
          .map((m) => m.id)
          .filter((id): id is string => Boolean(id))
          .sort((a, b) => a.localeCompare(b))
        if (models.length === 0) {
          throw new Error('provider returned no models')
        }
        return models.map((id) => ({ id, label: id }))
      } finally {
        clearTimeout(timer)
      }
    },

    async test(config: ProviderRow): Promise<TestResult> {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)
      try {
        const res = await fetch(`${config.base_url.replace(/\/+$/, '')}/models`, {
          headers: { authorization: `Bearer ${apiKeyOf(config)}` },
          signal: controller.signal,
        })
        if (res.ok) {
          return { ok: true, detail: `reachable · ${config.model || 'model unset'}` }
        }
        const text = await res.text().catch(() => '')
        return { ok: false, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('No API key')) {
          return { ok: false, detail: 'no API key configured' }
        }
        if (controller.signal.aborted) {
          return { ok: false, detail: 'connection timed out' }
        }
        return { ok: false, detail: message.slice(0, 200) }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

let cached: ProviderAdapter | null = null

export function getDeepSeekAdapter(): ProviderAdapter {
  if (!cached) cached = adapter()
  return cached
}
