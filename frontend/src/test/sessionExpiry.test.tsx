import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '@/hooks/useAuth'
import LoginPage from '@/pages/LoginPage'
import { RequireAuth } from '@/router/RequireAuth'
import {
  getSessionTiming,
  getToken,
  http,
  recordSession,
  setToken,
  setUnauthorizedHandler,
} from '@/services/api/httpClient'
import { formatCountdown, sessionCountdown } from '@/utils/session'

/**
 * Session expiry on the client. The backend decides when a sign-in is over
 * (see backend/tests/Feature/SessionExpirationTest.php); what is pinned down
 * here is that the app reacts to that decision once, centrally, and without
 * looping — and that the warning's arithmetic can never promise more time
 * than the 8-hour limit allows.
 */

const TOKEN_KEY = 'bhuiyan.auth-token'
const ME = {
  id: 1,
  name: 'Manager A',
  email: 'a@example.test',
  is_active: true,
  roles: ['Manager'],
  permissions: [],
  session: { expires_in: 3600, absolute_expires_in: 8 * 3600, idle_timeout: 3600 },
}

function json(status: number, body: unknown): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockFetch(handler: (path: string, init?: RequestInit) => Response) {
  const fn = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(handler(new URL(url).pathname.replace(/^\/api/, ''), init)),
  )
  vi.stubGlobal('fetch', fn)
  return fn
}

function renderApp(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<p>Protected dashboard</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  setUnauthorizedHandler(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('httpClient 401 handling', () => {
  it('clears the token and session timing and reports an expired session', async () => {
    setToken('live-token')
    recordSession(ME.session)
    window.localStorage.setItem('bhuiyan.sidebar-collapsed', '1')
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(() => json(401, { message: 'Your session has expired.', reason: 'idle_timeout' }))

    await expect(http.get('/app-data')).rejects.toMatchObject({ status: 401 })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith('expired')
    expect(getToken()).toBeNull()
    expect(getSessionTiming()).toBeNull()
    // Only auth state goes — unrelated preferences stay.
    expect(window.localStorage.getItem('bhuiyan.sidebar-collapsed')).toBe('1')
  })

  it('says so when the account was deactivated', async () => {
    setToken('live-token')
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(() => json(401, { reason: 'account_deactivated' }))

    await expect(http.get('/app-data')).rejects.toBeTruthy()

    expect(handler).toHaveBeenCalledWith('deactivated')
  })

  it('ignores a 401 on a request that carried no token', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    mockFetch(() => json(401, { reason: 'unauthenticated' }))

    await expect(http.get('/me')).rejects.toBeTruthy()

    expect(handler).not.toHaveBeenCalled()
  })

  it('counts an authenticated request as activity, but not a public one', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-28T09:00:00Z') })
    setToken('live-token')
    recordSession(ME.session)
    mockFetch(() => json(200, {}))

    vi.setSystemTime(new Date('2026-09-28T09:30:00Z'))
    await http.get('/public/company-profile')
    expect(getSessionTiming()!.lastActivityAt).toBe(Date.parse('2026-09-28T09:00:00Z'))

    await http.get('/app-data')
    expect(getSessionTiming()!.lastActivityAt).toBe(Date.parse('2026-09-28T09:30:00Z'))
  })
})

describe('sessionCountdown', () => {
  const signIn = Date.parse('2026-09-28T09:00:00Z')
  const minutes = (n: number) => n * 60_000

  it('runs out on the idle timer while well inside the 8 hours', () => {
    const timing = {
      absoluteExpiresAt: signIn + minutes(480),
      idleTimeoutMs: minutes(60),
      lastActivityAt: signIn + minutes(300),
    }

    expect(sessionCountdown(timing, signIn + minutes(340))).toEqual({
      deadline: signIn + minutes(360),
      remainingMs: minutes(20),
      limit: 'idle',
    })
  })

  it('never lets recent activity reach past the absolute limit', () => {
    const timing = {
      absoluteExpiresAt: signIn + minutes(480),
      idleTimeoutMs: minutes(60),
      lastActivityAt: signIn + minutes(470),
    }

    const countdown = sessionCountdown(timing, signIn + minutes(471))
    expect(countdown.limit).toBe('absolute')
    expect(countdown.deadline).toBe(signIn + minutes(480))
  })

  it('formats the remaining time', () => {
    expect(formatCountdown(299_500)).toBe('5:00')
    expect(formatCountdown(65_000)).toBe('1:05')
    expect(formatCountdown(-4_000)).toBe('0:00')
  })
})

describe('AuthProvider session expiry', () => {
  it('keeps a valid session on the protected page', async () => {
    setToken('live-token')
    mockFetch((path) => (path === '/me' ? json(200, ME) : json(404, {})))

    renderApp()

    expect(await screen.findByText('Protected dashboard')).toBeTruthy()
    expect(getSessionTiming()?.idleTimeoutMs).toBe(3_600_000)
  })

  it('sends an expired session to /login with a message, exactly once', async () => {
    setToken('stale-token')
    const fetchMock = mockFetch(() => json(401, { reason: 'max_lifetime' }))

    renderApp()

    expect(await screen.findByText('Your session has expired. Please log in again.')).toBeTruthy()
    expect(screen.queryByText('Protected dashboard')).toBeNull()
    expect(getToken()).toBeNull()

    // No retry, no redirect loop: one /me, and nothing after it.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not bounce around when already on /login with nothing to expire', async () => {
    const fetchMock = mockFetch(() => json(401, {}))

    renderApp('/login')

    expect(await screen.findByText('Sign in to continue')).toBeTruthy()
    expect(screen.queryByText('Your session has expired. Please log in again.')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('signs this tab out when another tab signs out', async () => {
    setToken('live-token')
    mockFetch((path) => (path === '/me' ? json(200, ME) : json(404, {})))
    renderApp()
    await screen.findByText('Protected dashboard')

    // What another tab's logout looks like from here.
    act(() => {
      window.localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new StorageEvent('storage', { key: TOKEN_KEY, oldValue: 'live-token', newValue: null }))
    })

    expect(await screen.findByText('You were signed out in another tab. Please log in again.')).toBeTruthy()
    expect(screen.queryByText('Protected dashboard')).toBeNull()
  })

  it('warns five minutes out, and "Continue session" renews the idle timer', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-28T09:00:00Z'), shouldAdvanceTime: true })
    setToken('live-token')
    const fetchMock = mockFetch((path) => {
      if (path === '/me') return json(200, ME)
      if (path === '/session/keep-alive') return json(200, { session: ME.session })
      return json(404, {})
    })

    renderApp()
    await screen.findByText('Protected dashboard')
    const dialog = () => document.querySelector('ui5-dialog')

    await act(async () => {
      vi.advanceTimersByTime(54 * 60_000)
    })
    expect(dialog()?.hasAttribute('open') ?? false).toBe(false)

    await act(async () => {
      vi.advanceTimersByTime(2 * 60_000) // 56 minutes idle: 4 left
    })
    await waitFor(() => expect(dialog()?.hasAttribute('open')).toBe(true))
    expect(dialog()?.textContent).toContain('Your session will expire in')

    const continueButton = screen.getByText('Continue session').closest('ui5-button')!
    await act(async () => {
      continueButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await waitFor(() => expect(dialog()?.hasAttribute('open')).toBe(false))
    expect(fetchMock.mock.calls.map(([url]) => new URL(url as string).pathname)).toContain(
      '/api/session/keep-alive',
    )
    expect(getSessionTiming()!.lastActivityAt).toBeGreaterThanOrEqual(Date.parse('2026-09-28T09:56:00Z'))
  })

  it('signs the tab out once the deadline passes, without extending the session', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-28T09:00:00Z'), shouldAdvanceTime: true })
    setToken('live-token')
    const fetchMock = mockFetch((path) => {
      if (path === '/me') return json(200, ME)
      // By the time the tab gives up, the backend has already expired it.
      return json(401, { reason: 'idle_timeout' })
    })

    renderApp()
    await screen.findByText('Protected dashboard')

    await act(async () => {
      vi.advanceTimersByTime(61 * 60_000)
    })

    expect(await screen.findByText('Your session has expired. Please log in again.')).toBeTruthy()
    const paths = fetchMock.mock.calls.map(([url]) => new URL(url as string).pathname)
    expect(paths).toEqual(['/api/me', '/api/logout'])
    expect(paths).not.toContain('/api/session/keep-alive')
  })
})
