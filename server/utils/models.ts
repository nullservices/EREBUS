import { getDb } from '../db'
import type {
  Agent,
  AgentStatus,
  Message,
  MessageKind,
  MessageRole,
  Permissions,
  Project,
  Provider,
  ProviderKind,
  ToolId,
} from '../../shared/types'

/** Row shapes + serializers shared by the API handlers. */

export interface ProviderRow {
  id: string
  kind: ProviderKind
  label: string
  base_url: string
  model: string
  temperature: number
  max_tokens: number
  api_key_enc: string | null
  api_key_hint: string | null
  created_at: string
  updated_at: string
}

export function serializeProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    baseUrl: row.base_url,
    model: row.model,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    apiKeyHint: row.api_key_hint,
    configured: Boolean(row.api_key_enc),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface ProjectRow {
  id: string
  name: string
  description: string
  root_dir: string
  created_at: string
  updated_at: string
  agent_count?: number
}

export function serializeProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rootDir: row.root_dir,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    agentCount: row.agent_count,
  }
}

export interface AgentRow {
  id: string
  name: string
  role: string
  description: string
  system_prompt: string
  provider_id: string | null
  model_override: string
  project_id: string | null
  parent_id: string | null
  working_dir: string
  status: string
  tools_json: string
  permissions_json: string
  created_at: string
  updated_at: string
  provider_label?: string | null
  provider_kind?: ProviderKind | null
  project_name?: string | null
  parent_name?: string | null
}

const AGENT_SELECT = `
  SELECT a.*, p.label AS provider_label, p.kind AS provider_kind,
         pr.name AS project_name, pa.name AS parent_name
  FROM agents a
  LEFT JOIN providers p ON p.id = a.provider_id
  LEFT JOIN projects pr ON pr.id = a.project_id
  LEFT JOIN agents pa ON pa.id = a.parent_id
`

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch {
    return {}
  }
}

export function serializeAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    description: row.description,
    systemPrompt: row.system_prompt,
    providerId: row.provider_id,
    providerLabel: row.provider_label ?? null,
    providerKind: row.provider_kind ?? null,
    modelOverride: row.model_override,
    projectId: row.project_id,
    projectName: row.project_name ?? null,
    parentId: row.parent_id,
    parentName: row.parent_name ?? null,
    workingDir: row.working_dir,
    status: row.status as AgentStatus,
    tools: parseJsonArray(row.tools_json) as ToolId[],
    permissions: parseJsonObject(row.permissions_json) as Permissions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function getAgentById(id: string): Agent | null {
  const row = getDb().prepare(`${AGENT_SELECT} WHERE a.id = ?`).get(id) as
    | AgentRow
    | undefined
  return row ? serializeAgent(row) : null
}

export interface MessageRow {
  id: string
  agent_id: string
  role: string
  kind: string
  content: string
  meta: string | null
  created_at: string
}

export function serializeMessage(row: MessageRow): Message {
  return {
    id: row.id,
    agentId: row.agent_id,
    role: row.role as MessageRole,
    kind: row.kind as MessageKind,
    content: row.content,
    meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : null,
    createdAt: row.created_at,
  }
}
