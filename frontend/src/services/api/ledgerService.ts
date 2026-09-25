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

/**
 * Editing an entry already recorded. `reason` is the correction's own
 * explanation, kept on the audit event; `expectedUpdatedAt` is the row's
 * `updated_at` as it was when the form was opened, so the backend can refuse
 * a save that would silently overwrite a newer edit by someone else (§28).
 *
 * Who made the change is never sent — the backend takes that from the
 * authenticated session and nothing here could override it (§5).
 */
export interface TransactionEditInput extends TransactionInput {
  reason?: string
  expectedUpdatedAt?: string
}

/** A transfer is edited as one operation, never one leg at a time (§17). */
export interface TransferEditInput extends TransferInput {
  reason?: string
  expectedUpdatedAt?: string
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
  /** Updates the entry in place — the reference (TX-000123) never changes (§13). */
  updateTransaction(id: ID, data: TransactionEditInput): Promise<unknown> {
    return http.put(`/transactions/${id}`, {
      date: data.date,
      details: data.details,
      account_id: data.accountId,
      direction: data.direction,
      category_id: data.categoryId,
      amount: data.amount,
      reason: data.reason,
      expected_updated_at: data.expectedUpdatedAt,
    })
  },
  /** Both legs at once, on either leg's id — the backend moves them together. */
  updateTransfer(id: ID, data: TransferEditInput): Promise<unknown> {
    return http.put(`/transactions/${id}`, {
      date: data.date,
      from_account_id: data.fromAccountId,
      to_account_id: data.toAccountId,
      amount: data.amount,
      details: data.details,
      reason: data.reason,
      expected_updated_at: data.expectedUpdatedAt,
    })
  },
  /**
   * Voids the entry (§14) — it leaves the active register, the original
   * figures stay behind the audit event. `reason` is what the audit trail
   * shows next to "Deleted by".
   */
  removeTransaction(id: ID, reason?: string): Promise<void> {
    // DELETE with a body, so the reason travels with the action rather than
    // as a second request that could fail on its own.
    return http.delete(`/transactions/${id}`, reason ? { reason } : undefined)
  },
  restoreTransaction(id: ID, reason?: string): Promise<unknown> {
    return http.post(`/transactions/${id}/restore`, reason ? { reason } : undefined)
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
