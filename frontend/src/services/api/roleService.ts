import type { ID, Role } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export interface RoleInput {
  name: string
  permissions: string[]
}

export const roleService = {
  async list(): Promise<Role[]> {
    return mapEntities<Role>(await http.get('/roles'))
  },
  async create(data: RoleInput): Promise<Role> {
    return mapEntity<Role>(await http.post('/roles', data))
  },
  async update(id: ID, data: RoleInput): Promise<Role> {
    return mapEntity<Role>(await http.put(`/roles/${id}`, data))
  },
  async remove(id: ID): Promise<void> {
    await http.delete(`/roles/${id}`)
  },
  /** The fixed permission-name list, for the checklist — same names as `src/constants/permissions.ts`. */
  async listPermissions(): Promise<string[]> {
    return http.get<string[]>('/permissions')
  },
}
