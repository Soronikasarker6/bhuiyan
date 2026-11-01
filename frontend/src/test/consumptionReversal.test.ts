import { describe, expect, it } from 'vitest'
import type { Product, ProductionEntry, RawMaterialImport, ShipmentCycle, WastageEntry } from '@/types'
import { buildShipmentCycles, currentRawStockTon, rawStockSummary } from '@/utils/rawMaterial'
import { availableBags, totalProductionBags } from '@/utils/productionStock'

/**
 * Reversing a production or wastage entry — the frontend mirror of the
 * backend's ConsumptionReversalTest. The entry stays; its effect is undone on
 * the reversal date, in the open cycle, never in the closed one.
 */

const products: Product[] = [{ id: 'p1', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '' }]
const bagKg50 = () => 50

// Cycle 1: 175 Ton in, 5 Ton produced, 2 Ton wasted, closed at 168. Cycle 2: 50 Ton in March.
const imports: RawMaterialImport[] = [
  { id: 'i1', shipmentId: 's1', date: '2026-01-01', productId: 'p1', grossWeightKg: 200_000, tareWeightKg: 25_000, createdAt: '' },
  { id: 'i2', shipmentId: 's2', date: '2026-03-01', productId: 'p1', grossWeightKg: 50_000, tareWeightKg: 0, createdAt: '' },
]
const cycles: ShipmentCycle[] = [
  {
    id: 's1', productId: 'p1', openedOn: '2026-01-01', status: 'closed',
    closing: { openingTon: 0, receivedTon: 175, consumedTon: 5, wastageTon: 2, closingTon: 168, closedAt: '' },
  },
  { id: 's2', productId: 'p1', openedOn: '2026-03-01', status: 'open' },
]

const production = (reversed: boolean): ProductionEntry[] => [
  {
    id: 'e1', date: '2026-01-10', productId: 'p1', meshId: 'm1', bags: 100, createdAt: '',
    ...(reversed ? { reversedOn: '2026-03-10', reversalReason: 'Wrong mesh' } : {}),
  },
]
const wastage = (reversed: boolean): WastageEntry[] => [
  {
    id: 'w1', date: '2026-01-12', productId: 'p1', quantityKg: 2_000, createdAt: '',
    ...(reversed ? { reversedOn: '2026-03-10', reversalReason: 'Double entry' } : {}),
  },
]

describe('production reversal', () => {
  it('returns its tons on the reversal date', () => {
    expect(currentRawStockTon('p1', imports, wastage(false), production(false), bagKg50)).toBeCloseTo(218, 9)
    expect(currentRawStockTon('p1', imports, wastage(false), production(true), bagKg50)).toBeCloseTo(223, 9)
    expect(currentRawStockTon('p1', imports, wastage(false), production(true), bagKg50, '2026-02-28')).toBeCloseTo(168, 9)
  })

  it('lands in the open cycle; the closed one keeps its figures', () => {
    const [closed, open] = buildShipmentCycles('p1', products, cycles, imports, wastage(false), production(true), bagKg50)
    expect(closed!.consumedTon).toBe(5)
    expect(closed!.closingTon).toBe(168)
    expect(open!.consumedTon).toBeCloseTo(-5, 9)
    expect(open!.closingTon).toBeCloseTo(223, 9)
  })

  it('takes its bags back out of bag stock', () => {
    expect(availableBags('p1', 'm1', production(false), [], [])).toBe(100)
    expect(availableBags('p1', 'm1', production(true), [], [])).toBe(0)
    expect(totalProductionBags(production(true))).toBe(0)
  })
})

describe('wastage reversal', () => {
  it('returns its tons in the open cycle and the reversal window', () => {
    expect(currentRawStockTon('p1', imports, wastage(true), production(false), bagKg50)).toBeCloseTo(220, 9)

    const [closed, open] = buildShipmentCycles('p1', products, cycles, imports, wastage(true), production(false), bagKg50)
    expect(closed!.wastageTon).toBe(2)
    expect(open!.wastageTon).toBeCloseTo(-2, 9)

    const march = rawStockSummary('p1', products, imports, wastage(true), production(false), bagKg50, '2026-03-01', '2026-03-31')
    expect(march.wastageTon).toBeCloseTo(-2, 9)
    expect(march.currentRawStockTon).toBeCloseTo(220, 9)
  })

  it('never touches bag stock', () => {
    expect(availableBags('p1', 'm1', production(false), [], [])).toBe(100)
  })
})
