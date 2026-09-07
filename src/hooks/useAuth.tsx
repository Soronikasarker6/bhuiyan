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
 * Single-admin, token-based auth (Laravel Sanctum) for the backend-connected
 * app. There are no roles/permissions yet — this mirrors the app's current
 * single-actor design ("Office Admin") and is meant to be expanded later, not
 * a full multi-user system.
 *
 * Only used when `__OFFLINE__` is false — see `src/hooks/useAppData.tsx`. The
 * offline single-file build never imports this at all.
 */

interface AuthValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
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

  const value = useMemo<AuthValue>(() => ({ user, loading, login, logout }), [user, loading, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an AuthProvider')
  return value
}
