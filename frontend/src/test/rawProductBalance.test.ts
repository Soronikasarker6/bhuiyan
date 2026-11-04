import { describe, expect, it } from 'vitest'
import type { MeshSize, Product, ProductionEntry, RawMaterialImport, Sale, SaleItem, WastageEntry } from '@/types'
import { currentRawStockTon, rawMaterialStock, rawProductBalanceTon, rawStockSummary } from '@/utils/rawMaterial'
import { finishedSaleMovements, rawMaterialSaleMovements } from '@/utils/sales'

/**
 * Raw Product Balance = Imported − Finished sold (billable TON) − Direct raw sold (net TON) − Wastage.
 * Production is not subtracted. Mirrors the backend's RawProductBalanceTest.
 */

const products: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '' },
  { id: 'p2', name: 'Oman Red Limestone', code: 'ORL', unit: 'Ton', active: true, createdAt: '' },
]
const meshSizes: MeshSize[] = [{ id: 'm1', name: '250', bagKg: 50, active: true, createdAt: '' }]
const bagKg = () => 50

const imports: RawMaterialImport[] = [
  { id: 'i1', shipmentId: 's1', date: '2026-01-01', productId: 'p1', grossWeightKg: 1_000_000, tareWeightKg: 0, createdAt: '' },
  { id: 'i2', shipmentId: 's2', date: '2026-01-01', productId: 'p2', grossWeightKg: 50_000, tareWeightKg: 0, createdAt: '' },
]
/** 100 Ton bagged. */
const production: ProductionEntry[] = [
  { id: 'e1', date: '2026-01-10', productId: 'p1', meshId: 'm1', bags: 2_000, createdAt: '' },
]
const wastage: WastageEntry[] = [{ id: 'w1', date: '2026-02-06', productId: 'p1', quantityKg: 150, createdAt: '' } as WastageEntry]

function finishedSale(id: string, bags: number, actualWeightTon?: number, date = '2026-02-01'): [Sale, SaleItem] {
  return [
    { id, invoiceNo: `INV-${id}`, date, customerId: 'c1', paidAtSale: 0, createdAt: '' },
    { id: `i-${id}`, saleId: id, productId: 'p1', meshSizeId: 'm1', bags, ratePerTon: 2_000, actualWeightTon },
  ]
}

function rawSale(id: string, netKg: number, date = '2026-02-05'): [Sale, SaleItem] {
  return [
    { id, invoiceNo: `INV-${id}`, date, customerId: 'c1', saleType: 'raw_material', paidAtSale: 0, createdAt: '' },
    { id: `i-${id}`, saleId: id, productId: 'p1', meshSizeId: null, bags: 0, ratePerTon: 3_000, actualWeightTon: netKg / 1000 },
  ]
}

function movements(pairs: Array<[Sale, SaleItem]>) {
  const sales = pairs.map(([s]) => s)
  const items = pairs.map(([, i]) => i)
  return { raw: rawMaterialSaleMovements(sales, items), finished: finishedSaleMovements(sales, items, meshSizes) }
}

function balance(pairs: Array<[Sale, SaleItem]>, w: WastageEntry[] = []) {
  const { raw, finished } = movements(pairs)
  return rawProductBalanceTon('p1', imports, w, undefined, raw, finished)
}

describe('raw product balance', () => {
  it('is not reduced by production; loose yard stock is', () => {
    expect(balance([])).toBe(1_000)
    expect(currentRawStockTon('p1', imports, [], production, bagKg)).toBe(900)
  })

  it('deducts a finished sale by its calculated billable TON', () => {
    expect(balance([finishedSale('f1', 500)])).toBe(975)
  })

  it('deducts the edited actual TON, not the bag calculation', () => {
    const { finished } = movements([finishedSale('f1', 200, 10.35)])
    expect(finished).toEqual([{ saleId: 'f1', productId: 'p1', date: '2026-02-01', ton: 10.35 }])
    expect(balance([finishedSale('f1', 200, 10.35)])).toBeCloseTo(989.65, 9)
  })

  it('deducts a direct raw sale by net TON and wastage separately, each once', () => {
    const pairs = [finishedSale('f1', 500), rawSale('r1', 20_000.5)]
    expect(balance(pairs, wastage)).toBeCloseTo(954.8495, 9)

    // A raw sale is never also counted as a finished sale, nor the reverse.
    const { raw, finished } = movements(pairs)
    expect(raw.map((m) => m.saleId)).toEqual(['r1'])
    expect(finished.map((m) => m.saleId)).toEqual(['f1'])
  })

  it('keeps materials separate', () => {
    const { raw, finished } = movements([finishedSale('f1', 500)])
    expect(rawProductBalanceTon('p2', imports, [], undefined, raw, finished)).toBe(50)
  })

  it('stock card figures: balance and loose stock side by side', () => {
    const { raw, finished } = movements([finishedSale('f1', 500), rawSale('r1', 20_000)])
    const stock = rawMaterialStock('p1', products, [], imports, wastage, production, bagKg, raw, finished)

    expect(stock.finishedSaleTon).toBe(25)
    expect(stock.rawProductBalanceTon).toBeCloseTo(954.85, 9)
    expect(stock.currentRawStockTon).toBeCloseTo(879.85, 9)
    expect(stock.producedTon).toBe(100)
  })

  it('a date window carries the opening balance in', () => {
    const { raw, finished } = movements([
      finishedSale('f1', 200, undefined, '2026-01-20'),
      finishedSale('f2', 100, undefined, '2026-02-10'),
      rawSale('r1', 20_000, '2026-02-12'),
    ])
    const row = rawStockSummary('p1', products, imports, [], production, bagKg, '2026-02-01', '2026-02-28', raw, finished)

    expect(row).toMatchObject({
      openingBalanceTon: 990,
      finishedSaleTon: 5,
      rawSaleTon: 20,
      rawProductBalanceTon: 965,
      openingTon: 900,
      currentRawStockTon: 880,
    })
  })
})
