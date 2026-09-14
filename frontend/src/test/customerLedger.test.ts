import { describe, expect, it } from 'vitest'
import type { CustomerTransaction } from '@/types'
import {
  buildCustomerLedgerRows,
  buildOpeningBalance,
  buildPayment,
  buildRefund,
  customerBalance,
  customerTotals,
  nextReference,
  openingBalances,
  openingBalanceTotal,
} from '@/utils/customerLedger'

/**
 * The customer ledger — one running balance, bank-statement style (§5).
 * `due = max(0, balance)`, `advance = max(0, -balance)` — there is no
 * per-invoice allocation and no separate advance pool to keep in sync.
 */

describe('running balance', () => {
  it('a sale debits, a payment credits, and the balance is just debit minus credit', () => {
    const transactions: CustomerTransaction[] = [
      {
        id: 't1',
        customerId: 'c1',
        date: '2026-09-05',
        type: 'sale',
        reference: 'INV-001',
        description: 'Sale — INV-001',
        debit: 70_000,
        credit: 0,
        createdAt: '2026-09-05T00:00:00Z',
      },
      buildPayment({ id: 't2', customerId: 'c1', date: '2026-09-10', reference: 'PAY-001', amount: 15_000, createdAt: '2026-09-10T00:00:00Z' }),
    ]

    const rows = buildCustomerLedgerRows(transactions)
    const ordered = [...rows].reverse()

    expect(ordered[0]!.balance).toBe(70_000)
    expect(ordered[1]!.balance).toBe(55_000)
    expect(customerBalance(transactions)).toBe(55_000)
  })

  it('§4 worked example: Sale 100,000, Paid at Sale 40,000, Due 60,000', () => {
    const transactions: CustomerTransaction[] = [
      { id: 't1', customerId: 'c1', date: '2026-09-01', type: 'sale', reference: 'INV-050', description: 'Sale — INV-050', debit: 100_000, credit: 0, createdAt: '2026-09-01T00:00:00.000Z' },
      buildPayment({ id: 't2', customerId: 'c1', date: '2026-09-01', reference: 'INV-050-PD', amount: 40_000, referenceSaleId: 's1', createdAt: '2026-09-01T00:00:00.001Z' }),
    ]

    const totals = customerTotals(transactions)
    expect(totals.totalSales).toBe(100_000)
    expect(totals.totalPaid).toBe(40_000)
    expect(totals.totalDue).toBe(60_000)
    expect(totals.availableAdvance).toBe(0)
  })
})

describe('a running balance belongs to one customer', () => {
  const sale = (id: string, customerId: string, date: string, amount: number): CustomerTransaction => ({
    id,
    customerId,
    date,
    type: 'sale',
    reference: `INV-${id}`,
    description: `Sale — ${id}`,
    debit: amount,
    credit: 0,
    createdAt: `${date}T00:00:00.000Z`,
  })

  it('never carries one customer’s figures into another’s row', () => {
    const transactions: CustomerTransaction[] = [
      sale('s1', 'abc', '2026-08-01', 75_000),
      buildPayment({ id: 'p1', customerId: 'abc', date: '2026-08-15', reference: 'PAY-001', amount: 25_000, createdAt: '2026-08-15T00:00:00.000Z' }),
      buildPayment({ id: 'p2', customerId: 'meghna', date: '2026-08-18', reference: 'PAY-002', amount: 20_000, createdAt: '2026-08-18T00:00:00.000Z' }),
      buildPayment({ id: 'p3', customerId: 'abc', date: '2026-08-28', reference: 'PAY-003', amount: 20_000, createdAt: '2026-08-28T00:00:00.000Z' }),
    ]

    const balanceOf = (id: string) => buildCustomerLedgerRows(transactions).find((r) => r.id === id)!.balance

    // ABC: 75,000 owed, less 25,000 then a further 20,000 — still 30,000 due.
    expect(balanceOf('s1')).toBe(75_000)
    expect(balanceOf('p1')).toBe(50_000)
    expect(balanceOf('p3')).toBe(30_000)

    // Meghna has bought nothing, so their payment is theirs alone — 20,000 in
    // advance, entirely unaffected by ABC's 25,000 three days earlier.
    expect(balanceOf('p2')).toBe(-20_000)
  })

  it('Cash In shows the customer’s real position, not a running total of receipts', () => {
    const transactions: CustomerTransaction[] = [
      sale('s1', 'abc', '2026-08-01', 75_000),
      buildPayment({ id: 'p1', customerId: 'abc', date: '2026-08-15', reference: 'PAY-001', amount: 25_000, createdAt: '2026-08-15T00:00:00.000Z' }),
      buildPayment({ id: 'p3', customerId: 'abc', date: '2026-08-28', reference: 'PAY-003', amount: 20_000, createdAt: '2026-08-28T00:00:00.000Z' }),
    ]

    // The Cash In table renders payments only, but balances come from the
    // whole ledger — so a customer who still owes never reads as "Advance".
    const payments = transactions.filter((t) => t.type === 'payment')
    const rows = buildCustomerLedgerRows(payments, transactions)

    expect(rows.map((r) => r.id)).toEqual(['p3', 'p1'])
    expect(rows.every((r) => r.balance > 0)).toBe(true)
    expect(rows.find((r) => r.id === 'p3')!.balance).toBe(30_000)
  })
})

describe('a date filter chooses rows, it does not erase history', () => {
  const sale = (id: string, customerId: string, date: string, amount: number): CustomerTransaction => ({
    id,
    customerId,
    date,
    type: 'sale',
    reference: `INV-${id}`,
    description: `Sale — ${id}`,
    debit: amount,
    credit: 0,
    createdAt: `${date}T00:00:00.000Z`,
  })

  /** The worked example: 20,000 opening, a 30,000 sale, a 10,000 payment. */
  const ledger: CustomerTransaction[] = [
    buildOpeningBalance({ id: 'o1', customerId: 'c1', date: '2026-08-01', reference: 'OPN-001', amount: 20_000, createdAt: '2026-08-01T00:00:00.000Z' }),
    sale('s1', 'c1', '2026-08-05', 30_000),
    buildPayment({ id: 'p1', customerId: 'c1', date: '2026-08-10', reference: 'PAY-001', amount: 10_000, createdAt: '2026-08-10T00:00:00.000Z' }),
  ]

  it('carries the balance from before the range into the first row shown', () => {
    // Filtered to 05 Aug → 10 Aug: the opening entry is not displayed, but the
    // 20,000 it represents is still underneath both rows that are.
    const inRange = ledger.filter((t) => t.date >= '2026-08-05' && t.date <= '2026-08-10')
    const rows = buildCustomerLedgerRows(inRange, ledger)

    expect(rows.map((r) => r.id)).toEqual(['p1', 's1'])
    expect(rows.find((r) => r.id === 's1')!.balance).toBe(50_000) // 20,000 + 30,000
    expect(rows.find((r) => r.id === 'p1')!.balance).toBe(40_000) // less 10,000
  })

  it('opening + movement in range = closing', () => {
    const from = '2026-08-05'
    const inRange = ledger.filter((t) => t.date >= from)

    const opening = openingBalanceTotal(ledger, from, 'c1')
    const movement = inRange.reduce((sum, t) => sum + t.debit - t.credit, 0)

    expect(opening).toBe(20_000)
    expect(opening + movement).toBe(40_000)
    expect(opening + movement).toBe(customerBalance(ledger))
  })

  it('counts a transaction dated on the first day as inside the range, not before it', () => {
    expect(openingBalanceTotal(ledger, '2026-08-01', 'c1')).toBe(0)
    expect(openingBalanceTotal(ledger, '2026-08-02', 'c1')).toBe(20_000)
  })

  it('has no opening balance when no range is set', () => {
    expect(openingBalanceTotal(ledger, undefined, 'c1')).toBe(0)
    expect(openingBalanceTotal(ledger, '', 'c1')).toBe(0)
  })

  it('never lets one customer’s history open another customer’s statement', () => {
    const mixed: CustomerTransaction[] = [
      ...ledger,
      sale('s2', 'c2', '2026-08-02', 70_000),
      buildPayment({ id: 'p2', customerId: 'c2', date: '2026-08-09', reference: 'PAY-002', amount: 5_000, createdAt: '2026-08-09T00:00:00.000Z' }),
    ]
    const from = '2026-08-05'

    const openings = openingBalances(mixed, from)
    expect(openings.get('c1')).toBe(20_000)
    expect(openings.get('c2')).toBe(70_000)

    // Company-wide opening is the sum of the two, never one running total.
    expect(openingBalanceTotal(mixed, from)).toBe(90_000)

    const rows = buildCustomerLedgerRows(mixed.filter((t) => t.date >= from), mixed)
    expect(rows.find((r) => r.id === 'p1')!.balance).toBe(40_000) // c1 only
    expect(rows.find((r) => r.id === 'p2')!.balance).toBe(65_000) // c2 only
  })
})

describe('customerTotals — due and advance are two sides of the same balance', () => {
  it('§13: 50,000 due, 20,000 paid, leaves exactly 30,000 due', () => {
    const transactions: CustomerTransaction[] = [
      { id: 't1', customerId: 'c1', date: '2026-09-01', type: 'sale', reference: 'INV-001', description: 'Sale — INV-001', debit: 50_000, credit: 0, createdAt: '2026-09-01T00:00:00Z' },
      buildPayment({ id: 't2', customerId: 'c1', date: '2026-09-03', reference: 'PAY-001', amount: 20_000, createdAt: '2026-09-03T00:00:00Z' }),
    ]

    const totals = customerTotals(transactions)
    expect(totals.totalDue).toBe(30_000)
    expect(totals.availableAdvance).toBe(0)
  })

  it('§3: an amount beyond what is owed shows as Advance, never a negative due', () => {
    const transactions: CustomerTransaction[] = [
      { id: 't1', customerId: 'c1', date: '2026-09-01', type: 'sale', reference: 'INV-001', description: 'Sale — INV-001', debit: 10_000, credit: 0, createdAt: '2026-09-01T00:00:00Z' },
      buildPayment({ id: 't2', customerId: 'c1', date: '2026-09-10', reference: 'PAY-001', amount: 15_000, createdAt: '2026-09-10T00:00:00Z' }),
    ]

    const totals = customerTotals(transactions)
    expect(totals.totalDue).toBe(0)
    expect(totals.availableAdvance).toBe(5_000)
  })

  it('is reduced by a refund', () => {
    const transactions: CustomerTransaction[] = [
      buildPayment({ id: 't1', customerId: 'c1', date: '2026-09-01', reference: 'PAY-001', amount: 50_000, createdAt: '' }),
      buildRefund({ id: 't2', customerId: 'c1', date: '2026-09-03', reference: 'REF-001', amount: 20_000, createdAt: '' }),
    ]

    expect(customerTotals(transactions).availableAdvance).toBe(30_000)
  })

  it('a customer with no transactions has zero due and zero advance', () => {
    const totals = customerTotals([])
    expect(totals.totalDue).toBe(0)
    expect(totals.availableAdvance).toBe(0)
    expect(totals.balance).toBe(0)
    expect(totals.lastTransactionDate).toBeNull()
  })
})

describe('opening balance', () => {
  it('is a debit when positive (the customer already owed us)', () => {
    const row = buildOpeningBalance({ id: 't1', customerId: 'c1', date: '2026-01-01', reference: 'OPN-001', amount: 20_000, createdAt: '' })
    expect(row).toMatchObject({ debit: 20_000, credit: 0 })
    expect(customerBalance([row])).toBe(20_000)
  })

  it('is a credit when negative (the customer was ahead)', () => {
    const row = buildOpeningBalance({ id: 't1', customerId: 'c1', date: '2026-01-01', reference: 'OPN-001', amount: -20_000, createdAt: '' })
    expect(row).toMatchObject({ debit: 0, credit: 20_000 })
    expect(customerBalance([row])).toBe(-20_000)
  })
})

describe('Cash In (§4) — a plain credit, never targeted at one invoice', () => {
  it('is a straightforward credit, with no invoice allocation logic involved', () => {
    const row = buildPayment({ id: 't1', customerId: 'c1', date: '2026-09-03', reference: 'PAY-001', amount: 20_000, createdAt: '2026-09-03T00:00:00Z' })
    expect(row).toMatchObject({ type: 'payment', debit: 0, credit: 20_000, referenceSaleId: undefined })
  })
})

describe('reference numbering', () => {
  it('is sequential per type and never reused', () => {
    const transactions: CustomerTransaction[] = [
      buildPayment({ id: 't1', customerId: 'c1', date: '2026-01-01', reference: 'PAY-001', amount: 1, createdAt: '' }),
      buildPayment({ id: 't2', customerId: 'c1', date: '2026-01-01', reference: 'PAY-002', amount: 1, createdAt: '' }),
    ]

    expect(nextReference('payment', transactions)).toBe('PAY-003')
    expect(nextReference('refund', transactions)).toBe('REF-001')
  })
})
