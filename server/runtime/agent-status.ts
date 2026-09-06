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
