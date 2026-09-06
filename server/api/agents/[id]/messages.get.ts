import { getDb } from '../../../db'
import { requireUser } from '../../../utils/auth'
import { serializeMessage, type MessageRow } from '../../../utils/models'
import { asString } from '../../../utils/validate'

/** Conversation history for one entity, oldest first. */
export default defineEventHandler((event) => {
  requireUser(event)
  const id = asString(getRouterParam(event, 'id'), 'id', { required: true })

  const db = getDb()
  if (!db.prepare('SELECT 1 FROM agents WHERE id = ?').get(id)) {
    throw createError({ statusCode: 404, message: 'Entity not found' })
  }

  const q = getQuery(event)
  const offset = Math.max(Number(q.offset) || 0, 0)
  const limit = Math.min(Math.max(Number(q.limit) || 200, 1), 500)

  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE agent_id = ?
       ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
    )
    .all(id, limit, offset) as MessageRow[]

  return rows.map(serializeMessage)
})
