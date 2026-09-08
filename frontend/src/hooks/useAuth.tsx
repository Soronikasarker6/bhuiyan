import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { authService, type AuthUser } from '@/services/api/authService'
import { getToken, setUnauthorizedHandler } from '@/services/api/httpClient'

/**
 * Token-based auth (Laravel Sanctum) plus role/permission checks, adapted
 * from the V12 project's own pattern: the login/me response carries a flat,
 * already-resolved `permissions` array (Spatie's `getAllPermissions()`), the
 * frontend caches it on the session user, and every check in the app goes
 * through one function — `isPermissionValid(name)` — walking that cached
 * list, the same name V12 itself uses.
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
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    return () => setUnauthorizedHandler(null)
  }, [])

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
    setUser(loggedIn)
  }, [])

  const logout = useCallback(async () => {
    await authService.logout().catch(() => undefined)
    setUser(null)
  }, [])

  const isPermissionValid = useCallback(
    (permission: string) => user?.permissions.includes(permission) ?? false,
    [user],
  )

  const value = useMemo<AuthValue>(
    () => ({ user, loading, login, logout, isPermissionValid }),
    [user, loading, login, logout, isPermissionValid],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
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
