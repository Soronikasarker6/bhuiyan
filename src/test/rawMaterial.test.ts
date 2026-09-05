import { describe, expect, it } from 'vitest'
import type { Product, ProductionEntry, RawMaterialImport, WastageEntry } from '@/types'
import { allRawMaterialStock, averageCostPerTon, buildWastageRows, rawMaterialStock, wastageTotals } from '@/utils/rawMaterial'

const products: Product[] = [
  { id: 'p1', name: 'White Limestone', code: 'WL', unit: 'Ton', active: true, createdAt: '' },
]

describe('averageCostPerTon', () => {
  it('weights by net tons, ignoring unpriced imports', () => {
    const imports: RawMaterialImport[] = [
      // 10 ton net @ ৳10/ton
      { id: 'i1', date: '2026-01-01', productId: 'p1', grossWeightKg: 10_000, tareWeightKg: 0, pricePerTon: 10, createdAt: '' },
      // 5 ton net @ ৳20/ton
      { id: 'i2', date: '2026-01-02', productId: 'p1', grossWeightKg: 5_000, tareWeightKg: 0, pricePerTon: 20, createdAt: '' },
      // no price — excluded entirely, not treated as free
      { id: 'i3', date: '2026-01-03', productId: 'p1', grossWeightKg: 3_000, tareWeightKg: 0, createdAt: '' },
    ]

    // (10*10 + 5*20) / (10+5) = 200/15 = 13.33...
    expect(averageCostPerTon('p1', imports)).toBeCloseTo(200 / 15, 5)
  })

  it('is undefined when nothing has been priced', () => {
    const imports: RawMaterialImport[] = [
      { id: 'i1', date: '2026-01-01', productId: 'p1', grossWeightKg: 10_000, tareWeightKg: 0, createdAt: '' },
    ]
    expect(averageCostPerTon('p1', imports)).toBeUndefined()
  })
})

describe('rawMaterialStock — §1: Imported → Available → Wastage → Sold → Remaining', () => {
  it('available = imported − wastage − produced into bags', () => {
    const imports: RawMaterialImport[] = [
      { id: 'i1', date: '2026-01-01', productId: 'p1', grossWeightKg: 10_000, tareWeightKg: 0, pricePerTon: 10, createdAt: '' },
    ]
    const wastage: WastageEntry[] = [{ id: 'w1', date: '2026-01-02', productId: 'p1', quantityKg: 500, createdAt: '' }]
    const productionEntries: ProductionEntry[] = [
      { id: 'pe1', date: '2026-01-03', productId: 'p1', meshId: 'mesh-250', bags: 100, createdAt: '' },
    ]
    const bagKgOf = () => 50 // 100 bags * 50kg = 5,000 kg = 5 ton

    const stock = rawMaterialStock('p1', products, imports, wastage, productionEntries, bagKgOf)

    expect(stock.importedTon).toBeCloseTo(10, 5)
    expect(stock.wastageTon).toBeCloseTo(0.5, 5)
    expect(stock.producedTon).toBeCloseTo(5, 5)
    expect(stock.availableTon).toBeCloseTo(10 - 0.5 - 5, 5)
    expect(stock.averageCostPerTon).toBe(10)
  })

  it('allRawMaterialStock returns one row per product', () => {
    const rows = allRawMaterialStock(products, [], [], [], () => 50)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.productId).toBe('p1')
    expect(rows[0]!.availableTon).toBe(0)
  })
})

describe('wastage rows and totals', () => {
  it('resolves product name and tons, newest first', () => {
    const entries: WastageEntry[] = [
      { id: 'w1', date: '2026-01-01', productId: 'p1', quantityKg: 200, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'w2', date: '2026-01-05', productId: 'p1', quantityKg: 300, createdAt: '2026-01-05T00:00:00Z' },
    ]

    const rows = buildWastageRows(entries, products)
    expect(rows[0]!.id).toBe('w2')
    expect(rows[0]!.productName).toBe('White Limestone')
    expect(rows[1]!.quantityTon).toBeCloseTo(0.2, 5)

    const totals = wastageTotals(entries)
    expect(totals.entryCount).toBe(2)
    expect(totals.quantityKg).toBe(500)
    expect(totals.quantityTon).toBeCloseTo(0.5, 5)
  })
})
