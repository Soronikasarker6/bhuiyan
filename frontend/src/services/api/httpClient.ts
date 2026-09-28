/**
 * A thin fetch wrapper — every API call in the app goes through this, so
 * there is exactly one place that knows the base URL, attaches the auth
 * token, and decides what an error response means.
 *
 * It is also the one place that learns a sign-in has ended: any 401 on a
 * request that carried the current token clears the token and tells the
 * AuthProvider why (see `setUnauthorizedHandler`). The backend decides when a
 * session is over; nothing here second-guesses it.
 */
import type { SessionEndReason } from '@/constants/session'

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'
const TOKEN_KEY = 'bhuiyan.auth-token'
/** When the current sign-in runs out, as last reported by the backend — see `recordSession`. */
const SESSION_KEY = 'bhuiyan.auth-session'
/** Why the last sign-in ended, so other open tabs can say the same thing. */
const ENDED_KEY = 'bhuiyan.auth-ended'

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
    if (token) {
      window.localStorage.setItem(TOKEN_KEY, token)
      window.localStorage.removeItem(ENDED_KEY)
    } else {
      window.localStorage.removeItem(TOKEN_KEY)
      window.localStorage.removeItem(SESSION_KEY)
    }
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

// ------------------------------------------------------------ session timing

/** The backend's `session` block — relative seconds, so a wrong PC clock cannot skew it. */
export interface SessionInfo {
  expires_in: number
  absolute_expires_in: number
  idle_timeout: number
}

/** The same thing on this browser's clock, shared by every open tab through localStorage. */
export interface SessionTiming {
  /** Hard limit — fixed at sign-in; nothing the user does moves it. */
  absoluteExpiresAt: number
  idleTimeoutMs: number
  /** When the backend last saw an authenticated request from any tab. */
  lastActivityAt: number
}

export function getSessionTiming(): SessionTiming | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as SessionTiming) : null
  } catch {
    return null
  }
}

function writeSessionTiming(timing: SessionTiming): void {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(timing))
  } catch {
    // Without storage the warning just can't be shown; the backend still expires the session.
  }
}

/** Called with the `session` block from login, `/me` and keep-alive. */
export function recordSession(info: SessionInfo | null | undefined): void {
  if (!info) return
  const now = Date.now()
  writeSessionTiming({
    absoluteExpiresAt: now + info.absolute_expires_in * 1000,
    idleTimeoutMs: info.idle_timeout * 1000,
    lastActivityAt: now,
  })
}

/** Every authenticated request resets the backend's idle timer; mirror that here. */
function touchSession(): void {
  const timing = getSessionTiming()
  if (timing) writeSessionTiming({ ...timing, lastActivityAt: Date.now() })
}

/** Remembered for other tabs before the token is cleared — see the `storage` listener below. */
export function markSessionEnded(reason: SessionEndReason | 'logout'): void {
  try {
    window.localStorage.setItem(ENDED_KEY, reason)
  } catch {
    // Other tabs fall back to a generic message.
  }
}

function endedReason(): SessionEndReason {
  try {
    const stored = window.localStorage.getItem(ENDED_KEY)
    if (stored === 'expired' || stored === 'deactivated') return stored
  } catch {
    // fall through
  }
  return 'signed-out-elsewhere'
}

// ---------------------------------------------------------------- errors

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public errors?: Record<string, string[]>,
  ) {
    super(message)
  }
}

/** Called when the sign-in ends underneath the app, so it can drop back to the login screen. */
let onUnauthorized: ((reason: SessionEndReason) => void) | null = null
export function setUnauthorizedHandler(handler: ((reason: SessionEndReason) => void) | null): void {
  onUnauthorized = handler
}

/** The backend says why in `reason` — see bootstrap/app.php. */
function endReasonFrom(body: { reason?: string } | null): SessionEndReason {
  return body?.reason === 'account_deactivated' ? 'deactivated' : 'expired'
}

const otherTabSignInListeners = new Set<() => void>()

/** Notified when another tab of this browser signs in — see AuthProvider. */
export function onOtherTabSignIn(listener: () => void): () => void {
  otherTabSignInListeners.add(listener)
  return () => otherTabSignInListeners.delete(listener)
}

/**
 * Another tab signing out (by hand or by expiry) removes the shared token;
 * this tab hears it through the `storage` event and follows suit, so no tab
 * keeps showing protected data after the session it belonged to is gone. A
 * sign-in in another tab refreshes this one the same way.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== TOKEN_KEY || event.oldValue === event.newValue) return

    tokenChangeListeners.forEach((listener) => listener())
    if (event.newValue) otherTabSignInListeners.forEach((listener) => listener())
    else onUnauthorized?.(endedReason())
  })
}

// --------------------------------------------------------------- requests

/** Routes the backend serves without authentication — they neither need nor renew a session. */
const isPublicPath = (path: string) => path === '/login' || path.startsWith('/public/')

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
    const body = await response.json().catch(() => null)
    const reason = endReasonFrom(body)

    // Only react if this request actually carried a token, and it is still
    // the current one. A request sent with no token has no session to end —
    // reacting to its 401 would clear nothing and announce it anyway. And a
    // token that has since been replaced by a newer login can resolve to a
    // 401 *after* that newer session is active; acting on it unconditionally
    // would log a just-logged-in user straight back out.
    if (token && getToken() === token) {
      markSessionEnded(reason)
      setToken(null)
      onUnauthorized?.(reason)
    }
    throw new ApiError(body?.message ?? 'Your session has expired. Please log in again.', 401)
  }

  if (token && response.ok && !isPublicPath(path) && getToken() === token) {
    touchSession()
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
