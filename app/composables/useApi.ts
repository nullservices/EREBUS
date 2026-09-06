import type { FetchError } from 'ofetch'

export interface ApiError {
  status: number
  message: string
}

/**
 * Typed API client. Every call is same-origin (cookies ride along) and
 * failures are normalized into an ApiError with a readable message.
 */
type PlainFetch = (path: string, options?: Record<string, unknown>) => Promise<unknown>

export function useApi() {
  // Plain signature on purpose: nitro's typed-route inference over the full
  // API surface overflows the type checker, and callers declare T anyway.
  const api = $fetch.create({ baseURL: '/api' }) as unknown as PlainFetch

  async function request<T>(path: string, options?: Record<string, unknown>): Promise<T> {
    try {
      return (await api(path, options)) as T
    } catch (err) {
      const e = err as FetchError
      const data = e?.data as { message?: string } | string | undefined
      const message =
        (typeof data === 'object' && data?.message) ||
        (typeof data === 'string' && data) ||
        e?.statusMessage ||
        'Request failed'
      throw { status: e?.status ?? e?.statusCode ?? 500, message, cause: e } as ApiError
    }
  }

  return { request }
}
