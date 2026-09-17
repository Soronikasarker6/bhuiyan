import type { ID, LedgerClosing } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export interface TransactionInput {
  date: string
  details?: string
  accountId: ID
  direction: 'in' | 'out'
  categoryId: ID
  amount: number
}

export interface TransferInput {
  date: string
  fromAccountId: ID
  toAccountId: ID
  amount: number
  details?: string
}

/** Returns are intentionally loose — every mutation is followed by re-fetching /app-data. */
export const ledgerService = {
  createTransaction(data: TransactionInput): Promise<unknown> {
    return http.post('/transactions', {
      date: data.date,
      details: data.details,
      account_id: data.accountId,
      direction: data.direction,
      category_id: data.categoryId,
      amount: data.amount,
    })
  },
  transfer(data: TransferInput): Promise<unknown> {
    return http.post('/transactions/transfer', {
      date: data.date,
      from_account_id: data.fromAccountId,
      to_account_id: data.toAccountId,
      amount: data.amount,
      details: data.details,
    })
  },
  removeTransaction(id: ID): Promise<void> {
    return http.delete(`/transactions/${id}`)
  },
  /** Selects or clears one Cash Out category as a Profit & Loss "Company Cost" for one month. */
  setCompanyCostSelection(monthKey: string, categoryId: ID, selected: boolean): Promise<unknown> {
    return http.patch('/company-cost-selections', { month_key: monthKey, category_id: categoryId, selected })
  },
  /** Replaces the whole set of selected Company Cost categories for one month in a single request. */
  setCompanyCostSelections(monthKey: string, categoryIds: ID[]): Promise<unknown> {
    return http.put('/company-cost-selections', { month_key: monthKey, category_ids: categoryIds })
  },
  async closeMonth(monthKey: string): Promise<LedgerClosing> {
    return mapEntity<LedgerClosing>(await http.post('/ledger-closings', { month_key: monthKey }))
  },
  reopenMonth(id: ID): Promise<void> {
    return http.delete(`/ledger-closings/${id}`)
  },
  async listClosings(): Promise<LedgerClosing[]> {
    return mapEntities<LedgerClosing>(await http.get('/ledger-closings'))
  },
}
