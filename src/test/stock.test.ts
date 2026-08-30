import { describe, expect, it } from 'vitest'
import type { Product, ProductionEntry, SaleItem } from '@/types'
import { productStock, totalStock } from '@/utils/stock'

/**
 * Available stock — the one place Production and Sales meet, and only as a
 * read-only total: `Available = Produced (net tons) − Sold (tons)`.
 */

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', name: 'Gray Limestone', code: 'GRL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
]

const PRODUCTION: ProductionEntry[] = [
  { id: 'e1', date: '2026-08-01', productId: 'p1', grossWeightKg: 32_000, tareWeightKg: 9_000, createdAt: '2026-08-01T00:00:00Z' }, // 23t
  { id: 'e2', date: '2026-08-02', productId: 'p2', grossWeightKg: 25_000, tareWeightKg: 8_000, createdAt: '2026-08-02T00:00:00Z' }, // 17t
]

const SALE_ITEMS: SaleItem[] = [
  { id: 'i1', saleId: 's1', productId: 'p1', weightTon: 10, ratePerTon: 5_000 },
  { id: 'i2', saleId: 's1', productId: 'p2', weightTon: 5, ratePerTon: 4_500 },
]

describe('product stock', () => {
  it('is produced minus sold, per product', () => {
    const stock = productStock(PRODUCTS, PRODUCTION, SALE_ITEMS)

    expect(stock.find((s) => s.productId === 'p1')).toMatchObject({ producedTon: 23, soldTon: 10, availableTon: 13 })
    expect(stock.find((s) => s.productId === 'p2')).toMatchObject({ producedTon: 17, soldTon: 5, availableTon: 12 })
  })

  it('needs no closing snapshot to stay correct — it is always the live totals', () => {
    // Recomputing from scratch after "more" activity gives a different but
    // still-correct number; nothing here depends on when it was last asked.
    const moreSales: SaleItem[] = [...SALE_ITEMS, { id: 'i3', saleId: 's2', productId: 'p1', weightTon: 23, ratePerTon: 5_000 }]
    const stock = productStock(PRODUCTS, PRODUCTION, moreSales)

    expect(stock.find((s) => s.productId === 'p1')!.availableTon).toBe(-10)
  })

  it('totals across every product', () => {
    const stock = productStock(PRODUCTS, PRODUCTION, SALE_ITEMS)
    const totals = totalStock(stock)

    expect(totals.producedTon).toBe(40)
    expect(totals.soldTon).toBe(15)
    expect(totals.availableTon).toBe(25)
  })
})
