import { describe, expect, it } from 'vitest'
import type { CustomerTransaction } from '@/types'
import {
  availableAdvance,
  buildAdvance,
  buildAdvanceAdjustment,
  buildCustomerLedgerRows,
  buildOpeningBalance,
  buildPayment,
  buildRefund,
  customerBalance,
  nextReference,
} from '@/utils/customerLedger'

/**
 * The customer ledger — tested against the spec's own worked example (§10),
 * number for number.
 */

describe('running balance (spec §10)', () => {
  it('matches the example exactly: -50,000 -> 20,000 -> 5,000', () => {
    const transactions: CustomerTransaction[] = [
      buildAdvance({ id: 't1', customerId: 'c1', date: '2026-09-01', reference: 'ADV-001', amount: 50_000, createdAt: '2026-09-01T00:00:00Z' }),
      {
        id: 't2',
        customerId: 'c1',
        date: '2026-09-05',
        type: 'sale',
        reference: 'INV-001',
        description: 'Limestone Sale',
        debit: 70_000,
        credit: 0,
        createdAt: '2026-09-05T00:00:00Z',
      },
      buildPayment({ id: 't3', customerId: 'c1', date: '2026-09-10', reference: 'PAY-001', amount: 15_000, createdAt: '2026-09-10T00:00:00Z' }),
    ]

    const rows = buildCustomerLedgerRows(transactions)
    // Rows come back newest-first; reverse to read them in the order they happened.
    const ordered = [...rows].reverse()

    expect(ordered[0]!.balance).toBe(-50_000)
    expect(ordered[1]!.balance).toBe(20_000)
    expect(ordered[2]!.balance).toBe(5_000)

    expect(customerBalance(transactions)).toBe(5_000)
  })
})

describe('available advance (spec §11: 50,000 given, 35,000 used, 15,000 remaining)', () => {
  it('drops by exactly what is applied, and no more', () => {
    const transactions: CustomerTransaction[] = [
      buildAdvance({ id: 't1', customerId: 'c1', date: '2026-09-01', reference: 'ADV-001', amount: 50_000, createdAt: '' }),
      buildAdvanceAdjustment({ id: 't2', customerId: 'c1', date: '2026-09-02', reference: 'ADJ-001', amount: 35_000, referenceSaleId: 's4', createdAt: '' }),
    ]

    expect(availableAdvance(transactions)).toBe(15_000)
  })

  it('is unaffected by an unrelated sale or payment', () => {
    const transactions: CustomerTransaction[] = [
      buildAdvance({ id: 't1', customerId: 'c1', date: '2026-09-01', reference: 'ADV-001', amount: 50_000, createdAt: '' }),
      { id: 't2', customerId: 'c1', date: '2026-09-05', type: 'sale', reference: 'INV-001', description: 'Sale', debit: 70_000, credit: 0, createdAt: '' },
      buildPayment({ id: 't3', customerId: 'c1', date: '2026-09-10', reference: 'PAY-001', amount: 15_000, createdAt: '' }),
    ]

    expect(availableAdvance(transactions)).toBe(50_000)
  })

  it('is reduced by a refund', () => {
    const transactions: CustomerTransaction[] = [
      buildAdvance({ id: 't1', customerId: 'c1', date: '2026-09-01', reference: 'ADV-001', amount: 50_000, createdAt: '' }),
      buildRefund({ id: 't2', customerId: 'c1', date: '2026-09-03', reference: 'REF-001', amount: 20_000, createdAt: '' }),
    ]

    expect(availableAdvance(transactions)).toBe(30_000)
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

describe('reference numbering', () => {
  it('is sequential per type and never reused', () => {
    const transactions: CustomerTransaction[] = [
      buildAdvance({ id: 't1', customerId: 'c1', date: '2026-01-01', reference: 'ADV-001', amount: 1, createdAt: '' }),
      buildPayment({ id: 't2', customerId: 'c1', date: '2026-01-01', reference: 'PAY-001', amount: 1, createdAt: '' }),
      buildPayment({ id: 't3', customerId: 'c1', date: '2026-01-01', reference: 'PAY-002', amount: 1, createdAt: '' }),
    ]

    expect(nextReference('advance', transactions)).toBe('ADV-002')
    expect(nextReference('payment', transactions)).toBe('PAY-003')
    expect(nextReference('refund', transactions)).toBe('REF-001')
  })
})
