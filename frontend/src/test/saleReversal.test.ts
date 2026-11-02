import { describe, expect, it } from 'vitest'
import type { Customer, CustomerTransaction, MeshSize, Product, RawMaterialImport, Sale, SaleItem, ShipmentCycle } from '@/types'
import { buildSaleSummaries, buildSaleTransactions, rawMaterialSaleMovements, standingSales } from '@/utils/sales'
import { buildCustomerLedgerStatementRows, customerTotals, statementTotals } from '@/utils/customerLedger'
import { buildShipmentCycles, currentRawStockTon } from '@/utils/rawMaterial'
import { monthlyProfit } from '@/utils/profit'

/**
 * Reversing a raw material sale — the frontend mirror of the backend's
 * SaleReversalTest. The sale stays; a `sale_reversal` credit and a negative
 * stock movement on the reversal date cancel it there, never in the original
 * (closed) period.
 */

const products: Product[] = [{ id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '' }]
const meshSizes: MeshSize[] = [{ id: 'm1', name: '250', bagKg: 50, active: true, createdAt: '' }]
const customers: Customer[] = [{ id: 'c1', name: 'ABC Trading', openingBalance: 0, active: true, createdAt: '' }]
const bagKg50 = () => 50

// Cycle 1 (closed after the sale, 155 Ton closing), cycle 2 opened in March with 50 Ton.
const imports: RawMaterialImport[] = [
  { id: 'i1', shipmentId: 's1', date: '2026-01-01', productId: 'p1', grossWeightKg: 200_000, tareWeightKg: 25_000, createdAt: '' },
  { id: 'i2', shipmentId: 's2', date: '2026-03-01', productId: 'p1', grossWeightKg: 50_000, tareWeightKg: 0, createdAt: '' },
]
const cycles: ShipmentCycle[] = [
  {
    id: 's1', productId: 'p1', openedOn: '2026-01-01', status: 'closed',
    closing: { openingTon: 0, receivedTon: 175, consumedTon: 0, wastageTon: 0, rawSaleTon: 20, closingTon: 155, closedAt: '' },
  },
  { id: 's2', productId: 'p1', openedOn: '2026-03-01', status: 'open' },
]

/** 20 Ton @ 3,000 = 60,000, 25,000 paid at sale; reversed on 10 March when `reversed`. */
function scenario(reversed: boolean) {
  const sale: Sale = {
    id: 'r1', invoiceNo: 'INV-2026-001', date: '2026-02-01', customerId: 'c1', saleType: 'raw_material',
    grossWeightKg: 32_450, tareWeightKg: 12_450, paidAtSale: 25_000, createdAt: '2026-02-01T08:00:00.000Z',
    ...(reversed ? { reversedOn: '2026-03-10', reversalReason: 'Wrong customer' } : {}),
  }
  const item: SaleItem = { id: 'it1', saleId: 'r1', productId: 'p1', meshSizeId: null, bags: 0, ratePerTon: 3_000, actualWeightTon: 20 }
  const txns: CustomerTransaction[] = [
    ...buildSaleTransactions({ sale, totalAmount: 60_000, paymentReference: 'INV-2026-001-PD' }),
    ...(reversed
      ? [{
          id: 'rev1', customerId: 'c1', date: '2026-03-10', type: 'sale_reversal' as const, reference: 'INV-2026-001-REV',
          description: 'Reversal of INV-2026-001', debit: 0, credit: 60_000, referenceSaleId: 'r1', createdAt: '2026-03-10T09:00:00.000Z',
        }]
      : []),
  ]
  return { sale, item, txns }
}

describe('a reversed sale', () => {
  const { sale, item, txns } = scenario(true)
  const [summary] = buildSaleSummaries([sale], [item], products, meshSizes, customers, txns)

  it('is kept, marked reversed, owing nothing', () => {
    expect(summary!.id).toBe('r1')
    expect(summary!.date).toBe('2026-02-01')
    expect(summary!.status).toBe('reversed')
    expect(summary!.totalAmount).toBe(60_000)
    expect(summary!.amountDue).toBe(0)
    expect(summary!.amountPaid).toBe(25_000)
  })

  it('stays listed but is never counted', () => {
    expect(standingSales([summary!])).toEqual([])
  })
})

describe('customer ledger', () => {
  it('cancels the receivable and frees the money paid as advance', () => {
    expect(customerTotals(scenario(false).txns).balance).toBe(35_000)

    const totals = customerTotals(scenario(true).txns)
    expect(totals.balance).toBe(-25_000)
    expect(totals.availableAdvance).toBe(25_000)
    expect(totals.totalSales).toBe(0)
    expect(totals.totalSales - totals.totalPaid).toBe(totals.balance)
  })

  it('shows the reversal on the customer statement, which still balances', () => {
    const { sale, item, txns } = scenario(true)
    const summaries = buildSaleSummaries([sale], [item], products, meshSizes, customers, txns)
    const rows = buildCustomerLedgerStatementRows(summaries, txns, () => 'ABC Trading')

    expect(rows.map((r) => r.detail)).toContain('SALE REVERSAL')
    const { totalAmount, totalCredit } = statementTotals(rows)
    expect(totalAmount - totalCredit).toBe(customerTotals(txns).balance)
  })
})

describe('raw stock', () => {
  const { sale, item } = scenario(true)
  const movements = rawMaterialSaleMovements([sale], [item])

  it('returns the tons on the reversal date, not the sale date', () => {
    expect(movements).toEqual([
      { saleId: 'r1', productId: 'p1', date: '2026-02-01', ton: 20 },
      { saleId: 'r1', productId: 'p1', date: '2026-03-10', ton: -20 },
    ])
    expect(currentRawStockTon('p1', imports, [], [], bagKg50, undefined, movements)).toBeCloseTo(225, 9)
    expect(currentRawStockTon('p1', imports, [], [], bagKg50, '2026-02-28', movements)).toBeCloseTo(155, 9)
  })

  it('leaves the closed cycle frozen and lands the return in the open one', () => {
    const [closed, open] = buildShipmentCycles('p1', products, cycles, imports, [], [], bagKg50, movements)
    expect(closed!.rawSaleTon).toBe(20)
    expect(closed!.closingTon).toBe(155)
    expect(open!.rawSaleTon).toBeCloseTo(-20, 9)
    expect(open!.closingTon).toBeCloseTo(225, 9)
  })
})

describe('profit', () => {
  it('takes the reversal in the reversal month; the original month keeps its figures', () => {
    const { sale, item } = scenario(true)
    const data = {
      sales: [sale], saleItems: [item], products, meshSizes, rawMaterialImports: imports,
      transactions: [], categories: [], companyCostSelections: [],
    }
    expect(monthlyProfit(2026, 1, data).totalSales).toBe(60_000)
    expect(monthlyProfit(2026, 2, data).totalSales).toBe(-60_000)
  })
})
