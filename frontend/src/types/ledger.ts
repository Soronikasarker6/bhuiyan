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

export interface Category {
  id: ID
  name: string
  direction: Direction
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
  createdAt: string
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
