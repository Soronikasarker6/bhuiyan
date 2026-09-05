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
