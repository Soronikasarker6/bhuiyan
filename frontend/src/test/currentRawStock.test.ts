import { describe, expect, it } from 'vitest'
import type { Product, ProductionEntry, RawMaterialImport, WastageEntry } from '@/types'
import { allRawStockSummaries, currentRawStockTon, rawStockSummary } from '@/utils/rawMaterial'

/**
 * Current Raw Stock — "right now, how many tons of this limestone do I
 * physically have?":
 *
 *     Total Imported − Production Consumption − Wastage
 *
 * These are the worked examples from the business brief, plus the two things
 * that would quietly corrupt the figure: wastage being subtracted twice, and
 * tonnage being rounded to whole tons. They mirror the backend's
 * `RawStockTest` case for case — the two must never disagree.
 */

const products: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '' },
  { id: 'p2', name: 'Oman Red Limestone', code: 'ORL', unit: 'Ton', active: true, createdAt: '' },
  { id: 'p3', name: 'Grey Limestone', code: 'GRL', unit: 'Ton', active: true, createdAt: '' },
]

/** Every mesh is 50 kg/bag unless a test says otherwise. */
const bagKg50 = () => 50

function imported(id: string, productId: string, tons: number, date = '2026-01-01'): RawMaterialImport {
  return { id, shipmentId: `${id}-shipment`, date, productId, grossWeightKg: tons * 1000, tareWeightKg: 0, createdAt: '' }
}

function produced(id: string, productId: string, bags: number, date = '2026-01-05'): ProductionEntry {
  return { id, date, productId, meshId: 'm1', bags, createdAt: '' }
}

function wasted(id: string, productId: string, tons: number, date = '2026-01-06'): WastageEntry {
  return { id, date, productId, quantityKg: tons * 1000, createdAt: '' }
}

describe('currentRawStockTon — §1', () => {
  it('is imported − production − wastage', () => {
    // The brief's own example: 500 − 320 − 5 = 175.
    const imports = [imported('i1', 'p1', 500)]
    const production = [produced('e1', 'p1', 6400)] // 6,400 × 50 kg = 320 Ton
    const wastage = [wasted('w1', 'p1', 5)]

    expect(currentRawStockTon('p1', imports, wastage, production, bagKg50)).toBeCloseTo(175, 6)
  })

  it('counts each ton once — wastage is never deducted twice', () => {
    const imports = [imported('i1', 'p1', 100)]
    const production = [produced('e1', 'p1', 400)] // 20 Ton bagged

    // Production alone: 100 − 20.
    expect(currentRawStockTon('p1', imports, [], production, bagKg50)).toBeCloseTo(80, 6)

    // Wastage is *additional* loss, not a slice of what production consumed,
    // so it comes off once: 100 − 20 − 3, never 100 − 20 − 3 − 3.
    const wastage = [wasted('w1', 'p1', 3)]
    expect(currentRawStockTon('p1', imports, wastage, production, bagKg50)).toBeCloseTo(77, 6)
  })

  it('keeps decimal tons rather than rounding to whole tons', () => {
    // 454 bags × 45 kg = 20,430 kg = 20.43 Ton.
    const imports = [imported('i1', 'p1', 100)]
    const production = [produced('e1', 'p1', 454)]

    expect(currentRawStockTon('p1', imports, [], production, () => 45)).toBeCloseTo(79.57, 6)
  })

  it('bounds every input to an as-of date', () => {
    const imports = [imported('i1', 'p1', 100, '2026-01-01'), imported('i2', 'p1', 50, '2026-02-01')]
    const production = [produced('e1', 'p1', 400, '2026-01-10')] // 20 Ton

    expect(currentRawStockTon('p1', imports, [], production, bagKg50, '2026-01-31')).toBeCloseTo(80, 6)
    expect(currentRawStockTon('p1', imports, [], production, bagKg50, '2026-02-28')).toBeCloseTo(130, 6)
  })
})

describe('rawStockSummary — §5/§6', () => {
  it('breaks the figure into the three movements it comes from', () => {
    const summary = rawStockSummary(
      'p1',
      products,
      [imported('i1', 'p1', 500)],
      [wasted('w1', 'p1', 5)],
      [produced('e1', 'p1', 6400)],
      bagKg50,
    )

    expect(summary.productName).toBe('Vietnam White Limestone')
    expect(summary.openingTon).toBe(0)
    expect(summary.importedTon).toBeCloseTo(500, 6)
    expect(summary.productionTon).toBeCloseTo(320, 6)
    expect(summary.wastageTon).toBeCloseTo(5, 6)
    expect(summary.currentRawStockTon).toBeCloseTo(175, 6)
  })

  it('carries in the opening stock when a period is selected', () => {
    const imports = [imported('i1', 'p1', 100, '2026-01-01'), imported('i2', 'p1', 50, '2026-02-01')]
    const production = [produced('e1', 'p1', 400, '2026-01-10'), produced('e2', 'p1', 200, '2026-02-10')]
    const wastage = [wasted('w1', 'p1', 1, '2026-02-15')]

    const february = rawStockSummary('p1', products, imports, wastage, production, bagKg50, '2026-02-01', '2026-02-28')

    // January left 100 − 20 = 80 on hand.
    expect(february.openingTon).toBeCloseTo(80, 6)
    expect(february.importedTon).toBeCloseTo(50, 6)
    expect(february.productionTon).toBeCloseTo(10, 6)
    expect(february.wastageTon).toBeCloseTo(1, 6)
    // 80 + 50 − 10 − 1, which is also the all-time figure since nothing follows.
    expect(february.currentRawStockTon).toBeCloseTo(119, 6)
    expect(currentRawStockTon('p1', imports, wastage, production, bagKg50)).toBeCloseTo(119, 6)
  })

  it('reports each limestone type separately, never one blended total', () => {
    const imports = [imported('i1', 'p1', 500), imported('i2', 'p2', 300), imported('i3', 'p3', 250)]
    const production = [produced('e1', 'p1', 6400), produced('e2', 'p2', 3000), produced('e3', 'p3', 2000)]
    const wastage = [wasted('w1', 'p1', 5), wasted('w2', 'p2', 2)]

    const rows = allRawStockSummaries(products, imports, wastage, production, bagKg50)

    expect(rows.map((r) => r.productName)).toEqual([
      'Vietnam White Limestone',
      'Oman Red Limestone',
      'Grey Limestone',
    ])
    expect(rows[0]!.currentRawStockTon).toBeCloseTo(175, 6)
    expect(rows[1]!.currentRawStockTon).toBeCloseTo(148, 6)
    expect(rows[2]!.currentRawStockTon).toBeCloseTo(150, 6)
    // Grey has no wastage at all — its own figure, not another material's.
    expect(rows[2]!.wastageTon).toBe(0)
  })

  it('only counts the material it was asked about', () => {
    const imports = [imported('i1', 'p1', 100), imported('i2', 'p2', 999)]
    const production = [produced('e1', 'p2', 400)]

    expect(currentRawStockTon('p1', imports, [], production, bagKg50)).toBeCloseTo(100, 6)
  })
})
