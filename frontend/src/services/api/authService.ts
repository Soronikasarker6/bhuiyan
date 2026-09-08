import { http, setToken } from './httpClient'
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
    const { token, user } = await http.post<{ token: string; user: unknown }>('/login', {
      email,
      password,
    })
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

  async me(): Promise<AuthUser> {
    return mapEntity<AuthUser>(await http.get('/me'))
  },
}
