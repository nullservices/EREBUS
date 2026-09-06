import { registerPeer, unregisterPeer } from '../runtime/realtime'
import { SESSION_COOKIE, validateSessionToken } from '../utils/auth'

/**
 * Realtime channel: /live (app-level WebSocket hooks).
 *
 * Nitro's node preset bridges crossws through `nitroApp.h3App.websocket`;
 * per-route websocket meta is lost by lazy route wrapping, so the socket
 * policy lives here — one owner, one policy.
 *
 * Auth: session cookie (browser clients) or ?token= (LAN dashboards, smoke
 * tests), enforced in BOTH the upgrade hook and open() so a connection is
 * never accepted without a valid session.
 */

function tokenFromUpgradeRequest(req: unknown): string | null {
  if (!req || typeof req !== 'object') return null
  const r = req as {
    url?: string
    headers?: Record<string, unknown>
    headers2?: Headers
  }

  try {
    const url = typeof r.url === 'string' ? r.url : ''
    const query = new URL(url, 'http://localhost').searchParams.get('token')
    if (query) return query
  } catch {
    /* fall through to cookie */
  }

  let cookie = ''
  const headers = r.headers ?? r.headers2
  if (headers instanceof Headers) {
    cookie = headers.get('cookie') ?? ''
  } else if (headers && typeof headers === 'object') {
    const raw = (headers as Record<string, unknown>).cookie
    cookie = Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '')
  }
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === SESSION_COOKIE) return rest.join('=')
  }
  return null
}

function peerToken(peer: unknown): string | null {
  if (!peer || typeof peer !== 'object') return null
  const request = (peer as { request?: unknown }).request
  return tokenFromUpgradeRequest(request)
}

function messageText(message: unknown): string {
  if (typeof message === 'string') return message
  if (message instanceof Uint8Array) return new TextDecoder().decode(message)
  if (message && typeof message === 'object') {
    const m = message as { text?: unknown; rawData?: unknown }
    if (typeof m.text === 'function') return String((m.text as () => unknown)())
    if (typeof m.text === 'string') return m.text
    if (m.rawData !== undefined) return messageText(m.rawData)
  }
  return ''
}

export default defineNitroPlugin((nitroApp) => {
  const ws = nitroApp.h3App.websocket

  const hooks = {
    upgrade(req: unknown) {
      const token = tokenFromUpgradeRequest(req)
      const user = token ? validateSessionToken(token) : null
      if (!user) {
        return new Response('Unauthorized', { status: 401 })
      }
      return undefined
    },
    open(peer: unknown) {
      // Second gate — reject here too in case an adapter skips upgrade().
      const token = peerToken(peer)
      if (!token || !validateSessionToken(token)) {
        try {
          ;(peer as { close?: () => void }).close?.()
        } catch {
          /* already closing */
        }
        return
      }
      registerPeer(peer as never)
    },
    message(peer: unknown, message: unknown) {
      if (messageText(message) === 'ping') {
        try {
          ;(peer as { send?: (data: string) => void }).send?.('pong')
        } catch {
          /* peer may be closing */
        }
      }
    },
    close(peer: unknown) {
      unregisterPeer(peer as never)
    },
    error(peer: unknown) {
      unregisterPeer(peer as never)
    },
  }

  // crossws obtains the active hooks through options.resolve() — per-route
  // meta is lost to nitro's lazy route wrapping, so this plugin owns the
  // socket policy for every path.
  const originalResolve = ws.resolve
  ws.resolve = (info) => {
    const routeHooks = typeof originalResolve === 'function' ? originalResolve(info) : {}
    return { ...routeHooks, ...hooks }
  }
})
