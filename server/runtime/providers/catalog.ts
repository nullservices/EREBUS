import type { ModelOption, ProviderKind } from '../../../shared/types'

/**
 * Curated model catalogs for providers whose runtime has no models endpoint
 * (the Claude CLI, and providers without adapters yet). Used as the dropdown
 * fallback when a live fetch is unavailable or fails.
 */

const CLAUDE_MODELS: ModelOption[] = [
  { id: 'claude-opus-5', label: 'Opus 5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
  { id: 'claude-fable-5-1', label: 'Fable 5.1' },
]

const DEEPSEEK_MODELS: ModelOption[] = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
]

const OPENAI_MODELS: ModelOption[] = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
]

const GEMINI_MODELS: ModelOption[] = [
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
]

export function catalogFor(kind: ProviderKind): ModelOption[] {
  switch (kind) {
    case 'claude':
      return CLAUDE_MODELS
    case 'deepseek':
      return DEEPSEEK_MODELS
    case 'openai':
      return OPENAI_MODELS
    case 'gemini':
      return GEMINI_MODELS
    case 'custom':
      return []
  }
}
