import { requireUser } from '../../utils/auth'
import { listEvents } from '../../utils/events'

/** Global activity feed, newest first. */
export default defineEventHandler((event) => {
  requireUser(event)
  const q = getQuery(event)
  return listEvents({
    limit: Number(q.limit) || 50,
    agentId: typeof q.agentId === 'string' && q.agentId ? q.agentId : null,
    projectId: typeof q.projectId === 'string' && q.projectId ? q.projectId : null,
  })
})
