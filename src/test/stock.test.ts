import { describe, expect, it } from 'vitest'
import type { MeshSize, Product, ProductionEntry, Sale, SaleItem } from '@/types'
import {
  allMeshStock,
  availableBags,
  bagsToKg,
  buildStockLedger,
  meshStockSummary,
  totalStockBags,
  totalStockTon,
} from '@/utils/productionStock'

/**
 * Production & stock — tested against this system's own worked example
 * (§4-§7, §26), number for number:
 *
 *     Stock in Hand = Previous Stock + Today's Production − Today's Sell
 *
 * with "today's sell" always read from actual sales, never a typed field.
 */

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', name: 'Gray Limestone', code: 'GRL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
]

const MESH: MeshSize[] = [
  { id: 'm250', name: '250', bagKg: 50, active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'm400', name: '400', bagKg: 50, active: true, createdAt: '2026-01-01T00:00:00Z' },
]

function prod(id: string, date: string, productId: string, meshId: string, bags: number): ProductionEntry {
  return { id, date, productId, meshId, bags, createdAt: `${date}T08:00:00.000Z` }
}

function sale(id: string, date: string, customerId = 'c1'): Sale {
  return { id, invoiceNo: `INV-${id}`, date, customerId, paidAtSale: 0, createdAt: `${date}T09:00:00.000Z` }
}

function item(id: string, saleId: string, productId: string, meshSizeId: string, bags: number): SaleItem {
  return { id, saleId, productId, meshSizeId, bags, ratePerTon: 5_000 }
}

describe('bags to kg', () => {
  it('multiplies bags by the mesh’s own bag weight', () => {
    expect(bagsToKg(100, 50)).toBe(5_000)
    expect(bagsToKg(100, 25)).toBe(2_500)
  })
})

describe('the stock ledger (spec §26: 300 previous, 400 produced, 700 total, 200 sold, 500 in hand)', () => {
  const entries = [
    prod('a', '2026-08-20', 'p1', 'm250', 300),
    prod('b', '2026-08-30', 'p1', 'm250', 400),
  ]
  const sales = [sale('s1', '2026-08-30')]
  const items = [item('i1', 's1', 'p1', 'm250', 200)]

  it('matches the worked example exactly', () => {
    const { rows, currentStockBags } = buildStockLedger('p1', 'm250', entries, items, sales)

    // Newest first — the 30th's row is the one with the full worked example on it.
    const latest = rows[0]!
    expect(latest).toMatchObject({
      previousStockBags: 300,
      productionBags: 400,
      totalProductionBags: 700,
      sellBags: 200,
      stockBags: 500,
    })
    expect(currentStockBags).toBe(500)
  })

  it('carries the previous day’s stock forward without anyone typing it', () => {
    const { rows } = buildStockLedger('p1', 'm250', entries, items, sales)
    const first = rows[rows.length - 1]!
    expect(first).toMatchObject({ previousStockBags: 0, productionBags: 300, totalProductionBags: 300, stockBags: 300 })
  })

  it('is what availableBags reports too — the same function a sale is validated against', () => {
    expect(availableBags('p1', 'm250', entries, items, sales)).toBe(500)
  })
})

describe('§7: stock never goes negative and keeps every mesh separate', () => {
  it('a sale larger than stock would drive it negative — the form must block this, not silently allow it', () => {
    const entries = [prod('a', '2026-08-01', 'p1', 'm250', 100)]
    const items = [item('i1', 's1', 'p1', 'm250', 150)]
    const { currentStockBags } = buildStockLedger('p1', 'm250', entries, items, [sale('s1', '2026-08-02')])

    // The ledger itself just reports what happened; it's `availableBags`
    // checked *before* a sale is written (in SaleForm / SalesPage) that
    // actually prevents this arithmetic from ever being asked to occur.
    expect(currentStockBags).toBe(-50)
  })

  it('two meshes of the same product never share stock', () => {
    const entries = [prod('a', '2026-08-01', 'p1', 'm250', 100), prod('b', '2026-08-01', 'p1', 'm400', 80)]
    expect(availableBags('p1', 'm250', entries, [], [])).toBe(100)
    expect(availableBags('p1', 'm400', entries, [], [])).toBe(80)
  })
})

describe('mesh-wise stock summary (§9)', () => {
  it('reports every active mesh for a product, in kg and tons', () => {
    const entries = [prod('a', '2026-08-01', 'p1', 'm250', 500), prod('b', '2026-08-01', 'p1', 'm400', 200)]
    const rows = meshStockSummary('p1', MESH, entries, [], [])

    expect(rows.find((r) => r.meshId === 'm250')).toMatchObject({ stockBags: 500, stockKg: 25_000, stockTon: 25 })
    expect(rows.find((r) => r.meshId === 'm400')).toMatchObject({ stockBags: 200, stockKg: 10_000, stockTon: 10 })
  })

  it('lists a mesh with no production at zero, not missing', () => {
    const rows = meshStockSummary('p1', MESH, [], [], [])
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.stockBags === 0)).toBe(true)
  })
})

describe('all-product stock totals', () => {
  it('totals across every product × mesh combination', () => {
    const entries = [prod('a', '2026-08-01', 'p1', 'm250', 500), prod('b', '2026-08-01', 'p2', 'm400', 200)]
    const rows = allMeshStock(PRODUCTS, MESH, entries, [], [])

    expect(totalStockBags(rows)).toBe(700)
    expect(totalStockTon(rows)).toBe(25 + 10)
  })
})
