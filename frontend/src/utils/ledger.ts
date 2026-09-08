import type {
  Account,
  AccountBalance,
  ID,
  ISODate,
  LedgerRow,
  MonthKey,
  Transaction,
} from '@/types'
import { isWithin, monthKeyOf } from './format'

/**
 * Cash and bank arithmetic.
 *
 * Two rules the module exists to protect:
 *
 *   1. `Balance = Total In − Total Out`, always computed, never stored. A
 *      stored balance is a second source of truth, and the two will disagree.
 *
 *   2. A transfer moves money between two of our own accounts and therefore
 *      **cannot change the combined cash + bank total**. It is written as two
 *      linked legs and deleted as two linked legs; there is no code path that
 *      creates one without the other.
 */

// ---------------------------------------------------------------- balances

export function balanceOf(transactions: Transaction[], accountId: ID): number {
  return transactions
    .filter((t) => t.accountId === accountId)
    .reduce((total, t) => total + (t.direction === 'in' ? t.amount : -t.amount), 0)
}

export function accountBalances(
  accounts: Account[],
  transactions: Transaction[],
  asOf?: ISODate,
): AccountBalance[] {
  const relevant = asOf ? transactions.filter((t) => t.date <= asOf) : transactions

  return accounts.map((account) => {
    const own = relevant.filter((t) => t.accountId === account.id)

    const totalIn = own
      .filter((t) => t.direction === 'in')
      .reduce((sum, t) => sum + t.amount, 0)

    const totalOut = own
      .filter((t) => t.direction === 'out')
      .reduce((sum, t) => sum + t.amount, 0)

    return {
      accountId: account.id,
      accountName: account.name,
      kind: account.kind,
      totalIn,
      totalOut,
      balance: totalIn - totalOut,
    }
  })
}

export interface BalanceTotals {
  cash: number
  bank: number
  combined: number
}

export function totalBalances(balances: AccountBalance[]): BalanceTotals {
  const cash = balances
    .filter((b) => b.kind === 'cash')
    .reduce((sum, b) => sum + b.balance, 0)

  const bank = balances
    .filter((b) => b.kind === 'bank')
    .reduce((sum, b) => sum + b.balance, 0)

  return { cash, bank, combined: cash + bank }
}

// ---------------------------------------------------------------- transfers

/**
 * Name a transfer by what it does.
 *
 * "Cash to Bank" and "Bank to Cash" are the categories the office already
 * uses, so the transfer form does not ask for a category at all — it derives
 * one, and the two legs always agree on it.
 */
export function transferCategory(from: Account, to: Account): string {
  if (from.kind === 'cash' && to.kind === 'bank') return 'Cash to Bank'
  if (from.kind === 'bank' && to.kind === 'cash') return 'Bank to Cash'
  if (from.kind === 'bank' && to.kind === 'bank') return 'Bank to Bank'
  return 'Cash to Cash'
}

/**
 * Build both legs of a transfer.
 *
 * Returned as a pair so the caller cannot persist one without the other, and
 * carrying the same `transferId` so deletion can find its partner. The out leg
 * is listed first, which is the order they read in a register.
 */
export function buildTransferLegs(params: {
  transferId: ID
  outId: ID
  inId: ID
  date: ISODate
  details: string
  amount: number
  from: Account
  to: Account
  createdAt: string
}): [Transaction, Transaction] {
  const category = transferCategory(params.from, params.to)

  const base = {
    date: params.date,
    details: params.details || `Transfer ${params.from.name} → ${params.to.name}`,
    category,
    amount: params.amount,
    transferId: params.transferId,
    createdAt: params.createdAt,
  }

  return [
    { ...base, id: params.outId, accountId: params.from.id, direction: 'out' as const },
    { ...base, id: params.inId, accountId: params.to.id, direction: 'in' as const },
  ]
}

/**
 * Which transactions must go when one is deleted.
 *
 * For an ordinary entry, itself. For one leg of a transfer, both legs —
 * deleting a single leg would leave money that had left one account without
 * arriving at another, which is the exact imbalance the two-leg design exists
 * to prevent.
 */
export function idsToRemoveWith(transactions: Transaction[], id: ID): ID[] {
  const target = transactions.find((t) => t.id === id)
  if (!target) return []

  if (target.transferId) {
    return transactions.filter((t) => t.transferId === target.transferId).map((t) => t.id)
  }

  return [target.id]
}

export function isTransferLeg(transaction: Transaction): boolean {
  return Boolean(transaction.transferId)
}

// ---------------------------------------------------------------- the register

export interface LedgerFilters {
  search?: string
  accountId?: string
  category?: string
  direction?: '' | 'in' | 'out'
  from?: string
  to?: string
}

/**
 * The register: filtered, ordered oldest-first so the running balance means
 * something, then reversed for display.
 *
 * The running balance is **per account**, not across the whole list. A single
 * running total over a mixed-account list is a number that describes nothing.
 * When no account is selected the balance column is still per account, which
 * is the only reading of it that is true.
 */
export function buildLedgerRows(
  transactions: Transaction[],
  accounts: Account[],
  filters: LedgerFilters = {},
): LedgerRow[] {
  const names = new Map(accounts.map((a) => [a.id, a.name]))
  const needle = filters.search?.trim().toLowerCase()

  const filtered = transactions.filter((t) => {
    if (filters.accountId && t.accountId !== filters.accountId) return false
    if (filters.category && t.category !== filters.category) return false
    if (filters.direction && t.direction !== filters.direction) return false
    if (!isWithin(t.date, filters.from, filters.to)) return false

    if (needle) {
      const haystack = [t.details, t.category, names.get(t.accountId) ?? '']
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }

    return true
  })

  const ordered = [...filtered].sort(chronological)

  const runningByAccount = new Map<ID, number>()

  // Seed each account's running total with everything that came before the
  // filtered window, so the first visible row shows a true balance rather
  // than starting again from zero.
  for (const account of accounts) {
    const before = transactions.filter(
      (t) =>
        t.accountId === account.id &&
        ordered.length > 0 &&
        isBefore(t, ordered[0]!),
    )

    runningByAccount.set(
      account.id,
      before.reduce((sum, t) => sum + (t.direction === 'in' ? t.amount : -t.amount), 0),
    )
  }

  const rows: LedgerRow[] = ordered.map((t) => {
    const previous = runningByAccount.get(t.accountId) ?? 0
    const balance = previous + (t.direction === 'in' ? t.amount : -t.amount)
    runningByAccount.set(t.accountId, balance)

    return { ...t, accountName: names.get(t.accountId) ?? 'Unknown account', balance }
  })

  return rows.reverse()
}

function chronological(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : 1
}

function isBefore(a: Transaction, b: Transaction): boolean {
  return chronological(a, b) < 0
}

export interface LedgerTotals {
  totalIn: number
  totalOut: number
  net: number
  count: number
}

export function summariseRows(rows: LedgerRow[]): LedgerTotals {
  const totalIn = rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0)
  const totalOut = rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0)

  return { totalIn, totalOut, net: totalIn - totalOut, count: rows.length }
}

// ---------------------------------------------------------------- monthly close

export interface MonthMovement {
  monthIn: number
  monthOut: number
  net: number
}

/**
 * Money in and out for one month.
 *
 * Transfer legs are excluded from both sides. A transfer is not income when it
 * lands and not expenditure when it leaves; counting it would double the
 * month's turnover and make the net movement meaningless.
 */
export function monthMovement(transactions: Transaction[], key: MonthKey): MonthMovement {
  const own = transactions.filter(
    (t) => monthKeyOf(t.date) === key && !t.transferId,
  )

  const monthIn = own.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount, 0)
  const monthOut = own.filter((t) => t.direction === 'out').reduce((s, t) => s + t.amount, 0)

  return { monthIn, monthOut, net: monthIn - monthOut }
}

/** Cash and bank movement across a year, for the reports chart. */
export function monthlyCashSeries(
  transactions: Transaction[],
  year: number,
): Array<{ monthIndex: number; inflow: number; outflow: number }> {
  const series = Array.from({ length: 12 }, (_, monthIndex) => ({
    monthIndex,
    inflow: 0,
    outflow: 0,
  }))

  for (const t of transactions) {
    if (t.transferId) continue

    const [y, m] = t.date.split('-').map(Number)
    if (y !== year || !m) continue

    const bucket = series[m - 1]
    if (!bucket) continue

    if (t.direction === 'in') bucket.inflow += t.amount
    else bucket.outflow += t.amount
  }

  return series
}

/** Spend per category, biggest first — the answer to "where is it going". */
export function categoryBreakdown(
  transactions: Transaction[],
  direction: 'in' | 'out',
  filters: { from?: string; to?: string } = {},
): Array<{ category: string; amount: number; count: number }> {
  const totals = new Map<string, { amount: number; count: number }>()

  for (const t of transactions) {
    if (t.direction !== direction || t.transferId) continue
    if (!isWithin(t.date, filters.from, filters.to)) continue

    const existing = totals.get(t.category) ?? { amount: 0, count: 0 }
    existing.amount += t.amount
    existing.count += 1
    totals.set(t.category, existing)
  }

  return [...totals.entries()]
    .map(([category, value]) => ({ category, ...value }))
    .sort((a, b) => b.amount - a.amount)
}
