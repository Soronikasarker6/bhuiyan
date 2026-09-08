import { describe, expect, it } from 'vitest'
import type { Product, ProductionEntry, RawMaterialImport, WastageEntry } from '@/types'
import {
  allRawMaterialStock,
  averageCostPerTon,
  buildShipmentCycles,
  buildWastageRows,
  cycleStatusForDate,
  rawMaterialStock,
  wastageTotals,
} from '@/utils/rawMaterial'

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

// ---------------------------------------------------------------- §2/§3/§4 shipment-wise closing

const TWO_MATERIALS: Product[] = [
  { id: 'vwl', name: 'Vietnam White Limestone', code: 'VWL', unit: 'Ton', active: true, createdAt: '' },
  { id: 'orl', name: 'Oman Red Limestone', code: 'ORL', unit: 'Ton', active: true, createdAt: '' },
]

function shipment(id: string, date: string, productId: string, netTon: number, extra: Partial<RawMaterialImport> = {}): RawMaterialImport {
  return { id, date, productId, grossWeightKg: netTon * 1000, tareWeightKg: 0, createdAt: `${date}T00:00:00.000Z`, ...extra }
}

function used(id: string, date: string, productId: string, bags: number): ProductionEntry {
  return { id, date, productId, meshId: 'mesh-1', bags, createdAt: `${date}T12:00:00.000Z` }
}

const bagKgOf = () => 50 // 1 bag = 50 kg = 0.05 ton

describe('shipment-wise inventory cycles (§2, §3, §4)', () => {
  it('Scenario A — a fresh shipment with no prior stock: Opening 0, Received 10,000, Consumed 2,500, Closing 7,500', () => {
    const imports = [shipment('s1', '2026-01-01', 'vwl', 10_000)]
    const production = [used('p1', '2026-01-05', 'vwl', 2_500 / 0.05)] // 2,500 ton of bags

    const [cycle] = buildShipmentCycles('vwl', TWO_MATERIALS, imports, [], production, bagKgOf)

    expect(cycle).toMatchObject({ openingTon: 0, receivedTon: 10_000, availableTon: 10_000, consumedTon: 2_500, closingTon: 7_500, status: 'open' })
  })

  it('Scenario B — the next shipment opens with the previous one\'s closing balance, never the lifetime sum', () => {
    const imports = [
      shipment('s1', '2026-01-01', 'vwl', 10_000),
      shipment('s2', '2026-02-01', 'vwl', 10_000),
    ]
    const production = [
      used('p1', '2026-01-05', 'vwl', 2_500 / 0.05), // consumed against shipment 1
      used('p2', '2026-02-10', 'vwl', 5_000 / 0.05), // consumed against shipment 2
    ]

    const cycles = buildShipmentCycles('vwl', TWO_MATERIALS, imports, [], production, bagKgOf)

    expect(cycles).toHaveLength(2)
    expect(cycles[0]).toMatchObject({ openingTon: 0, receivedTon: 10_000, consumedTon: 2_500, closingTon: 7_500 })
    // Opening is shipment 1's closing (7,500), NOT the 20,000-ton lifetime sum of both shipments.
    expect(cycles[1]).toMatchObject({ openingTon: 7_500, receivedTon: 10_000, availableTon: 17_500, consumedTon: 5_000, closingTon: 12_500 })
  })

  it('a third shipment chains from the second — Shipment 003 example', () => {
    const imports = [
      shipment('s1', '2026-01-01', 'vwl', 10_000),
      shipment('s2', '2026-02-01', 'vwl', 10_000),
      shipment('s3', '2026-03-01', 'vwl', 10_000),
    ]
    const production = [
      used('p1', '2026-01-05', 'vwl', 2_500 / 0.05),
      used('p2', '2026-02-10', 'vwl', 5_000 / 0.05),
    ]

    const cycles = buildShipmentCycles('vwl', TWO_MATERIALS, imports, [], production, bagKgOf)

    expect(cycles[2]).toMatchObject({ openingTon: 12_500, receivedTon: 10_000, availableTon: 22_500, consumedTon: 0, closingTon: 22_500 })
  })

  it('Scenario C — two materials never affect each other\'s balance', () => {
    const imports = [
      shipment('s1', '2026-01-01', 'vwl', 10_000),
      shipment('s2', '2026-01-01', 'orl', 8_000),
    ]
    const production = [
      used('p1', '2026-01-10', 'vwl', 3_000 / 0.05),
      used('p2', '2026-01-12', 'orl', 1_000 / 0.05),
    ]
    const wastage: WastageEntry[] = [{ id: 'w1', date: '2026-01-11', productId: 'vwl', quantityKg: 500_000, createdAt: '' }]

    const white = allRawMaterialStock(TWO_MATERIALS, imports, wastage, production, bagKgOf).find((s) => s.productId === 'vwl')!
    const red = allRawMaterialStock(TWO_MATERIALS, imports, wastage, production, bagKgOf).find((s) => s.productId === 'orl')!

    expect(white.availableTon).toBeCloseTo(10_000 - 500 - 3_000, 5) // wastage + production for VWL only
    expect(red.availableTon).toBeCloseTo(8_000 - 1_000, 5) // untouched by VWL's wastage or production
  })

  it('Scenario D — decimal quantities are preserved, never rounded to whole tons', () => {
    const imports = [shipment('s1', '2026-01-01', 'vwl', 10_000.2)]
    const production = [used('p1', '2026-01-05', 'vwl', 2_500.5 / 0.05)]

    const [cycle] = buildShipmentCycles('vwl', TWO_MATERIALS, imports, [], production, bagKgOf)

    expect(cycle!.receivedTon).toBeCloseTo(10_000.2, 5)
    expect(cycle!.consumedTon).toBeCloseTo(2_500.5, 5)
    expect(cycle!.closingTon).toBeCloseTo(10_000.2 - 2_500.5, 5)
  })

  it('a closed shipment freezes its four figures — a later back-dated entry cannot move them', () => {
    const closedImport: RawMaterialImport = {
      ...shipment('s1', '2026-01-01', 'vwl', 10_000),
      status: 'closed',
      closing: { openingTon: 0, receivedTon: 10_000, consumedTon: 2_500, closingTon: 7_500, closedAt: '2026-01-06T00:00:00.000Z' },
    }
    const imports = [closedImport, shipment('s2', '2026-02-01', 'vwl', 10_000)]

    // A wastage entry back-dated into shipment 1's window, added after closing.
    const wastage: WastageEntry[] = [{ id: 'w1', date: '2026-01-15', productId: 'vwl', quantityKg: 900_000, createdAt: '2026-03-01T00:00:00.000Z' }]

    const cycles = buildShipmentCycles('vwl', TWO_MATERIALS, imports, wastage, [], bagKgOf)

    // Shipment 1 stays exactly as it was closed…
    expect(cycles[0]).toMatchObject({ closingTon: 7_500, status: 'closed' })
    // …and shipment 2's opening still carries forward from that frozen 7,500, not a recomputed figure.
    expect(cycles[1]).toMatchObject({ openingTon: 7_500, closingTon: 17_500 - 0 })
  })

  it('cycleStatusForDate finds which cycle a date falls into, and reports it unrestricted before any shipment', () => {
    const imports = [
      shipment('s1', '2026-01-01', 'vwl', 10_000, { status: 'closed', closing: { openingTon: 0, receivedTon: 10_000, consumedTon: 2_500, closingTon: 7_500, closedAt: '' } }),
      shipment('s2', '2026-02-01', 'vwl', 10_000),
    ]

    expect(cycleStatusForDate('vwl', '2025-12-01', imports)).toBeUndefined() // before any shipment
    expect(cycleStatusForDate('vwl', '2026-01-15', imports)).toBe('closed') // inside shipment 1's cycle
    expect(cycleStatusForDate('vwl', '2026-02-15', imports)).toBe('open') // inside shipment 2's cycle
    expect(cycleStatusForDate('orl', '2026-02-15', imports)).toBeUndefined() // no shipments for this material at all
  })

  it('rawMaterialStock exposes the current cycle\'s opening/received/consumed/closing, matching the latest shipment', () => {
    const imports = [
      shipment('s1', '2026-01-01', 'vwl', 10_000),
      shipment('s2', '2026-02-01', 'vwl', 10_000),
    ]
    const production = [
      used('p1', '2026-01-05', 'vwl', 2_500 / 0.05),
      used('p2', '2026-02-10', 'vwl', 5_000 / 0.05),
    ]

    const stock = rawMaterialStock('vwl', TWO_MATERIALS, imports, [], production, bagKgOf)

    expect(stock).toMatchObject({
      openingTon: 7_500,
      receivedTon: 10_000,
      consumedTon: 5_000,
      closingTon: 12_500,
      availableTon: 12_500, // the headline figure equals the current cycle's closing balance
      shipmentCount: 2,
      openShipmentCount: 2,
    })
  })
})
