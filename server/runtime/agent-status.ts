import { getDb } from '../db'
import { broadcast } from './realtime'
import type { AgentStatus } from '../../shared/types'

/** Status writes live here (used by the runner and the intervention layer). */
export function setAgentStatus(agentId: string, status: AgentStatus): void {
  getDb()
    .prepare(
      "UPDATE agents SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    )
    .run(status, agentId)
  broadcast({ kind: 'agent.status', agentId, status })
}

/**
 * Session-scoped auto-approve flags.
 * When enabled, approval-gated tool calls run without pausing (each is
 * logged as an agent.auto_approved event). The flag resets when the entity
 * stops — permanent trust is expressed by setting the permission to allow.
 */
const autoApprove = new Set<string>()

export function setAutoApprove(agentId: string, enabled: boolean): boolean {
  if (enabled) {
    autoApprove.add(agentId)
  } else {
    autoApprove.delete(agentId)
  }
  broadcast({ kind: 'agent.auto-approve', agentId, enabled })
  return enabled
}

export function isAutoApproving(agentId: string): boolean {
  return autoApprove.has(agentId)
}

/** Runtime stop clears the flag — called by the runner on stop. */
export function resetAutoApprove(agentId: string): void {
  if (autoApprove.delete(agentId)) {
    broadcast({ kind: 'agent.auto-approve', agentId, enabled: false })
  }
}
