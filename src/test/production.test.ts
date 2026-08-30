import { describe, expect, it } from 'vitest'
import type { Product, ProductionEntry } from '@/types'
import {
  buildProductionRows,
  kgToTons,
  monthlyProductionSeries,
  netWeightKg,
  productionByProduct,
  productionTotals,
  tonsToKg,
} from '@/utils/production'

/**
 * Production arithmetic, tested against the numbers a person would work out
 * by hand — the same rule that protects the rest of the system's figures.
 */

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', name: 'Gray Limestone', code: 'GRL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
]

function entry(id: string, date: string, productId: string, grossWeightKg: number, tareWeightKg: number): ProductionEntry {
  return { id, date, productId, grossWeightKg, tareWeightKg, createdAt: `${date}T08:00:00.000Z` }
}

describe('net weight', () => {
  it('is gross minus tare — the spec\'s own worked example', () => {
    expect(netWeightKg(25_000, 8_000)).toBe(17_000)
  })

  it('never goes negative, even with a mistyped tare', () => {
    expect(netWeightKg(5_000, 9_000)).toBe(0)
  })

  it('treats a missing weight as zero rather than NaN', () => {
    expect(netWeightKg(undefined as unknown as number, 1_000)).toBe(0)
  })
})

describe('kg / ton conversion', () => {
  it('converts both ways', () => {
    expect(kgToTons(17_000)).toBe(17)
    expect(tonsToKg(17)).toBe(17_000)
  })
})

describe('production rows', () => {
  const entries = [
    entry('a', '2026-08-01', 'p1', 32_000, 9_000),
    entry('b', '2026-08-02', 'p2', 25_000, 8_000),
  ]

  it('resolves the product name and net weight for every entry', () => {
    const rows = buildProductionRows(entries, PRODUCTS)

    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.id === 'a')).toMatchObject({
      productName: 'Vietnam White Limestone',
      netWeightKg: 23_000,
      netWeightTon: 23,
    })
  })

  it('returns rows newest first', () => {
    const rows = buildProductionRows(entries, PRODUCTS)
    expect(rows[0]!.id).toBe('b')
    expect(rows[1]!.id).toBe('a')
  })
})

describe('production totals', () => {
  it('sums gross, tare and net across every entry', () => {
    const entries = [
      entry('a', '2026-08-01', 'p1', 32_000, 9_000), // net 23,000
      entry('b', '2026-08-02', 'p1', 25_000, 8_000), // net 17,000
    ]

    const totals = productionTotals(entries)

    expect(totals.entryCount).toBe(2)
    expect(totals.grossWeightKg).toBe(57_000)
    expect(totals.tareWeightKg).toBe(17_000)
    expect(totals.netWeightKg).toBe(40_000)
    expect(totals.netWeightTon).toBe(40)
  })

  it('is zero for an empty log', () => {
    expect(productionTotals([])).toMatchObject({ entryCount: 0, netWeightKg: 0, netWeightTon: 0 })
  })
})

describe('product-wise production', () => {
  it('keeps each product entirely separate and ranks the biggest first', () => {
    const entries = [
      entry('a', '2026-08-01', 'p1', 32_000, 9_000), // p1: 23t
      entry('b', '2026-08-02', 'p2', 25_000, 8_000), // p2: 17t
      entry('c', '2026-08-03', 'p1', 30_000, 9_200), // p1: +20.8t = 43.8t
    ]

    const byProduct = productionByProduct(entries, PRODUCTS)

    expect(byProduct[0]).toMatchObject({ productId: 'p1', netTon: 43.8, entryCount: 2 })
    expect(byProduct[1]).toMatchObject({ productId: 'p2', netTon: 17, entryCount: 1 })
  })

  it('lists a product with no entries at zero, not missing', () => {
    const byProduct = productionByProduct([], PRODUCTS)
    expect(byProduct).toHaveLength(2)
    expect(byProduct.every((p) => p.netTon === 0 && p.entryCount === 0)).toBe(true)
  })
})

describe('monthly production series', () => {
  it('buckets net tons by month and ignores other years', () => {
    const entries = [
      entry('a', '2026-01-05', 'p1', 32_000, 9_000), // 23t
      entry('b', '2026-01-20', 'p1', 25_000, 8_000), // 17t
      entry('c', '2026-02-01', 'p1', 20_000, 8_000), // 12t
      entry('d', '2025-01-01', 'p1', 20_000, 8_000), // different year, excluded
    ]

    const series = monthlyProductionSeries(entries, 2026)

    expect(series).toHaveLength(12)
    expect(series[0]!.netTon).toBe(40)
    expect(series[1]!.netTon).toBe(12)
    expect(series[2]!.netTon).toBe(0)
  })
})
