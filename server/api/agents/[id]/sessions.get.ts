import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { asString } from '../../../utils/validate'

interface SessionRow {
  id: string
  provider_kind: string | null
  model: string
  status: string
  started_at: string
  ended_at: string | null
  exit_code: number | null
  error: string | null
  token_usage_in: number | null
  token_usage_out: number | null
  external_session_id: string | null
}

/** Runtime session history for one entity, newest first. */
export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })
  const q = getQuery(event)
  const limit = Math.min(Math.max(Number(q.limit) || 20, 1), 100)

  const rows = getDb()
    .prepare(
      `SELECT id, provider_kind, model, status, started_at, ended_at, exit_code,
              error, token_usage_in, token_usage_out, external_session_id
       FROM agent_sessions WHERE agent_id = ?
       ORDER BY started_at DESC, id DESC LIMIT ?`,
    )
    .all(id, limit) as SessionRow[]

  return rows.map((r) => ({
    id: r.id,
    providerKind: r.provider_kind,
    model: r.model,
    status: r.status,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    exitCode: r.exit_code,
    error: r.error,
    tokenUsageIn: r.token_usage_in,
    tokenUsageOut: r.token_usage_out,
    externalSessionId: r.external_session_id,
  }))
})
