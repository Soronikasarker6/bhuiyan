import type { Account, AccountBalance, AccountKind } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export const accountService = {
  async list(): Promise<Account[]> {
    return mapEntities<Account>(await http.get('/accounts'))
  },
  async create(name: string, kind: AccountKind): Promise<Account> {
    return mapEntity<Account>(await http.post('/accounts', { name, kind }))
  },
  async update(id: string, name: string, kind: AccountKind): Promise<Account> {
    return mapEntity<Account>(await http.put(`/accounts/${id}`, { name, kind }))
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/accounts/${id}`)
  },
  async balance(id: string): Promise<AccountBalance> {
    return mapEntity<AccountBalance>(await http.get(`/accounts/${id}/balance`))
  },
}
