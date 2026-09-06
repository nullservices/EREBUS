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
  'WAITING_FOR_HUMAN',
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

export type ChannelKind = 'discord' | 'ntfy' | 'generic'

export interface Channel {
  id: string
  kind: ChannelKind
  label: string
  enabled: boolean
  events: string[]
  configHint: string | null
  createdAt: string
  updatedAt: string
}

export const TASK_STATUSES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'REVIEW',
  'QA',
  'DONE',
  'FAILED',
  'CANCELLED',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export interface Task {
  id: string
  number: number
  projectId: string | null
  projectName: string | null
  parentId: string | null
  parentNumber: number | null
  parentTitle: string | null
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  createdBy: string
  assignedAgentId: string | null
  assignedAgentName: string | null
  result: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
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
  /** Entity that sent this message, when it was sent by an entity. */
  senderAgentId: string | null
  senderAgentName: string | null
  role: MessageRole
  kind: MessageKind
  content: string
  meta: Record<string, unknown> | null
  createdAt: string
}

export interface Intervention {
  id: string
  agentId: string
  sessionId: string | null
  kind: 'input' | 'approval'
  prompt: string
  options: string[] | null
  status: 'PENDING' | 'RESOLVED' | 'EXPIRED'
  resolution: string | null
  createdAt: string
  resolvedAt: string | null
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
  tasks: {
    total: number
    active: number
    blocked: number
    done: number
    byStatus: Record<string, number>
  }
  recentEvents: EventRecord[]
}

export interface SystemInfo {
  version: string
  dataDir: string
  host: string
  port: number
}
