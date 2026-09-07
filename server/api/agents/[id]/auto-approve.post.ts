import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { setAutoApprove } from '../../../runtime/agent-status'
import { resolveIntervention, type InterventionRow } from '../../../runtime/interventions'
import { resumeAgentQueue } from '../../../runtime/agent-runner'
import { asString } from '../../../utils/validate'

interface Body {
  enabled?: unknown
}

/**
 * Session-scoped auto-approve.
 * Enabling resolves any pending approval interventions for the entity and
 * resumes its queue; disabling returns to manual approvals. The flag is
 * cleared automatically when the runtime stops.
 */
export default defineEventHandler(async (event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const body = (await readBody(event).catch(() => ({}))) as Body

  const enabled = body.enabled !== false
  const autoApproving = setAutoApprove(id, enabled)

  if (enabled) {
    // Clear the waiting state: resolve pending approval requests and resume.
    const pending = getDb()
      .prepare("SELECT * FROM interventions WHERE agent_id = ? AND status = 'PENDING' AND kind = 'approval'")
      .all(id) as InterventionRow[]
    for (const intervention of pending) {
      resolveIntervention(intervention.id, 'APPROVE (auto-approve enabled)')
    }
    if (pending.length > 0) {
      resumeAgentQueue(id)
    }
  }

  return { autoApproving }
})
