import type { PermissionLevel, ToolId } from '../../../shared/types'

/**
 * Tool registry — the single source of truth consumed by the DeepSeek
 * function-calling loop and the Claude Code MCP bridge.
 *
 * Each tool declares:
 * - name/description/inputSchema (the provider-facing contract)
 * - permission: which entity permission level gates it
 * - mutating: whether it changes state (read-only levels may not run it)
 */

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required: string[]
  }
  /** Entity permission key gating this tool. */
  permission: ToolId
  mutating: boolean
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'fs_read',
    description: 'Read a text file from the project. Path is relative to the working directory.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path, relative to the working directory' } },
      required: ['path'],
    },
    permission: 'filesystem',
    mutating: false,
  },
  {
    name: 'fs_write',
    description: 'Write or overwrite a text file in the project. Path is relative to the working directory.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path, relative to the working directory' },
        content: { type: 'string', description: 'Complete new file content' },
      },
      required: ['path', 'content'],
    },
    permission: 'filesystem',
    mutating: true,
  },
  {
    name: 'fs_list',
    description: 'List the entries of a directory in the project.',
    inputSchema: {
      type: 'object',
      properties: { dir: { type: 'string', description: 'Directory path, relative to the working directory; empty for root' } },
      required: [],
    },
    permission: 'filesystem',
    mutating: false,
  },
  {
    name: 'git',
    description:
      'Run a git subcommand in the project. Read-only commands (status, log, diff, show) always work for read access; mutating commands require write access.',
    inputSchema: {
      type: 'object',
      properties: { args: { type: 'string', description: 'git subcommand with arguments, e.g. "status --short"' } },
      required: ['args'],
    },
    permission: 'git',
    mutating: true,
  },
  {
    name: 'terminal',
    description:
      'Run a shell command on the host (PowerShell on Windows) inside the working directory. Returns stdout/stderr and the exit code.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        timeout_ms: { type: 'string', description: 'Optional timeout in milliseconds (max 60000, default 30000)' },
      },
      required: ['command'],
    },
    permission: 'terminal',
    mutating: true,
  },
  {
    name: 'list_entities',
    description: 'List the entities of EREBUS with their names, roles and current status.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    permission: 'mcp',
    mutating: false,
  },
  {
    name: 'task_create',
    description: 'Create a task in the EREBUS task system.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        description: { type: 'string', description: 'Optional details' },
        assigned_agent: { type: 'string', description: 'Optional entity name to assign' },
        status: { type: 'string', description: 'Initial status', enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'QA'] },
        priority: { type: 'string', description: 'Priority', enum: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] },
      },
      required: ['title'],
    },
    permission: 'mcp',
    mutating: true,
  },
  {
    name: 'task_update',
    description: 'Update the status or result of an existing task.',
    inputSchema: {
      type: 'object',
      properties: {
        number: { type: 'string', description: 'Task number, e.g. "1042"' },
        status: { type: 'string', description: 'New status', enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'QA', 'DONE', 'FAILED', 'CANCELLED'] },
        result: { type: 'string', description: 'Optional result summary' },
      },
      required: ['number', 'status'],
    },
    permission: 'mcp',
    mutating: true,
  },
  {
    name: 'task_list',
    description: 'List tasks, optionally filtered by status or assigned entity.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Optional status filter', enum: ['BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'QA', 'DONE', 'FAILED', 'CANCELLED'] },
        assigned_agent: { type: 'string', description: 'Optional entity name filter' },
      },
      required: [],
    },
    permission: 'mcp',
    mutating: false,
  },
  {
    name: 'send_message',
    description: 'Send a message to another entity. Its runtime executes it when started.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Target entity name' },
        content: { type: 'string', description: 'The instruction' },
      },
      required: ['entity', 'content'],
    },
    permission: 'mcp',
    mutating: true,
  },
  {
    name: 'ask_operator',
    description:
      'Pause and ask the operator a question. The run waits until the operator answers; the answer is injected into the conversation.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question' },
        options: { type: 'string', description: 'Optional suggested answers, separated by |' },
      },
      required: ['question'],
    },
    permission: 'mcp',
    mutating: true,
  },
]

export function definitionsForEntity(tools: ToolId[]): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((d) => tools.includes(d.permission))
}

export function definitionByName(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((d) => d.name === name)
}

/** Whether a permission level allows a tool to run without approval. */
export function levelAllows(level: PermissionLevel | undefined, definition: ToolDefinition): boolean {
  if (!level || level === 'deny') return false
  if (definition.mutating) return level === 'allow' || level === 'ask'
  return level === 'allow' || level === 'readonly' || level === 'ask'
}

/** Whether this tool needs explicit operator approval before running. */
export function levelNeedsApproval(level: PermissionLevel | undefined, definition: ToolDefinition): boolean {
  return level === 'ask'
}
