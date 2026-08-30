import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '@/types'
import {
  accountBalances,
  balanceOf,
  buildLedgerRows,
  buildTransferLegs,
  categoryBreakdown,
  idsToRemoveWith,
  monthMovement,
  totalBalances,
  transferCategory,
} from '@/utils/ledger'

/**
 * Cash and bank rules.
 *
 * The transfer tests are the important ones. A transfer that fails to write
 * both legs, or that gets counted as income, silently corrupts every figure
 * downstream of it — and it is the one behaviour a user cannot check by eye.
 */

const CASH: Account = { id: 'cash', name: 'Cash', kind: 'cash', system: true, createdAt: '2026-01-01T00:00:00Z' }
const UCB: Account = { id: 'ucb', name: 'UCB', kind: 'bank', system: false, createdAt: '2026-01-01T00:00:00Z' }
const DBBL: Account = { id: 'dbbl', name: 'Dutch Bangla', kind: 'bank', system: false, createdAt: '2026-01-01T00:00:00Z' }

const ACCOUNTS = [CASH, UCB, DBBL]

function txn(
  id: string,
  date: string,
  accountId: string,
  direction: 'in' | 'out',
  amount: number,
  extra: Partial<Transaction> = {},
): Transaction {
  return {
    id,
    date,
    details: id,
    accountId,
    direction,
    category: direction === 'in' ? 'Customer Payment' : 'Office Cost',
    amount,
    createdAt: `${date}T08:00:00.000Z`,
    ...extra,
  }
}

describe('account balance', () => {
  const transactions = [
    txn('a', '2026-08-01', 'cash', 'in', 500_000),
    txn('b', '2026-08-02', 'cash', 'out', 120_000),
    txn('c', '2026-08-03', 'ucb', 'in', 1_200_000),
  ]

  it('is total in less total out', () => {
    expect(balanceOf(transactions, 'cash')).toBe(380_000)
    expect(balanceOf(transactions, 'ucb')).toBe(1_200_000)
  })

  it('reports zero for an account with no entries', () => {
    expect(balanceOf(transactions, 'dbbl')).toBe(0)
  })

  it('separates cash from bank in the totals', () => {
    const totals = totalBalances(accountBalances(ACCOUNTS, transactions))

    expect(totals.cash).toBe(380_000)
    expect(totals.bank).toBe(1_200_000)
    expect(totals.combined).toBe(1_580_000)
  })

  it('can be taken as at a date, for a closing snapshot', () => {
    const balances = accountBalances(ACCOUNTS, transactions, '2026-08-02')
    const cash = balances.find((b) => b.accountId === 'cash')!

    // The 3rd's bank receipt has not happened yet on the 2nd.
    expect(cash.balance).toBe(380_000)
    expect(balances.find((b) => b.accountId === 'ucb')!.balance).toBe(0)
  })
})

describe('transfers', () => {
  const legs = buildTransferLegs({
    transferId: 't1',
    outId: 'out1',
    inId: 'in1',
    date: '2026-08-05',
    details: 'Deposit',
    amount: 300_000,
    from: CASH,
    to: UCB,
    createdAt: '2026-08-05T09:00:00.000Z',
  })

  it('writes exactly two legs, one out and one in', () => {
    expect(legs).toHaveLength(2)
    expect(legs[0]).toMatchObject({ accountId: 'cash', direction: 'out', amount: 300_000 })
    expect(legs[1]).toMatchObject({ accountId: 'ucb', direction: 'in', amount: 300_000 })
  })

  it('gives both legs the same transfer id', () => {
    expect(legs[0]!.transferId).toBe('t1')
    expect(legs[1]!.transferId).toBe('t1')
  })

  it('names the movement by what it does', () => {
    expect(transferCategory(CASH, UCB)).toBe('Cash to Bank')
    expect(transferCategory(UCB, CASH)).toBe('Bank to Cash')
    expect(transferCategory(UCB, DBBL)).toBe('Bank to Bank')
  })

  it('does NOT change the combined cash and bank total', () => {
    const opening = [
      txn('a', '2026-08-01', 'cash', 'in', 800_000),
      txn('b', '2026-08-01', 'ucb', 'in', 500_000),
    ]

    const before = totalBalances(accountBalances(ACCOUNTS, opening)).combined
    const after = totalBalances(accountBalances(ACCOUNTS, [...opening, ...legs])).combined

    // The money has moved, not arrived or left. This is the whole point.
    expect(before).toBe(1_300_000)
    expect(after).toBe(1_300_000)

    // But the individual accounts have moved.
    expect(balanceOf([...opening, ...legs], 'cash')).toBe(500_000)
    expect(balanceOf([...opening, ...legs], 'ucb')).toBe(800_000)
  })

  it('deletes both legs together, from either side', () => {
    const all = [txn('other', '2026-08-01', 'cash', 'in', 100), ...legs]

    expect(idsToRemoveWith(all, 'out1').sort()).toEqual(['in1', 'out1'])
    expect(idsToRemoveWith(all, 'in1').sort()).toEqual(['in1', 'out1'])
  })

  it('deletes only itself for an ordinary entry', () => {
    const all = [txn('solo', '2026-08-01', 'cash', 'in', 100), ...legs]
    expect(idsToRemoveWith(all, 'solo')).toEqual(['solo'])
  })

  it('is excluded from monthly income and expenditure', () => {
    const transactions = [
      txn('a', '2026-08-01', 'cash', 'in', 500_000),
      txn('b', '2026-08-02', 'cash', 'out', 120_000),
      ...legs,
    ]

    const movement = monthMovement(transactions, '2026-08')

    // Counting the transfer would inflate both sides by 300,000 and make the
    // month's turnover meaningless.
    expect(movement.monthIn).toBe(500_000)
    expect(movement.monthOut).toBe(120_000)
    expect(movement.net).toBe(380_000)
  })

  it('is excluded from the spending breakdown', () => {
    const breakdown = categoryBreakdown([...legs, txn('x', '2026-08-01', 'cash', 'out', 50_000)], 'out')

    expect(breakdown).toHaveLength(1)
    expect(breakdown[0]).toMatchObject({ category: 'Office Cost', amount: 50_000 })
  })
})

describe('the register', () => {
  const transactions = [
    txn('a', '2026-08-01', 'cash', 'in', 500_000),
    txn('b', '2026-08-02', 'cash', 'out', 120_000),
    txn('c', '2026-08-03', 'cash', 'in', 60_000),
    txn('d', '2026-08-02', 'ucb', 'in', 900_000),
  ]

  it('runs the balance per account, not across the whole list', () => {
    const rows = buildLedgerRows(transactions, ACCOUNTS)
    const cashRows = rows.filter((row) => row.accountId === 'cash')

    // Newest first, so the top cash row carries the final cash balance.
    expect(cashRows[0]!.balance).toBe(440_000)
    expect(rows.find((row) => row.accountId === 'ucb')!.balance).toBe(900_000)
  })

  it('shows a true opening balance when a date filter hides earlier rows', () => {
    const rows = buildLedgerRows(transactions, ACCOUNTS, { from: '2026-08-03' })

    // Only the 3rd's entry is visible, but its balance must still include
    // everything that came before it — otherwise the column restarts at zero
    // and reads as though the account were empty.
    expect(rows).toHaveLength(1)
    expect(rows[0]!.balance).toBe(440_000)
  })

  it('filters by account, direction, category and text', () => {
    expect(buildLedgerRows(transactions, ACCOUNTS, { accountId: 'ucb' })).toHaveLength(1)
    expect(buildLedgerRows(transactions, ACCOUNTS, { direction: 'out' })).toHaveLength(1)
    expect(
      buildLedgerRows(transactions, ACCOUNTS, { category: 'Customer Payment' }),
    ).toHaveLength(3)
    expect(buildLedgerRows(transactions, ACCOUNTS, { search: 'ucb' })).toHaveLength(1)
  })

  it('resolves the account name for display', () => {
    const rows = buildLedgerRows(transactions, ACCOUNTS, { accountId: 'ucb' })
    expect(rows[0]!.accountName).toBe('UCB')
  })
})
