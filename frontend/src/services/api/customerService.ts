import type { Customer, CustomerLedgerRow, CustomerTotals, CustomerTransaction } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export interface CustomerInput {
  name: string
  phone?: string
  address?: string
  company?: string
  openingBalance?: number
  notes?: string
  active: boolean
}

export interface PaymentInput {
  date: string
  amount: number
  method?: string
  accountId?: string
  description?: string
}

export const customerService = {
  async list(): Promise<Customer[]> {
    return mapEntities<Customer>(await http.get('/customers'))
  },
  async create(data: CustomerInput): Promise<Customer> {
    return mapEntity<Customer>(
      await http.post('/customers', {
        name: data.name,
        phone: data.phone,
        address: data.address,
        company: data.company,
        opening_balance: data.openingBalance ?? 0,
        notes: data.notes,
        active: data.active,
      }),
    )
  },
  async update(id: string, data: Omit<CustomerInput, 'openingBalance'>): Promise<Customer> {
    return mapEntity<Customer>(
      await http.put(`/customers/${id}`, {
        name: data.name,
        phone: data.phone,
        address: data.address,
        company: data.company,
        notes: data.notes,
        active: data.active,
      }),
    )
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/customers/${id}`)
  },
  async ledger(id: string): Promise<{ rows: CustomerLedgerRow[]; totals: CustomerTotals }> {
    const raw = await http.get<{ rows: unknown; totals: unknown }>(`/customers/${id}/ledger`)
    return { rows: mapEntities(raw.rows), totals: mapEntity(raw.totals) }
  },
  async recordPayment(customerId: string, data: PaymentInput): Promise<CustomerTransaction> {
    return mapEntity<CustomerTransaction>(
      await http.post(`/customers/${customerId}/payments`, {
        date: data.date,
        amount: data.amount,
        method: data.method,
        account_id: data.accountId,
        description: data.description,
      }),
    )
  },
}
