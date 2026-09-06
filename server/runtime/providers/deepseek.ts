import { decryptSecret } from '../../utils/crypto'
import type { ModelOption } from '../../../shared/types'
import type { ProviderRow } from '../../utils/models'
import type { ProviderAdapter, RunOptions, RunResult, TestResult } from './types'

/**
 * DeepSeek adapter — OpenAI-compatible chat completions over HTTP.
 *
 * Streaming via SSE; the API key is decrypted server-side only and is
 * attached to the outgoing request. Never logged, never returned.
 */

const DEFAULT_TIMEOUT_MS = 180_000
const TEST_TIMEOUT_MS = 15_000

interface DeepSeekMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionChunk {
  choices?: {
    delta?: { content?: string | null }
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

async function streamChat(
  config: ProviderRow,
  messages: DeepSeekMessage[],
  signal: AbortSignal,
  onDelta: (delta: string) => void,
): Promise<{ input: number; output: number }> {
  const res = await fetch(`${config.base_url.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKeyOf(config)}`,
    },
    body: JSON.stringify({
      model: config.model || 'deepseek-chat',
      messages,
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

  let input = 0
  let output = 0
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
      const delta = chunk.choices?.[0]?.delta?.content
      if (delta) onDelta(delta)
      if (chunk.usage) {
        input = chunk.usage.prompt_tokens ?? input
        output = chunk.usage.completion_tokens ?? output
      }
    }
  }
  return { input, output }
}

function adapter(): ProviderAdapter {
  return {
    kind: 'deepseek',

    async run(config: ProviderRow, options: RunOptions): Promise<RunResult> {
      const messages: DeepSeekMessage[] = [
        ...(options.systemPrompt
          ? [{ role: 'system' as const, content: options.systemPrompt }]
          : []),
        ...options.history.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        { role: 'user' as const, content: options.instruction },
      ]

      // Hard ceiling on the whole run; the runner also aborts on stop.
      const controller = new AbortController()
      const forwardAbort = () => controller.abort()
      options.signal.addEventListener('abort', forwardAbort, { once: true })
      const hardTimeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

      try {
        let text = ''
        const usage = await streamChat(config, messages, controller.signal, (delta) => {
          text += delta
          options.onEvent({ type: 'text', content: delta })
        })
        return {
          text,
          tokenUsageIn: usage.input || null,
          tokenUsageOut: usage.output || null,
        }
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
