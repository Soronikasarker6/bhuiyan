import { describe, expect, it } from 'vitest'
import type { Customer, MeshSize, Product, Sale, SaleItem } from '@/types'
import { buildSaleSummaries, filterSaleSummaries, truckWeightRows, truckWeightTotals } from '@/utils/sales'
import { netWeightKgOf, weighbridgeWeights } from '@/utils/weighbridge'
import { truckWeightReportPayload } from '@/features/reports/truckWeightReport'
import { printPayloadToCsv } from '@/features/reports/PrintSheet'

/**
 * The shared truck-weight report: one weighbridge calculation, one row
 * builder and one payload for both sale types — what the screen, the PDF and
 * the CSV export all render.
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

const sales: Sale[] = [
  // Finished product, two items on one truck, weighed: 18,250 − 13,100 = 5,150 kg.
  { id: 'f1', invoiceNo: 'INV-001', date: '2026-03-01', customerId: 'c1', truckNo: 'DMT-1', grossWeightKg: 18_250, tareWeightKg: 13_100, paidAtSale: 0, createdAt: '1' },
  // Raw material, weighed: 32,450.55 − 12,450.20 = 20,000.35 kg.
  { id: 'r1', invoiceNo: 'INV-002', date: '2026-03-02', customerId: 'c1', saleType: 'raw_material', truckNo: 'DMT-2', grossWeightKg: 32_450.55, tareWeightKg: 12_450.2, paidAtSale: 0, createdAt: '2' },
  // An old finished-product sale with no slip.
  { id: 'f0', invoiceNo: 'INV-000', date: '2026-02-01', customerId: 'c1', truckNo: 'DMT-1', grossWeightKg: null, tareWeightKg: null, paidAtSale: 0, createdAt: '0' },
]
const items: SaleItem[] = [
  { id: 'i1', saleId: 'f1', productId: 'p1', meshSizeId: 'm1', bags: 60, ratePerTon: 2_000 },
  { id: 'i2', saleId: 'f1', productId: 'p1', meshSizeId: 'm2', bags: 40, ratePerTon: 2_000 },
  { id: 'i3', saleId: 'r1', productId: 'p2', meshSizeId: null, bags: 0, ratePerTon: 3_000, actualWeightTon: 20.00035 },
  { id: 'i4', saleId: 'f0', productId: 'p1', meshSizeId: 'm1', bags: 100, ratePerTon: 2_000 },
]
const summaries = buildSaleSummaries(sales, items, products, meshSizes, customers, [])
const rowsFor = (saleType?: 'finished_product' | 'raw_material') => truckWeightRows(filterSaleSummaries(summaries, { saleType }))
const payloadFor = (saleType?: 'finished_product' | 'raw_material') =>
  truckWeightReportPayload({ title: 'Truck-wise Sales', subtitle: 'March', rows: rowsFor(saleType), saleType })

describe('the shared weighbridge calculation', () => {
  it('is gross − tare in kg, ÷ 1000 in tons, for both sale types', () => {
    const byId = new Map(rowsFor().map((r) => [r.saleId, r.weights]))
    expect(byId.get('f1')).toEqual({ grossKg: 18_250, tareKg: 13_100, netKg: 5_150, netTon: 5.15 })
    expect(byId.get('r1')!.netKg).toBe(20_000.35)
    expect(byId.get('r1')!.netTon).toBeCloseTo(20.00035, 12)
  })

  it('never turns a missing weight into zero', () => {
    expect(weighbridgeWeights({ grossWeightKg: null, tareWeightKg: null })).toEqual({})
    expect(weighbridgeWeights({ grossWeightKg: 18_000, tareWeightKg: '' })).toEqual({ grossKg: 18_000 })
    expect(netWeightKgOf(18_000, undefined)).toBeUndefined()
    expect(netWeightKgOf(0, 0)).toBe(0)
  })
})

describe('sale type filter', () => {
  it('All Sales shows both finished product and raw material sales', () => {
    expect(rowsFor().map((r) => r.saleType).sort()).toEqual(['finished_product', 'finished_product', 'raw_material'])
  })

  it('Finished Product shows only finished product sales', () => {
    expect(rowsFor('finished_product').map((r) => r.saleId).sort()).toEqual(['f0', 'f1'])
  })

  it('Raw Material shows only raw material sales', () => {
    expect(rowsFor('raw_material').map((r) => r.saleId)).toEqual(['r1'])
  })
})

describe('rows and totals', () => {
  it('gives one row per sale — two items on one truck never double its weight', () => {
    const rows = rowsFor('finished_product')
    expect(rows.filter((r) => r.saleId === 'f1')).toHaveLength(1)
    expect(rows.find((r) => r.saleId === 'f1')!.productLabel).toBe('Vietnam White Limestone')
    expect(truckWeightTotals(rows).netKg).toBe(5_150)
  })

  it('totals the filtered rows, over complete slips only', () => {
    const all = truckWeightTotals(rowsFor())
    expect(all).toMatchObject({ rowCount: 3, weighedCount: 2, grossKg: 50_700.55, tareKg: 25_550.2, netKg: 25_150.35 })
    expect(all.netTon).toBeCloseTo(25.15035, 12)

    expect(truckWeightTotals(rowsFor('raw_material')).netKg).toBe(20_000.35)
  })

  it('leaves totals blank, not zero, when nothing was weighed', () => {
    const oldOnly = truckWeightRows(summaries.filter((s) => s.id === 'f0'))
    expect(truckWeightTotals(oldOnly)).toEqual({ rowCount: 1, weighedCount: 0 })

    const payload = truckWeightReportPayload({ title: 'T', subtitle: 'S', rows: oldOnly })
    expect(payload.rows[0]).toMatchObject({ gross: '—', tare: '—', netKg: '—', netTon: '—' })
    expect(payload.totals).toMatchObject({ gross: '—', tare: '—', netKg: '—', netTon: '—' })
  })

  it('keeps the billable ton separate and unchanged', () => {
    const byId = new Map(rowsFor().map((r) => [r.saleId, r]))
    expect(byId.get('f1')!.billableTon).toBe(5) // 100 bags × 50 kg — not the 5.15 Ton slip
    expect(byId.get('f0')!.billableTon).toBe(5)
    expect(summaries.find((s) => s.id === 'f1')!.totalAmount).toBe(10_000)
    expect(summaries.find((s) => s.id === 'r1')!.totalAmount).toBeCloseTo(60_001.05, 6)
  })
})

describe('report payload and export', () => {
  it('has the requested columns and no amount', () => {
    expect(payloadFor().columns.map((c) => c.label)).toEqual([
      'Date', 'Invoice / Sale No', 'Customer', 'Truck No', 'Sale Type', 'Product / Material',
      'Gross Weight (KG)', 'Tare Weight (KG)', 'Net Weight (KG)', 'Net Weight (TON)',
    ])
    expect(payloadFor().columns.some((c) => /amount|rate/i.test(c.label))).toBe(false)
  })

  it('shows "—" for an old sale with no slip', () => {
    const old = payloadFor().rows.find((r) => r.invoice === 'INV-000')!
    expect(old).toMatchObject({ gross: '—', tare: '—', netKg: '—', netTon: '—', type: 'Finished product' })
  })

  it('exports exactly what the filtered report shows', () => {
    const raw = payloadFor('raw_material')
    const csv = printPayloadToCsv(raw)

    expect(csv).toContain('"Sale type","Raw material sales"')
    expect(csv).toContain('"INV-002"')
    expect(csv).not.toContain('"INV-001"')
    expect(csv).not.toContain('"INV-000"')
    // Body rows + totals line in the export match the payload one for one.
    const bodyLines = csv.split('\n').filter((l) => l.startsWith('"'))
    expect(bodyLines.filter((l) => l.includes('INV-'))).toHaveLength(raw.rows.length)
    expect(csv).toContain(`"${raw.totals!.netKg}"`)

    const finished = printPayloadToCsv(payloadFor('finished_product'))
    expect(finished).toContain('"INV-001"')
    expect(finished).not.toContain('"INV-002"')
  })
})
