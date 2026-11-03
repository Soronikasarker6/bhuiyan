import { describe, expect, it } from 'vitest'
import type { Customer, MeshSize, Product, Sale, SaleItem } from '@/types'
import { buildSaleSummaries, filterSaleSummaries, saleBilledNetKg, truckWeightRows, truckWeightTotals } from '@/utils/sales'
import { truckWeightReportPayload } from '@/features/reports/truckWeightReport'
import { printPayloadToCsv } from '@/features/reports/PrintSheet'

/**
 * The shared truck-weight report: one row builder and one payload for both
 * sale types, with the net weight taken from what was recorded at billing —
 * each line's stored Actual / Billable Ton — never from gross/tare and never
 * estimated. What the screen, the PDF and the CSV export all render.
 */

const products: Product[] = [
  { id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '' },
  { id: 'p2', name: 'Grey Limestone', code: 'GRL', unit: 'Ton', active: true, createdAt: '' },
]
const meshSizes: MeshSize[] = [
  { id: 'm1', name: '250', bagKg: 50, active: true, createdAt: '' },
  { id: 'm2', name: '400', bagKg: 50, active: true, createdAt: '' },
]
const customers: Customer[] = [{ id: 'c1', name: 'ABC Trading', openingBalance: 0, active: true, createdAt: '' }]

const sale = (id: string, extra: Partial<Sale> = {}): Sale => ({
  id, invoiceNo: `INV-${id}`, date: '2026-03-01', customerId: 'c1', truckNo: 'DMT-1', paidAtSale: 0, createdAt: id, ...extra,
})

const sales: Sale[] = [
  // Finished product, two lines on one truck, net edited at billing: 3.05 + 2.10 Ton = 5,150 kg.
  sale('f1'),
  // Raw material, 20,000.35 kg entered at billing.
  sale('r1', { saleType: 'raw_material', truckNo: 'DMT-2', date: '2026-03-02' }),
  // An old finished-product line billed straight from bag count — no stored weight.
  sale('f0', { date: '2026-02-01' }),
  // Mixed: one line has a stored weight, the other does not — the sale's net is unknown.
  sale('fm', { truckNo: 'DMT-3' }),
]
const items: SaleItem[] = [
  { id: 'i1', saleId: 'f1', productId: 'p1', meshSizeId: 'm1', bags: 60, ratePerTon: 2_000, actualWeightTon: 3.05 },
  { id: 'i2', saleId: 'f1', productId: 'p1', meshSizeId: 'm2', bags: 40, ratePerTon: 2_000, actualWeightTon: 2.1 },
  { id: 'i3', saleId: 'r1', productId: 'p2', meshSizeId: null, bags: 0, ratePerTon: 3_000, actualWeightTon: 20.00035 },
  { id: 'i4', saleId: 'f0', productId: 'p1', meshSizeId: 'm1', bags: 100, ratePerTon: 2_000 },
  { id: 'i5', saleId: 'fm', productId: 'p1', meshSizeId: 'm1', bags: 10, ratePerTon: 2_000, actualWeightTon: 0.5 },
  { id: 'i6', saleId: 'fm', productId: 'p2', meshSizeId: 'm1', bags: 10, ratePerTon: 2_000 },
]
const summaries = buildSaleSummaries(sales, items, products, meshSizes, customers, [])
const byId = (id: string) => summaries.find((s) => s.id === id)!
const rowsFor = (saleType?: 'finished_product' | 'raw_material') => truckWeightRows(filterSaleSummaries(summaries, { saleType }))
const payloadFor = (saleType?: 'finished_product' | 'raw_material') =>
  truckWeightReportPayload({ title: 'Truck-wise Sales', subtitle: 'March', rows: rowsFor(saleType), saleType })

describe('net weight from billing', () => {
  it('is the sum of the lines\' stored billable ton, in kg and ton, for both sale types', () => {
    const rows = new Map(rowsFor().map((r) => [r.saleId, r]))
    expect(rows.get('f1')).toMatchObject({ netKg: 5_150, netTon: 5.15 })
    expect(rows.get('r1')!.netKg).toBe(20_000.35)
    expect(rows.get('r1')!.netTon).toBeCloseTo(20.00035, 12)
  })

  it('matches exactly what the invoice billed', () => {
    expect(saleBilledNetKg(byId('f1'))! / 1000).toBeCloseTo(byId('f1').totalWeightTon, 12)
    expect(byId('f1').totalAmount).toBeCloseTo(5.15 * 2_000, 6)
    expect(saleBilledNetKg(byId('r1'))! / 1000).toBeCloseTo(byId('r1').totalWeightTon, 12)
  })

  it('is unknown — never estimated from bags — when a line has no stored weight', () => {
    expect(saleBilledNetKg(byId('f0'))).toBeUndefined()
    expect(saleBilledNetKg(byId('fm'))).toBeUndefined()
    // The invoice itself still bills on bags × bag weight, unchanged.
    expect(byId('f0').totalWeightTon).toBe(5)
    expect(byId('f0').totalAmount).toBe(10_000)
  })
})

describe('sale type filter', () => {
  it('All Sales shows both types', () => {
    expect(new Set(rowsFor().map((r) => r.saleType))).toEqual(new Set(['finished_product', 'raw_material']))
    expect(rowsFor()).toHaveLength(4)
  })

  it('Finished Product shows only finished product sales', () => {
    expect(rowsFor('finished_product').map((r) => r.saleId).sort()).toEqual(['f0', 'f1', 'fm'])
  })

  it('Raw Material shows only raw material sales', () => {
    expect(rowsFor('raw_material').map((r) => r.saleId)).toEqual(['r1'])
  })
})

describe('rows and totals', () => {
  it('gives one row per sale — two items on one truck are summed once, not duplicated', () => {
    expect(rowsFor().filter((r) => r.saleId === 'f1')).toHaveLength(1)
    expect(rowsFor().find((r) => r.saleId === 'fm')!.productLabel).toBe('Vietnam White Limestone, Grey Limestone')
    expect(truckWeightTotals(rowsFor('finished_product')).netKg).toBe(5_150)
  })

  it('totals the filtered rows that have a recorded weight', () => {
    const all = truckWeightTotals(rowsFor())
    expect(all).toMatchObject({ rowCount: 4, weighedCount: 2, netKg: 25_150.35 })
    expect(all.netTon).toBeCloseTo(25.15035, 12)
    expect(truckWeightTotals(rowsFor('raw_material'))).toMatchObject({ rowCount: 1, weighedCount: 1, netKg: 20_000.35 })
  })

  it('leaves totals blank, not zero, when nothing has a recorded weight', () => {
    const oldOnly = truckWeightRows([byId('f0')])
    expect(truckWeightTotals(oldOnly)).toEqual({ rowCount: 1, weighedCount: 0 })
    const payload = truckWeightReportPayload({ title: 'T', subtitle: 'S', rows: oldOnly })
    expect(payload.rows[0]).toMatchObject({ netKg: '—', netTon: '—' })
    expect(payload.totals).toMatchObject({ netKg: '—', netTon: '—' })
  })
})

describe('report payload and export', () => {
  it('shows Net KG and Net TON — no Gross, Tare or amount', () => {
    expect(payloadFor().columns.map((c) => c.label)).toEqual([
      'Date', 'Invoice / Sale No', 'Customer', 'Truck No', 'Sale Type', 'Product / Material', 'Net Weight (KG)', 'Net Weight (TON)',
    ])
  })

  it('shows "—" for sales without a recorded weight', () => {
    const old = payloadFor().rows.find((r) => r.invoice === 'INV-f0')!
    expect(old).toMatchObject({ netKg: '—', netTon: '—', type: 'Finished product' })
    expect(payloadFor().footnote).toMatch(/2 of 4/)
  })

  it('exports exactly what the filtered report shows', () => {
    const raw = payloadFor('raw_material')
    const csv = printPayloadToCsv(raw)
    expect(csv).toContain('"Sale type","Raw material sales"')
    expect(csv).toContain('"INV-r1"')
    expect(csv).not.toMatch(/"INV-f[01m]"/)
    expect(csv).toContain(`"${raw.totals!.netKg}"`)

    const finished = printPayloadToCsv(payloadFor('finished_product'))
    expect(finished).toContain('"INV-f1"')
    expect(finished).not.toContain('"INV-r1"')
  })
})
