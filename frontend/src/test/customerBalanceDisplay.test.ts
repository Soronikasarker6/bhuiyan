import { describe, expect, it } from 'vitest'
import type { CustomerTransaction, ID } from '@/types'
import {
  ADVANCE_TAG,
  allocateCustomerCredit,
  balanceStatusOf,
  buildCustomerLedgerRows,
  customerBalance,
  customerBalanceMagnitude,
  customerBalanceTag,
  customerTotals,
  formatCustomerBalance,
  openingBalanceTotal,
} from '@/utils/customerLedger'

/**
 * How a customer balance is written.
 *
 *     ৳ 30,000          owed to us
 *     ৳ 0               settled
 *     ৳ 10,000 (ADV)    paid ahead
 *
 * Never a minus sign. A `−` in a money column reads as "less money" long
 * before it reads as "the other party owes it", and on a printed statement it
 * is easy to miss entirely.
 *
 * The stored balance stays signed — that is the point of the last group of
 * tests here. Presentation changed; arithmetic did not.
 */

let seq = 0
const at = (day: number) => `2026-09-${String(day).padStart(2, '0')}`

function sale(day: number, amount: number, id: ID = `s${++seq}`): CustomerTransaction {
  return {
    id,
    customerId: 'c1',
    date: at(day),
    type: 'sale',
    reference: `INV-${id}`,
    description: 'Sale',
    debit: amount,
    credit: 0,
    referenceSaleId: id,
    createdAt: `${at(day)}T08:00:00.000Z`,
  }
}

function payment(day: number, amount: number): CustomerTransaction {
  return {
    id: `p${++seq}`,
    customerId: 'c1',
    date: at(day),
    type: 'payment',
    reference: `PAY-${seq}`,
    description: 'Cash In',
    debit: 0,
    credit: amount,
    createdAt: `${at(day)}T08:00:00.000Z`,
  }
}

describe('formatCustomerBalance', () => {
  it('writes a due as a plain amount', () => {
    expect(formatCustomerBalance(30_000)).toBe('৳ 30,000')
  })

  it('writes a settled account as zero', () => {
    expect(formatCustomerBalance(0)).toBe('৳ 0')
  })

  it('writes an advance as a positive amount tagged (ADV)', () => {
    expect(formatCustomerBalance(-10_000)).toBe(`৳ 10,000 ${ADVANCE_TAG}`)
    expect(formatCustomerBalance(-10_000)).toBe('৳ 10,000 (ADV)')
  })

  it('never emits a minus sign, whatever the figure', () => {
    for (const value of [-1, -0.5, -10_000, -1_23_456, 0, 1, 99_999]) {
      expect(formatCustomerBalance(value)).not.toContain('-')
      // `formatNumber` uses a true minus (U+2212), not a hyphen — check both.
      expect(formatCustomerBalance(value)).not.toContain('−')
    }
  })

  it('does not let a negative zero print as an advance', () => {
    expect(formatCustomerBalance(-0)).toBe('৳ 0')
    // Rounding dust from decimal arithmetic must not flip the direction.
    expect(formatCustomerBalance(-0.001)).toBe('৳ 0')
    expect(formatCustomerBalance(0.001)).toBe('৳ 0')
  })

  it('exposes the same decision as a tag and a magnitude, for callers that draw their own figure', () => {
    expect(customerBalanceTag(-10_000)).toBe('(ADV)')
    expect(customerBalanceTag(10_000)).toBe('')
    expect(customerBalanceTag(0)).toBe('')

    expect(customerBalanceMagnitude(-10_000)).toBe(10_000)
    expect(customerBalanceMagnitude(10_000)).toBe(10_000)
    expect(customerBalanceMagnitude(-0)).toBe(0)
  })
})

describe('the edge cases the change has to survive', () => {
  it('a sale creates a due', () => {
    const rows = [sale(1, 30_000)]
    expect(formatCustomerBalance(customerBalance(rows))).toBe('৳ 30,000')
    expect(balanceStatusOf(customerBalance(rows))).toBe('due')
  })

  it('a payment that clears the due shows zero, not an advance', () => {
    const rows = [sale(1, 30_000), payment(2, 30_000)]
    expect(formatCustomerBalance(customerBalance(rows))).toBe('৳ 0')
    expect(balanceStatusOf(customerBalance(rows))).toBe('no_due')
  })

  it('a payment beyond the due shows the surplus as (ADV)', () => {
    const rows = [sale(1, 30_000), payment(2, 40_000)]
    expect(formatCustomerBalance(customerBalance(rows))).toBe('৳ 10,000 (ADV)')
  })

  it('an opening advance against a later sale nets to the remaining advance', () => {
    const rows = [payment(1, 50_000), sale(2, 30_000)]
    expect(formatCustomerBalance(customerBalance(rows))).toBe('৳ 20,000 (ADV)')
  })

  it('handles several sales and payments across dates', () => {
    const rows = [sale(1, 20_000), payment(3, 50_000), sale(5, 10_000), payment(8, 5_000)]
    // 20,000 − 50,000 + 10,000 − 5,000 = −25,000
    expect(customerBalance(rows)).toBe(-25_000)
    expect(formatCustomerBalance(customerBalance(rows))).toBe('৳ 25,000 (ADV)')
  })

  it('carries the opening balance into a date-filtered statement, still without a minus sign', () => {
    const rows = [payment(1, 20_000), sale(10, 50_000), payment(11, 10_000)]

    const opening = openingBalanceTotal(rows, at(10), 'c1')
    expect(opening).toBe(-20_000)
    expect(formatCustomerBalance(opening)).toBe('৳ 20,000 (ADV)')

    const closing = customerBalance(rows)
    expect(closing).toBe(20_000)
    expect(formatCustomerBalance(closing)).toBe('৳ 20,000')
  })

  it('writes every running balance on a ledger without a minus sign', () => {
    const rows = buildCustomerLedgerRows([payment(1, 50_000), sale(2, 30_000)])

    for (const row of rows) {
      expect(formatCustomerBalance(row.balance)).not.toContain('−')
    }
    // Newest first: after the sale the account is still 20,000 ahead.
    expect(formatCustomerBalance(rows[0]!.balance)).toBe('৳ 20,000 (ADV)')
    expect(formatCustomerBalance(rows[1]!.balance)).toBe('৳ 50,000 (ADV)')
  })
})

describe('the data model is untouched', () => {
  it('keeps the stored balance signed, so sorting and sums still work on it', () => {
    const rows = [sale(1, 30_000), payment(2, 40_000)]

    // Negative in the data...
    expect(customerBalance(rows)).toBe(-10_000)
    expect(customerTotals(rows).balance).toBe(-10_000)
    expect(allocateCustomerCredit(rows).balance).toBe(-10_000)
    // ...positive only on the way to the page.
    expect(formatCustomerBalance(-10_000)).toBe('৳ 10,000 (ADV)')
  })

  it('still splits the one signed balance into due and advance the way it always did', () => {
    const totals = customerTotals([sale(1, 30_000), payment(2, 40_000)])

    expect(totals.totalDue).toBe(0)
    expect(totals.availableAdvance).toBe(10_000)
    expect(totals.balance).toBe(-10_000)
  })

  it('sorts by the real signed number, not by what is printed', () => {
    const balances = [30_000, -10_000, 0, -50_000, 5_000]
    const ascending = [...balances].sort((a, b) => a - b)

    // Most-in-advance first, most-owing last — which printing magnitudes
    // would scramble.
    expect(ascending).toEqual([-50_000, -10_000, 0, 5_000, 30_000])
    expect(ascending.map(formatCustomerBalance)).toEqual([
      '৳ 50,000 (ADV)',
      '৳ 10,000 (ADV)',
      '৳ 0',
      '৳ 5,000',
      '৳ 30,000',
    ])
  })
})
