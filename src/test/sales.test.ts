import { describe, expect, it } from 'vitest'
import type { Customer, CustomerTransaction, MeshSize, Product, Sale, SaleItem } from '@/types'
import {
  buildSaleItemRows,
  buildSaleSummaries,
  buildSaleTransactions,
  itemsTotal,
  nextInvoiceNo,
  paymentStatusOf,
  saleAmountDue,
  saleAmountPaid,
  saleItemAmount,
} from '@/utils/sales'
import { buildAdvance, buildCustomerLedgerRows } from '@/utils/customerLedger'

/**
 * Sales — tested against the spec's own worked examples, so a regression
 * here is a regression against the numbers the business actually checked.
 */

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', name: 'Gray Limestone', code: 'GRL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
]
const MESH: MeshSize[] = [
  { id: 'm1', name: '10 Mesh', active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'm2', name: '20 Mesh', active: true, createdAt: '2026-01-01T00:00:00Z' },
]
const CUSTOMERS: Customer[] = [
  { id: 'c1', name: 'ABC Trading', openingBalance: 0, active: true, createdAt: '2026-01-01T00:00:00Z' },
]

describe('sale items', () => {
  it('reproduces the spec\'s own multi-item invoice: 50,000 + 22,500 = 72,500', () => {
    const items: SaleItem[] = [
      { id: 'i1', saleId: 's1', productId: 'p1', meshSizeId: 'm1', weightTon: 10, ratePerTon: 5_000 },
      { id: 'i2', saleId: 's1', productId: 'p2', meshSizeId: 'm2', weightTon: 5, ratePerTon: 4_500 },
    ]

    expect(saleItemAmount(items[0]!)).toBe(50_000)
    expect(saleItemAmount(items[1]!)).toBe(22_500)

    const rows = buildSaleItemRows(items, PRODUCTS, MESH)
    expect(itemsTotal(rows)).toBe(72_500)
  })
})

describe('credit sale (spec §12: 100,000 sold, 40,000 paid, 60,000 due)', () => {
  const sale: Sale = {
    id: 's1',
    invoiceNo: 'INV-2026-001',
    date: '2026-09-05',
    customerId: 'c1',
    paidAtSale: 40_000,
    createdAt: '2026-09-05T00:00:00Z',
  }

  it('owes exactly the difference between total and paid', () => {
    expect(saleAmountDue(100_000, 40_000)).toBe(60_000)
    expect(paymentStatusOf(100_000, 40_000)).toBe('partial')
  })

  it('drops the due automatically once a linked payment is recorded', () => {
    const transactions: CustomerTransaction[] = [
      ...buildSaleTransactions({ sale, totalAmount: 100_000, paymentReference: 'PD-1' }),
      {
        id: 'pay-1',
        customerId: 'c1',
        date: '2026-09-10',
        type: 'payment',
        reference: 'PAY-001',
        description: 'Payment received',
        debit: 0,
        credit: 60_000,
        referenceSaleId: 's1',
        createdAt: '2026-09-10T00:00:00Z',
      },
    ]

    const paid = saleAmountPaid(sale, transactions)
    expect(paid).toBe(100_000)
    expect(saleAmountDue(100_000, paid)).toBe(0)
  })
})

describe('advance applied to a sale (spec §11: advance 50,000, sale 35,000, remaining 15,000)', () => {
  const sale: Sale = {
    id: 's4',
    invoiceNo: 'INV-2026-004',
    date: '2026-09-02',
    customerId: 'c1',
    paidAtSale: 0,
    createdAt: '2026-09-02T00:00:00Z',
  }

  it('is settled in full once the advance-adjustment is recorded', () => {
    const transactions: CustomerTransaction[] = [
      ...buildSaleTransactions({ sale, totalAmount: 35_000, paymentReference: 'PD-4' }),
      {
        id: 'adj-1',
        customerId: 'c1',
        date: '2026-09-02',
        type: 'advance_adjustment',
        reference: 'ADJ-001',
        description: 'Advance applied',
        debit: 35_000,
        credit: 35_000,
        referenceSaleId: 's4',
        createdAt: '2026-09-02T00:00:00Z',
      },
    ]

    const paid = saleAmountPaid(sale, transactions)
    expect(paid).toBe(35_000)
    expect(saleAmountDue(35_000, paid)).toBe(0)
    expect(paymentStatusOf(35_000, paid)).toBe('paid')
  })
})

describe('ledger ordering when a sale is paid in full at the moment of sale', () => {
  it('never shows an intermediate balance as if the payment landed before the sale it settles', () => {
    // A customer with an existing advance, then one sale paid in full on the
    // same day it was raised — the exact shape that once produced a
    // nonsensical mid-ledger balance (the payment's linked row sorted before
    // the sale debit it belongs to, because they shared one `createdAt`).
    const sale = {
      id: 's1',
      invoiceNo: 'INV-2026-001',
      date: '2026-08-20',
      customerId: 'c1',
      truckNo: undefined,
      notes: undefined,
      paidAtSale: 72_500,
      createdAt: '2026-08-20T08:00:00.000Z',
    }

    const transactions = [
      buildAdvance({ id: 'adv-1', customerId: 'c1', date: '2026-08-15', reference: 'ADV-001', amount: 50_000, createdAt: '2026-08-15T08:00:00.000Z' }),
      ...buildSaleTransactions({ sale, totalAmount: 72_500, paymentReference: 'INV-2026-001-PD' }),
    ]

    const rows = buildCustomerLedgerRows(transactions)
    const ordered = [...rows].reverse() // oldest first, the order they actually happened

    expect(ordered.map((r) => r.type)).toEqual(['advance', 'sale', 'payment'])

    // -50,000 after the advance; +72,500 once the sale is raised; back to
    // -50,000 once its own payment lands — never a spurious -1,22,500.
    expect(ordered[0]!.balance).toBe(-50_000)
    expect(ordered[1]!.balance).toBe(22_500)
    expect(ordered[2]!.balance).toBe(-50_000)
  })
})

describe('invoice numbering', () => {
  it('is sequential within the year and never reused', () => {
    const sales: Sale[] = [
      { id: 's1', invoiceNo: 'INV-2026-001', date: '2026-01-01', customerId: 'c1', paidAtSale: 0, createdAt: '' },
      { id: 's2', invoiceNo: 'INV-2026-002', date: '2026-01-02', customerId: 'c1', paidAtSale: 0, createdAt: '' },
      { id: 's3', invoiceNo: 'INV-2025-009', date: '2025-01-02', customerId: 'c1', paidAtSale: 0, createdAt: '' },
    ]

    expect(nextInvoiceNo(sales, 2026)).toBe('INV-2026-003')
    expect(nextInvoiceNo(sales, 2027)).toBe('INV-2027-001')
  })
})

describe('sale summaries', () => {
  it('resolves customer name, totals and status for every sale', () => {
    const sale: Sale = { id: 's1', invoiceNo: 'INV-2026-001', date: '2026-09-05', customerId: 'c1', paidAtSale: 50_000, createdAt: '2026-09-05T00:00:00Z' }
    const items: SaleItem[] = [{ id: 'i1', saleId: 's1', productId: 'p1', meshSizeId: 'm1', weightTon: 10, ratePerTon: 5_000 }]
    const transactions = buildSaleTransactions({ sale, totalAmount: 50_000, paymentReference: 'PD-1' })

    const summaries = buildSaleSummaries([sale], items, PRODUCTS, MESH, CUSTOMERS, transactions)

    expect(summaries).toHaveLength(1)
    expect(summaries[0]).toMatchObject({ customerName: 'ABC Trading', totalAmount: 50_000, status: 'paid' })
  })
})
