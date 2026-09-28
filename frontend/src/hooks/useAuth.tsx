import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { SESSION_END_MESSAGES, type SessionEndReason } from '@/constants/session'
import { SessionExpiryDialog } from '@/features/session/SessionExpiryDialog'
import { authService, type AuthUser } from '@/services/api/authService'
import {
  getToken,
  http,
  markSessionEnded,
  onOtherTabSignIn,
  setToken,
  setUnauthorizedHandler,
} from '@/services/api/httpClient'

/**
 * Token-based auth (Laravel Sanctum) plus role/permission checks, adapted
 * from the V12 project's own pattern: the login/me response carries a flat,
 * already-resolved `permissions` array (Spatie's `getAllPermissions()`), the
 * frontend caches it on the session user, and every check in the app goes
 * through one function — `isPermissionValid(name)` — walking that cached
 * list, the same name V12 itself uses.
 *
 * Session expiry is handled here once, for the whole app: the backend
 * refuses an expired token with a 401, `httpClient` clears it and calls the
 * unauthorized handler below, `user` becomes null and `RequireAuth` sends the
 * user to /login, where `sessionNotice` says why. No page checks for it.
 *
 * Only used when `__OFFLINE__` is false — see `src/hooks/useAppData.tsx`. The
 * offline single-file build never imports this at all.
 */

interface AuthValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isPermissionValid: (permission: string) => boolean
  /** Why the last sign-in ended, for the login screen — null after a manual logout. */
  sessionNotice: string | null
  /** "Continue session" — see SessionExpiryDialog. */
  keepAlive: () => Promise<void>
  /** Called by the expiry timer once the session's own deadline has passed. */
  expireSession: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [sessionNotice, setSessionNotice] = useState<string | null>(null)

  const endSession = useCallback((reason: SessionEndReason) => {
    setUser(null)
    setSessionNotice(SESSION_END_MESSAGES[reason])
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(endSession)
    return () => setUnauthorizedHandler(null)
  }, [endSession])

  // Signed in from another tab: pick up that user here too.
  useEffect(
    () =>
      onOtherTabSignIn(() => {
        authService
          .me()
          .then((signedIn) => {
            setUser(signedIn)
            setSessionNotice(null)
          })
          .catch(() => undefined)
      }),
    [],
  )

  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }

    authService
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const loggedIn = await authService.login(email, password)
    setSessionNotice(null)
    setUser(loggedIn)
  }, [])

  const logout = useCallback(async () => {
    markSessionEnded('logout')
    await authService.logout().catch(() => undefined)
    setSessionNotice(null)
    setUser(null)
  }, [])

  const keepAlive = useCallback(() => authService.keepAlive(), [])

  /**
   * The deadline has passed on this browser's clock. The backend has already
   * expired the token by now (see SESSION_EXPIRY_GRACE_MS), so this request
   * normally comes back 401 — which is what records the expiry in the audit
   * log — and in the rare case it doesn't, it revokes the token outright.
   * Either way, nothing here ever extends the session.
   */
  const expireSession = useCallback(async () => {
    if (!getToken()) return
    markSessionEnded('expired')
    await http.post('/logout').catch(() => undefined)
    setToken(null)
    endSession('expired')
  }, [endSession])

  const isPermissionValid = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  )

  const value = useMemo<AuthValue>(
    () => ({ user, loading, login, logout, isPermissionValid, sessionNotice, keepAlive, expireSession }),
    [user, loading, login, logout, isPermissionValid, sessionNotice, keepAlive, expireSession],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {user && <SessionExpiryDialog />}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an AuthProvider')
  return value
}

/**
 * Safe to call from any page component, including ones shared with the
 * offline single-file build (which never mounts `AuthProvider` at all,
 * since it has no auth concept) — same branch-by-build-flag pattern as
 * `Header.tsx`'s `useAccountIdentity`. Offline mode is single-user with no
 * roles, so every permission reads as granted there.
 */
export function usePermission(permission: string): boolean {
  return __OFFLINE__ ? true : useOnlinePermission(permission) // eslint-disable-line react-hooks/rules-of-hooks
}

function useOnlinePermission(permission: string): boolean {
  const { isPermissionValid } = useAuth()
  return isPermissionValid(permission)
}
