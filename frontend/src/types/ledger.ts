import type { ID, ISODate, MonthKey } from './common'

export type AccountKind = 'cash' | 'bank'

export interface Account {
  id: ID
  name: string
  kind: AccountKind
  /** The cash account cannot be deleted; every business has one. */
  system: boolean
  createdAt: string
}

export type Direction = 'in' | 'out'

/**
 * Only meaningful when `direction === 'out'`: whether this category is a
 * real operating expense (eligible to be a Profit & Loss "Company Cost") or
 * a transfer/financing/personal movement that should never be one — Cash to
 * Bank, a bank loan repayment, a related-party debt. `undefined`/null on a
 * Cash In category, and on an older Cash Out category that predates this.
 */
export type ExpenseType = 'company_expense' | 'excluded'

export interface Category {
  id: ID
  name: string
  direction: Direction
  expenseType?: ExpenseType | null
  createdAt: string
}

export interface Transaction {
  id: ID
  date: ISODate
  details: string
  accountId: ID
  direction: Direction
  category: string
  amount: number
  /**
   * Present on both legs of a transfer, and identical between them. Money
   * moving between two of our own accounts is one event with two entries;
   * this is what keeps them together when one is deleted.
   */
  transferId?: ID
  /** Set only on the row a sale's "paid at sale" amount posted — mirrors CustomerTransaction.referenceSaleId. */
  referenceSaleId?: ID
  /**
   * Set on a money-in row that is a customer payment (§9). The payment is one
   * event with two ledger consequences — cash up here, due down there — so the
   * two rows are written together and deleted together;
   * `customerTransactionId` is the receivables row this one is paired with.
   */
  customerId?: ID
  customerTransactionId?: ID
  createdAt: string
}

/**
 * One row = one Cash Out category counts toward Profit & Loss's "Company
 * Costs" for one month — see `utils/ledger.ts`'s `companyCostCategoryTotals`.
 * Presence is the selection; there is no boolean to flip, only creating or
 * removing this row (mirrors the backend's `company_cost_selections` table).
 */
export interface CompanyCostSelection {
  id: ID
  monthKey: MonthKey
  categoryId: ID
}

/** A transaction with its running account balance resolved. Derived. */
export interface LedgerRow extends Transaction {
  accountName: string
  balance: number
}

export interface AccountBalance {
  accountId: ID
  accountName: string
  kind: AccountKind
  totalIn: number
  totalOut: number
  balance: number
}

export interface LedgerClosing {
  id: ID
  monthKey: MonthKey
  month: string
  year: number
  balances: Array<{ accountId: ID; accountName: string; kind: AccountKind; balance: number }>
  cashTotal: number
  bankTotal: number
  grandTotal: number
  monthIn: number
  monthOut: number
  netMovement: number
  closedAt: string
}
