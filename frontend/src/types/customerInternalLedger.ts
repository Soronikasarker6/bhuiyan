import type { ID, ISODate } from './common'

/**
 * The owner's private bookkeeping ledger.
 *
 * Deliberately *not* `CustomerTransaction` (see `customerLedger.ts`), which is
 * the operational receivables ledger behind Customer Due, Advance, Cash In and
 * every customer report. These two share only the customer they point at:
 * nothing here feeds a sale, a payment, cash, bank, stock or P&L.
 *
 * These types are never part of `AppData` — the private ledger is fetched by
 * its own Admin-only endpoint, so a Manager's browser never receives a row of
 * it in the first place.
 *
 * Convention, matched to the receivables ledger rather than invented here:
 * `balance = running(debit − credit)`; positive means the party owes us (Dr),
 * negative means they are ahead (Cr).
 */

export interface InternalLedgerRow {
  id: ID
  customerId: ID
  customerName: string | null
  date: ISODate
  details: string
  reference: string | null
  debit: number
  credit: number
  /** The book's true balance after this entry — always derived from the full series, never restarted inside a filter. */
  balance: number
  /** ILG-000123 — the handle the audit trail names this entry by. */
  entryNo: string
  /** Sent back with an edit so a stale save is refused rather than silently winning. */
  updatedAt?: string
}

/**
 * The period's position. Driven by the party and the date range only — a Type
 * or Search filter narrows the rows listed, not what the period contains.
 */
export interface InternalLedgerSummary {
  /** The balance carried into the period: everything before `from` (§12). */
  openingBalance: number
  totalDebit: number
  totalCredit: number
  closingBalance: number
  /** Rows currently listed, after every filter. */
  entryCount: number
  /** Rows inside the date period, before Type/Search narrowed them. */
  periodEntryCount: number
}

/** One party's stated opening balance — a starting position, not an entry. */
export interface InternalLedgerOpening {
  id: ID
  customerId: ID
  openingBalance: number
  asOf: ISODate | null
  notes: string | null
}

export interface InternalLedgerResponse {
  rows: InternalLedgerRow[]
  summary: InternalLedgerSummary
  /** True when Type/Search are hiding rows the summary still counts — the screen says so rather than looking wrong. */
  narrowed: boolean
  opening: InternalLedgerOpening | null
}

export interface InternalLedgerQuery {
  customerId?: string
  from?: string
  to?: string
  type?: 'debit' | 'credit'
  search?: string
}

/** What the Add/Edit form submits. Who made the change is never sent — the backend takes that from the session. */
export interface InternalLedgerEntryInput {
  customerId: ID
  date: ISODate
  details: string
  reference?: string
  debit?: number
  credit?: number
  reason?: string
}
