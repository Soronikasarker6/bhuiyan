import { describe, expect, it } from 'vitest'
import type { CustomerTransaction, ID } from '@/types'
import {
  allocateCustomerCredit,
  balanceStatusOf,
  customerBalance,
  openingBalanceTotal,
} from '@/utils/customerLedger'
import { paymentStatusOf, saleAmountDue } from '@/utils/sales'

/**
 * Credit allocation — the one place that decides which payments have settled
 * which invoices.
 *
 * Payments in this system are recorded against the *customer*, not against an
 * invoice: only the amount collected at the moment of sale carries a
 * `referenceSaleId`. Reading an invoice's position from that field alone
 * reported every ordinary Cash In as if it had never happened, so a customer
 * who had paid in full still showed a page of Due invoices. These are the
 * cases that were wrong, written as the business stated them.
 *
 * The invariant underneath all of it: however the money is *attributed*,
 * `allocateCustomerCredit().balance` is the same number `customerBalance()`
 * returns for the same rows. Allocation never invents or loses money.
 */

let seq = 0
const at = (day: number) => `2026-09-${String(day).padStart(2, '0')}`
const stamp = (day: number) => `${at(day)}T08:00:00.000Z`

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
    createdAt: stamp(day),
  }
}

/** A plain Cash In — against the account, naming no invoice. This is the normal case. */
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
    createdAt: stamp(day),
  }
}

const settle = (rows: CustomerTransaction[], saleId: ID) => {
  const result = allocateCustomerCredit(rows)
  return {
    ...result,
    paid: result.paidBySale.get(saleId) ?? 0,
    advance: result.advanceBySale.get(saleId) ?? 0,
  }
}

describe('the balance is never changed by allocating it', () => {
  it('reports the same figure customerBalance does, in every shape', () => {
    const cases: CustomerTransaction[][] = [
      [sale(1, 100_000), payment(2, 100_000)],
      [sale(1, 100_000), payment(2, 60_000)],
      [sale(1, 100_000), payment(2, 120_000)],
      [payment(1, 50_000), sale(2, 30_000)],
      [payment(1, 20_000), sale(2, 50_000)],
      [sale(1, 40_000), sale(2, 60_000), payment(3, 75_000)],
    ]

    for (const rows of cases) {
      expect(allocateCustomerCredit(rows).balance).toBeCloseTo(customerBalance(rows), 6)
    }
  })
})

describe('TEST 1 — fully paid', () => {
  it('settles the invoice and leaves the account at zero', () => {
    const rows = [sale(1, 100_000, 'inv1'), payment(2, 100_000)]
    const { paid, advance, balance } = settle(rows, 'inv1')

    expect(paid).toBe(100_000)
    expect(saleAmountDue(100_000, paid)).toBe(0)
    expect(paymentStatusOf(100_000, paid, advance)).toBe('paid')
    expect(balance).toBe(0)
    expect(balanceStatusOf(balance)).toBe('no_due')
  })
})

describe('TEST 2 — due', () => {
  it('leaves the unpaid remainder owing', () => {
    const rows = [sale(1, 100_000, 'inv1'), payment(2, 60_000)]
    const { paid, advance, balance } = settle(rows, 'inv1')

    expect(paid).toBe(60_000)
    expect(saleAmountDue(100_000, paid)).toBe(40_000)
    expect(paymentStatusOf(100_000, paid, advance)).toBe('partial')
    expect(balance).toBe(40_000)
    expect(balanceStatusOf(balance)).toBe('due')
  })
})

describe('TEST 3 — advance', () => {
  it('settles the invoice in full and carries the surplus as advance', () => {
    const rows = [sale(1, 100_000, 'inv1'), payment(2, 120_000)]
    const { paid, advance, balance, unappliedCredit } = settle(rows, 'inv1')

    expect(paid).toBe(100_000)
    expect(saleAmountDue(100_000, paid)).toBe(0)
    // The invoice was settled by money received for it, so it reads Paid —
    // it is the *account* that is in advance, by the surplus.
    expect(paymentStatusOf(100_000, paid, advance)).toBe('paid')
    expect(balance).toBe(-20_000)
    expect(unappliedCredit).toBe(20_000)
    expect(balanceStatusOf(balance)).toBe('advance')
  })
})

describe('TEST 4 — an existing advance covers a new sale', () => {
  it('does not report Due ৳30,000 against a customer already ৳50,000 ahead', () => {
    const rows = [payment(1, 50_000), sale(2, 30_000, 'inv1')]
    const { paid, advance, balance } = settle(rows, 'inv1')

    expect(paid).toBe(30_000)
    expect(saleAmountDue(30_000, paid)).toBe(0)
    expect(advance).toBe(30_000)
    expect(paymentStatusOf(30_000, paid, advance)).toBe('advance')
    expect(balance).toBe(-20_000)
    expect(balanceStatusOf(balance)).toBe('advance')
  })
})

describe('TEST 5 — an existing advance partly covers a new sale', () => {
  it('owes only the uncovered remainder', () => {
    const rows = [payment(1, 20_000), sale(2, 50_000, 'inv1')]
    const { paid, advance, balance } = settle(rows, 'inv1')

    expect(paid).toBe(20_000)
    expect(saleAmountDue(50_000, paid)).toBe(30_000)
    expect(advance).toBe(20_000)
    expect(paymentStatusOf(50_000, paid, advance)).toBe('partial')
    expect(balance).toBe(30_000)
    expect(balanceStatusOf(balance)).toBe('due')
  })
})

describe('TEST 6 — editing a payment turns an advance back into a due', () => {
  it('re-reports the whole position from the corrected figure', () => {
    const before = [sale(1, 100_000, 'inv1'), payment(2, 120_000)]
    expect(settle(before, 'inv1').balance).toBe(-20_000)

    // The same ledger with the payment corrected to 80,000 — which is what
    // editing it produces, since the row is updated in place rather than
    // replaced.
    const corrected = [sale(1, 100_000, 'inv1'), payment(2, 80_000)]
    const { paid, advance, balance } = settle(corrected, 'inv1')

    expect(paid).toBe(80_000)
    expect(saleAmountDue(100_000, paid)).toBe(20_000)
    expect(paymentStatusOf(100_000, paid, advance)).toBe('partial')
    expect(balance).toBe(20_000)
    expect(balanceStatusOf(balance)).toBe('due')
  })
})

describe('TEST 7 — a date filter carries the balance forward', () => {
  it('opens on the position before the range, not on zero', () => {
    const rows = [
      payment(1, 20_000), // account is 20,000 in advance before the range
      sale(10, 50_000, 'inv1'),
      payment(11, 10_000),
    ]

    const opening = openingBalanceTotal(rows, at(10), 'c1')
    expect(opening).toBe(-20_000)

    const insideRange = rows.filter((t) => t.date >= at(10))
    const movement = insideRange.reduce((sum, t) => sum + t.debit - t.credit, 0)

    // −20,000 + 50,000 − 10,000 = +20,000 due, never +40,000 from zero.
    expect(opening + movement).toBe(20_000)
    expect(customerBalance(rows)).toBe(20_000)
  })
})

describe('FIFO across several invoices', () => {
  it('settles the oldest outstanding invoice first', () => {
    const rows = [sale(1, 40_000, 'inv1'), sale(2, 60_000, 'inv2'), payment(3, 75_000)]
    const result = allocateCustomerCredit(rows)

    expect(result.paidBySale.get('inv1')).toBe(40_000)
    expect(result.paidBySale.get('inv2')).toBe(35_000)
    expect(result.balance).toBe(25_000)
  })

  it('never reports more paid against an invoice than the invoice is worth', () => {
    const rows = [sale(1, 40_000, 'inv1'), payment(2, 100_000)]
    expect(allocateCustomerCredit(rows).paidBySale.get('inv1')).toBe(40_000)
  })
})

describe('charges that are not invoices take their turn in the queue', () => {
  it('lets an opening balance absorb credit before a later sale does', () => {
    const opening: CustomerTransaction = {
      id: 'opn1',
      customerId: 'c1',
      date: at(1),
      type: 'opening_balance',
      reference: 'OPN-001',
      description: 'Opening balance',
      debit: 30_000,
      credit: 0,
      createdAt: stamp(1),
    }

    const rows = [opening, sale(2, 50_000, 'inv1'), payment(3, 60_000)]
    const result = allocateCustomerCredit(rows)

    // 30,000 clears the opening balance; the remaining 30,000 goes to the sale.
    expect(result.paidBySale.get('inv1')).toBe(30_000)
    expect(result.balance).toBe(20_000)
  })
})

describe('paid at sale', () => {
  it('counts against its own invoice, not as advance', () => {
    const invoice = sale(5, 50_000, 'inv1')
    const paidAtSale: CustomerTransaction = {
      id: 'inv1-pd',
      customerId: 'c1',
      date: at(5),
      type: 'payment',
      reference: 'INV-inv1-PD',
      description: 'Paid at sale',
      debit: 0,
      credit: 50_000,
      referenceSaleId: 'inv1',
      // Deliberately the same instant as the invoice — the real shape, and
      // the one that used to decide the answer by id ordering alone.
      createdAt: stamp(5),
    }

    const { paid, advance, balance } = settle([invoice, paidAtSale], 'inv1')

    expect(paid).toBe(50_000)
    expect(advance).toBe(0)
    expect(paymentStatusOf(50_000, paid, advance)).toBe('paid')
    expect(balance).toBe(0)
  })
})
