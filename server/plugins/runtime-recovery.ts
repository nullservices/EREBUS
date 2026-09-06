import { getDb } from '../db'
import { logEvent } from '../utils/events'

/**
 * Recovery after an EREBUS restart: host processes and in-memory runners
 * do not survive, so every entity that claimed to be running is honestly
 * reset to OFFLINE and its open session is closed with a note.
 */
export default defineNitroPlugin(() => {
  const db = getDb()

  const running = db
    .prepare("SELECT id, name FROM agents WHERE status != 'OFFLINE'")
    .all() as { id: string; name: string }[]

  if (running.length > 0) {
    const tx = db.transaction(() => {
      for (const agent of running) {
        db.prepare(
          `UPDATE agent_sessions
           SET status = 'ENDED', ended_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
               error = 'EREBUS restarted while the session was running'
           WHERE agent_id = ? AND status = 'RUNNING'`,
        ).run(agent.id)
        db.prepare(
          "UPDATE agents SET status = 'OFFLINE', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
        ).run(agent.id)
      }
    })
    tx()

    for (const agent of running) {
      logEvent({
        type: 'agent.recovered',
        agentId: agent.id,
        summary: `entity ${agent.name} reset to OFFLINE after server restart`,
      })
    }
  }
})
