import { http, recordSession, setToken, type SessionInfo } from './httpClient'
import { mapEntity } from './mappers'

export interface AuthUser {
  /** Stringified by the shared camelize/id mapper, same convention as every other entity's `id`. */
  id: string
  name: string
  email: string
  isActive: boolean
  /** Role names, for display only — every access check goes through `permissions`. */
  roles: string[]
  /** Flat, already resolved across every assigned role (Spatie's `getAllPermissions()`) — matches V12's login/getUserByToken shape. */
  permissions: string[]
}

export const authService = {
  async login(email: string, password: string): Promise<AuthUser> {
    const { token, user, session } = await http.post<{ token: string; user: unknown; session?: SessionInfo }>(
      '/login',
      { email, password },
    )
    // Timing first: the token write notifies listeners, and they should
    // already see the new sign-in's lifetime.
    recordSession(session)
    setToken(token)
    return mapEntity<AuthUser>(user)
  },

  async logout(): Promise<void> {
    try {
      await http.post('/logout')
    } finally {
      setToken(null)
    }
  },

  /** `session` rides along with the user; it is split off so it never lands on `AuthUser`. */
  async me(): Promise<AuthUser> {
    const { session, ...user } = await http.get<{ session?: SessionInfo } & Record<string, unknown>>('/me')
    recordSession(session)
    return mapEntity<AuthUser>(user)
  },

  /** "Continue session" — renews the idle timer only; the backend never extends the absolute limit. */
  async keepAlive(): Promise<void> {
    const { session } = await http.post<{ session?: SessionInfo }>('/session/keep-alive')
    recordSession(session)
  },
}
