import { describe, expect, it } from 'vitest'
import type { Customer, MeshSize, Product, Sale, SaleItem } from '@/types'
import { buildSaleSummaries, saleNetWeightKg } from '@/utils/sales'

/**
 * The weighbridge slip on a sale (gross/tare kg) — kept apart from the
 * billable ton every amount reads. The truck-wise report built from it is
 * covered in truckWeightReport.test.ts.
 */

const PRODUCTS: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '2026-01-01T00:00:00Z' },
]
const MESH: MeshSize[] = [{ id: 'm1', name: '250', bagKg: 50, active: true, createdAt: '2026-01-01T00:00:00Z' }]
const CUSTOMERS: Customer[] = [{ id: 'c1', name: 'ABC Trading', openingBalance: 0, active: true, createdAt: '2026-01-01T00:00:00Z' }]

function sale(id: string, truckNo: string | undefined, grossWeightKg?: number | null, tareWeightKg?: number | null): Sale {
  return { id, invoiceNo: `INV-${id}`, date: '2026-03-01', customerId: 'c1', truckNo, grossWeightKg, tareWeightKg, paidAtSale: 0, createdAt: `2026-03-01T00:00:0${id}Z` }
}

// 100 bags × 50kg = 5 ton billed @ 2,000 = 10,000 per sale.
const item = (saleId: string): SaleItem => ({ id: `i-${saleId}`, saleId, productId: 'p1', meshSizeId: 'm1', bags: 100, ratePerTon: 2_000 })

function summaries(sales: Sale[]) {
  return buildSaleSummaries(sales, sales.map((s) => item(s.id)), PRODUCTS, MESH, CUSTOMERS, [])
}

describe('saleNetWeightKg', () => {
  it('is gross − tare', () => {
    expect(saleNetWeightKg({ grossWeightKg: 18_250, tareWeightKg: 13_100 })).toBe(5_150)
  })

  it('is undefined for an old sale with no slip — null from the API or absent', () => {
    expect(saleNetWeightKg({ grossWeightKg: null, tareWeightKg: null })).toBeUndefined()
    expect(saleNetWeightKg({})).toBeUndefined()
  })

  it('is undefined when only one of the two weights was recorded', () => {
    expect(saleNetWeightKg({ grossWeightKg: 18_000, tareWeightKg: null })).toBeUndefined()
  })
})

describe('billable weight is untouched by the weighbridge slip', () => {
  it('bills on bags × bag weight even when the slip net differs', () => {
    const [summary] = summaries([sale('1', 'DMT-1', 18_250, 13_100)])
    expect(summary!.totalWeightTon).toBe(5)
    expect(summary!.totalAmount).toBe(10_000)
  })
})
