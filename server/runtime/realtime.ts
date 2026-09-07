import type { EventRecord } from '../../shared/types'

/**
 * In-memory realtime fan-out for WebSocket peers.
 * The durable event log stays the source of truth — broadcasts are only a
 * transport hint; clients refresh their queries from the API on receipt.
 */

export type RealtimePayload =
  | { kind: 'event'; event: EventRecord }
  | { kind: 'agent.status'; agentId: string; status: string }
  | { kind: 'agent.auto-approve'; agentId: string; enabled: boolean }

interface PeerLike {
  send(data: string): void
}

const peers = new Set<PeerLike>()

export function registerPeer(peer: PeerLike): void {
  peers.add(peer)
}

export function unregisterPeer(peer: PeerLike): void {
  peers.delete(peer)
}

export function broadcast(payload: RealtimePayload): void {
  if (peers.size === 0) return
  const json = JSON.stringify(payload)
  for (const peer of [...peers]) {
    try {
      peer.send(json)
    } catch {
      unregisterPeer(peer)
    }
  }
}
