/**
 * A thin fetch wrapper — every API call in the app goes through this, so
 * there is exactly one place that knows the base URL, attaches the auth
 * token, and decides what an error response means.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'
const TOKEN_KEY = 'bhuiyan.auth-token'

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

const tokenChangeListeners = new Set<() => void>()

/** Notified after a successful login and after logout — see useAppData.tsx. */
export function onTokenChange(listener: () => void): () => void {
  tokenChangeListeners.add(listener)
  return () => tokenChangeListeners.delete(listener)
}

export function setToken(token: string | null): void {
  const previous = getToken()

  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // A browser that refuses to persist the token still works for this tab.
  }

  // Only a real change is a change. Clearing an already-absent token used to
  // notify anyway, and since both `useAppData` and `useCompanyProfile` refetch
  // on that notification, a single 401 became an endless loop: 401 → clear →
  // notify → refetch → 401. Listeners exist to hear about a session starting
  // or ending, not about a no-op write.
  if (previous === token) return

  tokenChangeListeners.forEach((listener) => listener())
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: Record<string, string[]>,
  ) {
    super(message)
  }
}

/** Called on a 401 so the app can drop back to the login screen. */
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${BASE_URL}${path}`, { ...init, headers })

  if (response.status === 401) {
    // Only react if this request actually carried a token, and it is still
    // the current one. A request sent with no token has no session to end —
    // reacting to its 401 would clear nothing and announce it anyway. And a
    // token that has since been replaced by a newer login can resolve to a
    // 401 *after* that newer session is active; acting on it unconditionally
    // would log a just-logged-in user straight back out.
    if (token && getToken() === token) {
      setToken(null)
      onUnauthorized?.()
    }
    throw new ApiError('Your session has expired — please sign in again.', 401)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const message = body?.message ?? `Request failed (${response.status})`
    throw new ApiError(message, response.status, body?.errors)
  }

  return body as T
}

/** `FormData` (a file upload, e.g. the company logo) goes through as-is; anything else is JSON. */
function bodyOf(data: unknown): BodyInit | undefined {
  if (data === undefined) return undefined
  return data instanceof FormData ? data : JSON.stringify(data)
}

export const http = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) => request<T>(path, { method: 'POST', body: bodyOf(data) }),
  put: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PUT', body: bodyOf(data) }),
  patch: <T>(path: string, data?: unknown) => request<T>(path, { method: 'PATCH', body: bodyOf(data) }),
  // A DELETE may carry a body — a void's reason travels with the action
  // itself rather than as a second request that could fail on its own.
  delete: <T>(path: string, data?: unknown) => request<T>(path, { method: 'DELETE', body: bodyOf(data) }),
}
