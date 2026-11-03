import { describe, expect, it } from 'vitest'
import type { Customer, MeshSize, Product, ProductionEntry, RawMaterialImport, Sale, SaleItem, ShipmentCycle } from '@/types'
import {
  buildSaleSummaries,
  buildSaleTransactions,
  filterSaleSummaries,
  isRawMaterialSale,
  rawMaterialSaleMovements,
  saleBilledNetKg,
  salesByMeshSize,
  saleTypeOf,
} from '@/utils/sales'
import { availableBags } from '@/utils/productionStock'
import { buildShipmentCycles, currentRawStockTon, rawMaterialStock, rawStockSummary } from '@/utils/rawMaterial'
import { buildCustomerLedgerRows, customerTotals } from '@/utils/customerLedger'

/**
 * Raw material sales — raw limestone sold straight from the yard by
 * weighbridge net. These mirror the backend's RawMaterialSaleTest: the raw
 * stock figure, its separation from production, and the two sale types
 * staying apart in every list.
 */

const products: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '' },
  { id: 'p2', name: 'Oman Red Limestone', code: 'ORL', unit: 'Ton', active: true, createdAt: '' },
]
const meshSizes: MeshSize[] = [{ id: 'm1', name: '250', bagKg: 50, active: true, createdAt: '' }]
const customers: Customer[] = [{ id: 'c1', name: 'ABC Trading', openingBalance: 0, active: true, createdAt: '' }]
const bagKg50 = () => 50

/** 175 Ton of white limestone in the yard — the brief's example. */
const imports: RawMaterialImport[] = [
  { id: 'i1', shipmentId: 's1', date: '2026-01-01', productId: 'p1', grossWeightKg: 200_000, tareWeightKg: 25_000, createdAt: '' },
]
const cycles: ShipmentCycle[] = [{ id: 's1', productId: 'p1', openedOn: '2026-01-01', status: 'open' }]

function rawSale(id: string, netWeightKg: number, rate = 3_000, productId = 'p1', date = '2026-02-01'): [Sale, SaleItem] {
  return [
    { id, invoiceNo: `INV-${id}`, date, customerId: 'c1', saleType: 'raw_material', truckNo: 'DMT-1', paidAtSale: 0, createdAt: '' },
    // What the server stores: no mesh, no bags, billable = net kg ÷ 1000.
    { id: `i-${id}`, saleId: id, productId, meshSizeId: null, bags: 0, ratePerTon: rate, actualWeightTon: netWeightKg / 1000 },
  ]
}

function finishedSale(id: string, bags: number): [Sale, SaleItem] {
  return [
    { id, invoiceNo: `INV-${id}`, date: '2026-02-01', customerId: 'c1', paidAtSale: 0, createdAt: '' },
    { id: `i-${id}`, saleId: id, productId: 'p1', meshSizeId: 'm1', bags, ratePerTon: 2_000 },
  ]
}

function split(pairs: Array<[Sale, SaleItem]>) {
  return { sales: pairs.map(([s]) => s), items: pairs.map(([, i]) => i) }
}

function movementsOf(pairs: Array<[Sale, SaleItem]>) {
  const { sales, items } = split(pairs)
  return rawMaterialSaleMovements(sales, items)
}

describe('sale type', () => {
  it('reads old rows with no type as finished-product sales', () => {
    expect(saleTypeOf({})).toBe('finished_product')
    expect(isRawMaterialSale({})).toBe(false)
    expect(isRawMaterialSale({ saleType: 'raw_material' })).toBe(true)
  })
})

describe('raw material sale amounts', () => {
  it('bills net weight × rate — 20 Ton @ 3,000 = 60,000', () => {
    const { sales, items } = split([rawSale('r1', 20_000)])
    const [summary] = buildSaleSummaries(sales, items, products, meshSizes, customers, [])

    expect(saleBilledNetKg(summary!)).toBe(20_000)
    expect(summary!.totalWeightTon).toBe(20)
    expect(summary!.totalAmount).toBe(60_000)
    expect(summary!.items[0]!.bags).toBe(0)
    expect(summary!.items[0]!.meshSizeName).toBe('Loose (raw)')
  })

  it('keeps decimal tons — 5,137.35 kg is 5.13735 Ton', () => {
    const { sales, items } = split([rawSale('r1', 5_137.35, 2_000)])
    const [summary] = buildSaleSummaries(sales, items, products, meshSizes, customers, [])

    expect(summary!.totalWeightTon).toBeCloseTo(5.13735, 9)
    expect(summary!.totalAmount).toBeCloseTo(10_274.7, 6)
  })

  it('posts to the same customer ledger as any sale', () => {
    const { sales, items } = split([rawSale('r1', 20_000)])
    const [summary] = buildSaleSummaries(sales, items, products, meshSizes, customers, [])
    const txns = buildSaleTransactions({ sale: sales[0]!, totalAmount: summary!.totalAmount, paymentReference: 'INV-r1-PD' })

    expect(buildCustomerLedgerRows(txns)).toHaveLength(1)
    expect(customerTotals(txns).balance).toBe(60_000)
  })
})

describe('raw stock', () => {
  const { sales, items } = split([rawSale('r1', 20_000)])
  const movements = rawMaterialSaleMovements(sales, items)

  it('turns each raw material sale into one movement, and finished sales into none', () => {
    const both = split([rawSale('r1', 20_000), finishedSale('f1', 100)])
    expect(rawMaterialSaleMovements(both.sales, both.items)).toEqual([{ saleId: 'r1', productId: 'p1', date: '2026-02-01', ton: 20 }])
  })

  it('deducts it: 175 − 20 = 155', () => {
    expect(currentRawStockTon('p1', imports, [], [], bagKg50)).toBeCloseTo(175, 9)
    expect(currentRawStockTon('p1', imports, [], [], bagKg50, undefined, movements)).toBeCloseTo(155, 9)
  })

  it('only from its own material', () => {
    const red = movementsOf([rawSale('r2', 10_000, 1, 'p2')])
    expect(currentRawStockTon('p1', imports, [], [], bagKg50, undefined, red)).toBeCloseTo(175, 9)
  })

  it('reports it as raw sold, never as production', () => {
    const summary = rawStockSummary('p1', products, imports, [], [], bagKg50, undefined, undefined, movements)
    expect(summary.productionTon).toBe(0)
    expect(summary.rawSaleTon).toBeCloseTo(20, 9)
    expect(summary.currentRawStockTon).toBeCloseTo(155, 9)

    const stock = rawMaterialStock('p1', products, cycles, imports, [], [], bagKg50, movements)
    expect(stock.producedTon).toBe(0)
    expect(stock.consumedTon).toBe(0)
    expect(stock.rawSaleTon).toBeCloseTo(20, 9)
    expect(stock.currentRawStockTon).toBeCloseTo(155, 9)
  })

  it('closes the shipment cycle with it', () => {
    const [cycle] = buildShipmentCycles('p1', products, cycles, imports, [], [], bagKg50, movements)
    expect(cycle!.consumedTon).toBe(0)
    expect(cycle!.rawSaleTon).toBeCloseTo(20, 9)
    expect(cycle!.closingTon).toBeCloseTo(155, 9)
  })

  it('reads a cycle frozen before raw sales existed as 0 raw sold', () => {
    const frozen: ShipmentCycle[] = [
      { ...cycles[0]!, status: 'closed', closing: { openingTon: 0, receivedTon: 175, consumedTon: 0, wastageTon: 0, closingTon: 175, closedAt: '' } },
    ]
    expect(buildShipmentCycles('p1', products, frozen, imports, [], [], bagKg50)[0]!.rawSaleTon).toBe(0)
  })

  it('is restored when the sale goes away (delete) and moves with an edit', () => {
    expect(currentRawStockTon('p1', imports, [], [], bagKg50, undefined, [])).toBeCloseTo(175, 9)
    const edited = movementsOf([rawSale('r1', 30_000)])
    expect(currentRawStockTon('p1', imports, [], [], bagKg50, undefined, edited)).toBeCloseTo(145, 9)
  })

  it('leaves every existing caller unchanged when no raw sales are passed', () => {
    const production: ProductionEntry[] = [{ id: 'e1', date: '2026-01-05', productId: 'p1', meshId: 'm1', bags: 400, createdAt: '' }]
    expect(currentRawStockTon('p1', imports, [], production, bagKg50)).toBeCloseTo(155, 9)
  })
})

describe('finished product sales are unaffected', () => {
  const production: ProductionEntry[] = [{ id: 'e1', date: '2026-01-05', productId: 'p1', meshId: 'm1', bags: 300, createdAt: '' }]

  it('raw sales never touch bag stock', () => {
    const { sales, items } = split([rawSale('r1', 20_000)])
    expect(availableBags('p1', 'm1', production, items, sales)).toBe(300)
  })

  it('finished sales still come off bags only', () => {
    const { sales, items } = split([finishedSale('f1', 100)])
    expect(availableBags('p1', 'm1', production, items, sales)).toBe(200)
    expect(rawMaterialSaleMovements(sales, items)).toEqual([])
  })
})

describe('reports tell the two types apart', () => {
  const { sales, items } = split([rawSale('r1', 20_000), finishedSale('f1', 100)])
  const summaries = buildSaleSummaries(sales, items, products, meshSizes, customers, [])

  it('filters by sale type', () => {
    expect(filterSaleSummaries(summaries, { saleType: 'raw_material' }).map((s) => s.id)).toEqual(['r1'])
    expect(filterSaleSummaries(summaries, { saleType: 'finished_product' }).map((s) => s.id)).toEqual(['f1'])
    expect(filterSaleSummaries(summaries, {})).toHaveLength(2)
  })

  it('keeps raw lines out of mesh-wise sales', () => {
    expect(salesByMeshSize(summaries).map((r) => r.meshSizeName)).toEqual(['250'])
  })
})
