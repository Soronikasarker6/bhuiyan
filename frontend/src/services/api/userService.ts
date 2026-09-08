import type { AppUser, ID } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export interface UserInput {
  name: string
  email: string
  isActive: boolean
  /** One-element array from the form's single-select — the API accepts any number, matching V12's multi-role model. */
  roles: string[]
}

export interface CreateUserInput extends UserInput {
  password: string
  passwordConfirmation: string
}

export const userService = {
  async list(): Promise<AppUser[]> {
    return mapEntities<AppUser>(await http.get('/users'))
  },
  async create(data: CreateUserInput): Promise<AppUser> {
    return mapEntity<AppUser>(
      await http.post('/users', {
        name: data.name,
        email: data.email,
        password: data.password,
        password_confirmation: data.passwordConfirmation,
        is_active: data.isActive,
        roles: data.roles,
      }),
    )
  },
  /** `roles` is sent regardless, but the backend silently ignores it unless the caller holds USERS_ROLE_ASSIGNMENT_EDIT. */
  async update(id: ID, data: UserInput): Promise<AppUser> {
    return mapEntity<AppUser>(
      await http.put(`/users/${id}`, {
        name: data.name,
        email: data.email,
        is_active: data.isActive,
        roles: data.roles,
      }),
    )
  },
  async remove(id: ID): Promise<void> {
    await http.delete(`/users/${id}`)
  },
  async toggleActive(id: ID): Promise<AppUser> {
    return mapEntity<AppUser>(await http.post(`/users/${id}/toggle-active`))
  },
  async resetPassword(id: ID, password: string, passwordConfirmation: string): Promise<void> {
    await http.post(`/users/${id}/reset-password`, {
      password,
      password_confirmation: passwordConfirmation,
    })
  },
}
