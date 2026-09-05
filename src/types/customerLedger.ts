import type { ID, ISODate } from './common'

export type CustomerTxnType =
  | 'sale'
  | 'payment'
  | 'advance'
  | 'advance_adjustment'
  | 'refund'
  | 'opening_balance'
  | 'other'

/**
 * One row of a customer's account — a simple running ledger, like a bank
 * statement.
 *
 * `balance = running(debit − credit)` — exactly the formula `utils/ledger.ts`
 * already uses for cash accounts, reused here for receivables. A sale is a
 * debit (Out, the customer owes more); a payment is a credit (In, money
 * came in) — both move the balance the same way, and `type` is what lets the
 * UI and reports tell them apart. There is no per-invoice allocation and no
 * separate advance pool: if the running balance goes negative, that
 * customer is simply ahead, and the UI labels it Advance rather than
 * tracking it as a different kind of thing.
 *
 * `referenceSaleId` links a payment to the one invoice it was collected
 * against *at the moment of sale* (`paidAtSale`) — informational only, for
 * that invoice's own history; a later Cash In is never required to target
 * one. `linkedAccountId` optionally posts the same event into the company's
 * Cash & Bank Ledger as a normal `Transaction`, so the two ledgers stay
 * reconcilable without being the same ledger.
 */
export interface CustomerTransaction {
  id: ID
  customerId: ID
  date: ISODate
  type: CustomerTxnType
  /** "INV-2026-001" / "PAY-001" — auto-numbered per type. */
  reference: string
  description: string
  debit: number
  credit: number
  referenceSaleId?: ID
  linkedAccountId?: ID
  /** How a payment arrived — Cash, Bank Transfer, Cheque, Mobile Banking… — for the Cash In report. Purely descriptive. */
  method?: string
  createdAt: string
}

/** A transaction with its running balance resolved. Derived, never stored. */
export interface CustomerLedgerRow extends CustomerTransaction {
  balance: number
}

/** A customer's financial summary — everything derived from the one running balance. Never stored. */
export interface CustomerTotals {
  totalSales: number
  totalPaid: number
  /** `max(0, balance)` — what the customer currently owes. */
  totalDue: number
  /** `max(0, -balance)` — what the customer is currently ahead by. */
  availableAdvance: number
  balance: number
  transactionCount: number
  lastTransactionDate: ISODate | null
}
