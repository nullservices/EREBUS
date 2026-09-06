import type { EventRecord } from '~~/shared/types'

export interface RealtimePayload {
  kind: 'event' | 'agent.status'
  event?: EventRecord
  agentId?: string
  status?: string
}

const connected = useState('erebus-realtime-connected', () => false)
const lastPayload = useState<RealtimePayload | null>('erebus-realtime-last', () => null)

let socket: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return
  }
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  socket = new WebSocket(`${protocol}://${window.location.host}/live`)

  socket.onopen = () => {
    connected.value = true
    reconnectDelay = 1000
  }
  socket.onmessage = (message) => {
    try {
      lastPayload.value = JSON.parse(String(message.data)) as RealtimePayload
    } catch {
      /* malformed frame — ignore */
    }
  }
  socket.onclose = () => {
    connected.value = false
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(connect, reconnectDelay)
    reconnectDelay = Math.min(reconnectDelay * 2, 10_000)
  }
  socket.onerror = () => {
    socket?.close()
  }
}

/**
 * Shared realtime channel. Consumers watch `lastPayload` and refresh their
 * API queries — the payloads are hints, the database stays the truth.
 * When the socket is down, consumers should fall back to slow polling.
 */
export function useRealtime() {
  if (import.meta.client && !socket) connect()
  return { connected, lastPayload }
}
