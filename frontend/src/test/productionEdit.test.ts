import { describe, expect, it } from 'vitest'
import type { ProductionEntry, Sale, SaleItem } from '@/types'
import { availableBags, editBagShortfall } from '@/utils/productionStock'
import { currentRawStockTon } from '@/utils/rawMaterial'

/**
 * Editing a production entry — the edit may never un-produce bags that were
 * already sold, and the entry's own tonnage counts as available to itself.
 */

function prod(id: string, date: string, productId: string, meshId: string, bags: number): ProductionEntry {
  return { id, date, productId, meshId, bags, createdAt: `${date}T08:00:00.000Z` }
}

const sales: Sale[] = [{ id: 's1', invoiceNo: 'INV-1', date: '2026-08-25', customerId: 'c1', paidAtSale: 0, createdAt: '2026-08-25T09:00:00.000Z' }]
const items: SaleItem[] = [{ id: 'i1', saleId: 's1', productId: 'p1', meshSizeId: 'm250', bags: 200, ratePerTon: 1 }]

describe('editBagShortfall', () => {
  const entry = prod('e1', '2026-08-10', 'p1', 'm250', 300)
  const entries = [entry]

  it('allows raising or keeping the bags', () => {
    expect(editBagShortfall(entry, { ...entry, bags: 400 }, entries, items, sales)).toBe(0)
    expect(editBagShortfall(entry, { ...entry, bags: 200 }, entries, items, sales)).toBe(0)
  })

  it('rejects lowering below bags already sold', () => {
    expect(editBagShortfall(entry, { ...entry, bags: 150 }, entries, items, sales)).toBe(50)
  })

  it('rejects moving the bags to another mesh or product once sold', () => {
    expect(editBagShortfall(entry, { ...entry, meshId: 'm400' }, entries, items, sales)).toBe(200)
    expect(editBagShortfall(entry, { ...entry, productId: 'p2' }, entries, items, sales)).toBe(200)
  })

  it('rejects moving the date after the sale that used the bags', () => {
    expect(editBagShortfall(entry, { ...entry, date: '2026-08-28' }, entries, items, sales)).toBe(200)
  })

  it('applying an accepted edit leaves stock balanced', () => {
    const edited = entries.map((e) => (e.id === entry.id ? { ...e, bags: 250 } : e))
    expect(availableBags('p1', 'm250', edited, items, sales)).toBe(50)
  })
})

describe('raw stock available to an edited entry', () => {
  it('counts the entry’s own tonnage as available', () => {
    const imports = [{ id: 'r1', date: '2026-08-01', productId: 'p1', grossWeightKg: 10_000, tareWeightKg: 0, createdAt: '2026-08-01T08:00:00.000Z' }]
    const entry = prod('e1', '2026-08-10', 'p1', 'm250', 200) // 10 Ton at 50 kg/bag
    const bagKg = () => 50

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(currentRawStockTon('p1', imports as any, [], [entry], bagKg)).toBeCloseTo(0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(currentRawStockTon('p1', imports as any, [], [], bagKg)).toBeCloseTo(10)
  })
})
