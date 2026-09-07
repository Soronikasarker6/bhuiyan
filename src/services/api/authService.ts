import { http, setToken } from './httpClient'

export interface AuthUser {
  id: number
  name: string
  email: string
}

export const authService = {
  async login(email: string, password: string): Promise<AuthUser> {
    const { token, user } = await http.post<{ token: string; user: AuthUser }>('/login', {
      email,
      password,
    })
    setToken(token)
    return user
  },

  async logout(): Promise<void> {
    try {
      await http.post('/logout')
    } finally {
      setToken(null)
    }
  },

  me(): Promise<AuthUser> {
    return http.get<AuthUser>('/me')
  },
}
