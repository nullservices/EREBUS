/**
 * Shared contracts between the Nitro server and the Vue client.
 * Both sides import from this file — keep it free of runtime-only imports.
 */

export const AGENT_STATUSES = [
  'OFFLINE',
  'STARTING',
  'IDLE',
  'THINKING',
  'WORKING',
  'WAITING',
  'BLOCKED',
  'ERROR',
  'COMPLETED',
  'STOPPING',
] as const
export type AgentStatus = (typeof AGENT_STATUSES)[number]

export const PROVIDER_KINDS = ['claude', 'deepseek', 'openai', 'gemini', 'custom'] as const
export type ProviderKind = (typeof PROVIDER_KINDS)[number]

export const TOOL_IDS = ['filesystem', 'git', 'terminal', 'network', 'mcp'] as const
export type ToolId = (typeof TOOL_IDS)[number]

export const PERMISSION_LEVELS = ['allow', 'ask', 'readonly', 'deny'] as const
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]
export type Permissions = Partial<Record<ToolId, PermissionLevel>>

export type MessageRole = 'user' | 'agent' | 'system' | 'tool' | 'command' | 'error'
export type MessageKind =
  | 'text'
  | 'tool_call'
  | 'tool_result'
  | 'command'
  | 'command_output'
  | 'event'
  | 'error'

export interface User {
  id: string
  username: string
  createdAt: string
  lastLoginAt: string | null
}

export interface Project {
  id: string
  name: string
  description: string
  rootDir: string
  createdAt: string
  updatedAt: string
  agentCount?: number
}

export interface Provider {
  id: string
  kind: ProviderKind
  label: string
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  apiKeyHint: string | null
  configured: boolean
  createdAt: string
  updatedAt: string
}

export interface ModelOption {
  id: string
  label: string
}

export interface ModelCatalog {
  /** 'live' — fetched from the provider API; 'catalog' — curated fallback. */
  source: 'live' | 'catalog'
  models: ModelOption[]
}

export interface Agent {
  id: string
  name: string
  role: string
  description: string
  systemPrompt: string
  providerId: string | null
  providerLabel: string | null
  providerKind: ProviderKind | null
  modelOverride: string
  projectId: string | null
  projectName: string | null
  parentId: string | null
  parentName: string | null
  workingDir: string
  status: AgentStatus
  tools: ToolId[]
  permissions: Permissions
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  agentId: string
  role: MessageRole
  kind: MessageKind
  content: string
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface EventRecord {
  id: string
  type: string
  agentId: string | null
  agentName: string | null
  projectId: string | null
  summary: string
  data: Record<string, unknown> | null
  createdAt: string
}

export interface DashboardStats {
  agents: {
    total: number
    online: number
    byStatus: Record<string, number>
  }
  projects: number
  recentEvents: EventRecord[]
}

export interface SystemInfo {
  version: string
  dataDir: string
  host: string
  port: number
}
