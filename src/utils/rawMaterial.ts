import type {
  ID,
  ISODate,
  Product,
  ProductionEntry,
  RawMaterialImport,
  RawMaterialStock,
  ShipmentCycleRow,
  ShipmentStatus,
  WastageEntry,
  WastageRow,
} from '@/types'
import { productNameOf } from './products'
import { chronological, kgToTons, netWeightKg } from './imports'

/**
 * Raw material costing — a separate, weight-based stock from the mesh/bag
 * stock in `utils/productionStock.ts`. That one answers "how many bags of
 * 250 do we have"; this one answers "what did the limestone actually cost",
 * which is what turns Sales revenue into a real Net Profit.
 *
 *     Available Raw Material (Ton) = Imported − Wastage − Produced into bags
 *
 * Sales never touches this directly — a sale draws down bagged mesh stock,
 * and bagging is what consumes raw material, so routing production through
 * both keeps them consistent without duplicating the deduction.
 *
 * §2/§4 shipment-wise closing lives here too, as one more view of the same
 * three inputs — never a second, competing calculation:
 *
 *     Opening Balance + This Shipment's Received − Consumed = Closing Balance
 *
 * Each raw material's shipments (`RawMaterialImport`s for that `productId`,
 * oldest first) are treated as a chain of inventory cycles. A cycle's
 * "consumed" is whatever wastage and production is dated within its window —
 * from its own receipt onward, up to the next shipment of the *same*
 * material — so nothing here duplicates the production/wastage logs; it only
 * buckets their existing entries by date. A closed shipment's four numbers
 * come from its frozen `closing` snapshot instead of being recomputed, which
 * is what keeps a later back-dated entry, or a new shipment, from silently
 * moving a balance that was already reported as final. Telescoped across a
 * whole chain this is exactly the all-time `Imported − Wastage − Produced`
 * total below — shipment-wise closing is a finer-grained *view* of the same
 * arithmetic, not a different number.
 */

/**
 * The weighted average cost of one ton of a product's raw material, across
 * every priced import — the number §6's cost-of-goods-sold calculation
 * multiplies tons sold by. Unpriced imports (no `pricePerTon` entered) are
 * excluded rather than treated as free.
 */
export function averageCostPerTon(productId: ID, imports: RawMaterialImport[]): number | undefined {
  const priced = imports.filter((i) => i.productId === productId && (Number(i.pricePerTon) || 0) > 0)
  if (priced.length === 0) return undefined

  let weightedCost = 0
  let totalTon = 0

  for (const entry of priced) {
    const ton = kgToTons(netWeightKg(entry.grossWeightKg, entry.tareWeightKg))
    weightedCost += ton * (Number(entry.pricePerTon) || 0)
    totalTon += ton
  }

  return totalTon > 0 ? weightedCost / totalTon : undefined
}

function importedTonOf(productId: ID, imports: RawMaterialImport[]): number {
  return imports
    .filter((i) => i.productId === productId)
    .reduce((sum, i) => sum + kgToTons(netWeightKg(i.grossWeightKg, i.tareWeightKg)), 0)
}

function wastageTonOf(productId: ID, wastage: WastageEntry[]): number {
  return wastage
    .filter((w) => w.productId === productId)
    .reduce((sum, w) => sum + kgToTons(Number(w.quantityKg) || 0), 0)
}

function producedTonOf(productId: ID, productionEntries: ProductionEntry[], bagKgOf: (meshId: ID) => number): number {
  return productionEntries
    .filter((e) => e.productId === productId)
    .reduce((sum, e) => sum + kgToTons((Number(e.bags) || 0) * bagKgOf(e.meshId)), 0)
}

export function rawMaterialStock(
  productId: ID,
  products: Product[],
  imports: RawMaterialImport[],
  wastage: WastageEntry[],
  productionEntries: ProductionEntry[],
  bagKgOf: (meshId: ID) => number,
): RawMaterialStock {
  const importedTon = importedTonOf(productId, imports)
  const wastageTon = wastageTonOf(productId, wastage)
  const producedTon = producedTonOf(productId, productionEntries, bagKgOf)

  const cycles = buildShipmentCycles(productId, products, imports, wastage, productionEntries, bagKgOf)
  const latest = cycles[cycles.length - 1]

  // No shipment has ever been recorded for this material — fall back to the
  // plain all-time formula (opening implicitly zero) so a product with only
  // wastage/production logged, and no import yet, still reports a number.
  const openingTon = latest ? latest.openingTon : 0
  const receivedTon = latest ? latest.receivedTon : 0
  const consumedTon = latest ? latest.consumedTon : wastageTon + producedTon
  const closingTon = latest ? latest.closingTon : openingTon + receivedTon - consumedTon

  return {
    productId,
    productName: productNameOf(products, productId),
    importedTon,
    wastageTon,
    producedTon,
    availableTon: closingTon,
    openingTon,
    receivedTon,
    consumedTon,
    closingTon,
    shipmentCount: cycles.length,
    openShipmentCount: cycles.filter((c) => c.status === 'open').length,
    averageCostPerTon: averageCostPerTon(productId, imports),
  }
}

export function allRawMaterialStock(
  products: Product[],
  imports: RawMaterialImport[],
  wastage: WastageEntry[],
  productionEntries: ProductionEntry[],
  bagKgOf: (meshId: ID) => number,
): RawMaterialStock[] {
  return products.map((p) => rawMaterialStock(p.id, products, imports, wastage, productionEntries, bagKgOf))
}

// ---------------------------------------------------------------- wastage

function chronologicalWastage(a: WastageEntry, b: WastageEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : 1
}

/** Every wastage entry, newest first, with its product name and tons resolved. */
export function buildWastageRows(entries: WastageEntry[], products: Product[]): WastageRow[] {
  return [...entries]
    .sort(chronologicalWastage)
    .reverse()
    .map((entry) => ({
      ...entry,
      productName: productNameOf(products, entry.productId),
      quantityTon: kgToTons(entry.quantityKg),
    }))
}

export function wastageTotals(entries: WastageEntry[]): { entryCount: number; quantityKg: number; quantityTon: number } {
  return entries.reduce(
    (totals, e) => ({
      entryCount: totals.entryCount + 1,
      quantityKg: totals.quantityKg + (Number(e.quantityKg) || 0),
      quantityTon: totals.quantityTon + kgToTons(Number(e.quantityKg) || 0),
    }),
    { entryCount: 0, quantityKg: 0, quantityTon: 0 },
  )
}

// ---------------------------------------------------------------- shipment-wise cycles (§2, §3, §4)

/** Whether `(date, createdAt)` falls at or after the boundary `(boundaryDate, boundaryCreatedAt)`. */
function atOrAfter(date: ISODate, createdAt: string, boundaryDate: ISODate, boundaryCreatedAt: string): boolean {
  if (date !== boundaryDate) return date > boundaryDate
  return createdAt >= boundaryCreatedAt
}

/** Whether `(date, createdAt)` falls strictly before the boundary. */
function strictlyBefore(date: ISODate, createdAt: string, boundaryDate: ISODate, boundaryCreatedAt: string): boolean {
  if (date !== boundaryDate) return date < boundaryDate
  return createdAt < boundaryCreatedAt
}

/**
 * Every shipment cycle for one raw material, oldest first (§2).
 *
 * Each shipment's opening balance is the previous shipment's closing balance
 * for this *same* `productId` — never another material's, never a lifetime
 * sum. A cycle's window runs from its own receipt up to (not including) the
 * next shipment of this material, so wastage/production dated in between is
 * exactly what "consumed" counts — the first cycle's window has no lower
 * bound, so it also picks up anything dated before any shipment existed. A
 * closed shipment's four figures come from its frozen snapshot instead —
 * recomputing them from the logs would defeat the entire point of closing.
 */
export function buildShipmentCycles(
  productId: ID,
  products: Product[],
  imports: RawMaterialImport[],
  wastage: WastageEntry[],
  productionEntries: ProductionEntry[],
  bagKgOf: (meshId: ID) => number,
): ShipmentCycleRow[] {
  const shipments = imports.filter((i) => i.productId === productId).sort(chronological)
  const productWastage = wastage.filter((w) => w.productId === productId)
  const productProduction = productionEntries.filter((e) => e.productId === productId)

  const productName = productNameOf(products, productId)
  const rows: ShipmentCycleRow[] = []
  let runningOpening = 0

  shipments.forEach((shipment, index) => {
    const meta = {
      id: shipment.id,
      productId,
      productName,
      date: shipment.date,
      shipName: shipment.shipName,
      serialNo: shipment.serialNo,
      truckNo: shipment.truckNo,
    }

    if (shipment.status === 'closed' && shipment.closing) {
      const { openingTon, receivedTon, consumedTon, closingTon, closedAt } = shipment.closing
      rows.push({
        ...meta,
        receivedTon,
        openingTon,
        availableTon: openingTon + receivedTon,
        consumedTon,
        closingTon,
        status: 'closed',
        closedAt,
      })
      runningOpening = closingTon
      return
    }

    const isFirst = index === 0
    const next = shipments[index + 1]

    const inWindow = (date: ISODate, createdAt: string) => {
      if (!isFirst && !atOrAfter(date, createdAt, shipment.date, shipment.createdAt)) return false
      if (next && !strictlyBefore(date, createdAt, next.date, next.createdAt)) return false
      return true
    }

    const consumedTon =
      productWastage
        .filter((w) => inWindow(w.date, w.createdAt))
        .reduce((sum, w) => sum + kgToTons(Number(w.quantityKg) || 0), 0) +
      productProduction
        .filter((e) => inWindow(e.date, e.createdAt))
        .reduce((sum, e) => sum + kgToTons((Number(e.bags) || 0) * bagKgOf(e.meshId)), 0)

    const receivedTon = kgToTons(netWeightKg(shipment.grossWeightKg, shipment.tareWeightKg))
    const openingTon = runningOpening
    const availableTon = openingTon + receivedTon
    const closingTon = availableTon - consumedTon

    rows.push({ ...meta, receivedTon, openingTon, availableTon, consumedTon, closingTon, status: 'open' })
    runningOpening = closingTon
  })

  return rows
}

/** Every material's shipment cycles, in one flat list — the shipment history table's rows. */
export function allShipmentCycles(
  products: Product[],
  imports: RawMaterialImport[],
  wastage: WastageEntry[],
  productionEntries: ProductionEntry[],
  bagKgOf: (meshId: ID) => number,
): ShipmentCycleRow[] {
  return products.flatMap((p) => buildShipmentCycles(p.id, products, imports, wastage, productionEntries, bagKgOf))
}

/**
 * Which cycle a candidate date would fall into for one material, by date
 * alone (a new entry's exact time-of-day is irrelevant to which day's cycle
 * it lands in). `undefined` means no shipment exists yet for this material,
 * or the date is before its first shipment — both unrestricted.
 *
 * This is what a production/wastage entry is checked against before saving
 * (§10): landing inside a *closed* cycle is refused, the same way `SaleForm`
 * refuses a sale that would exceed available stock.
 */
export function cycleStatusForDate(productId: ID, date: ISODate, imports: RawMaterialImport[]): ShipmentStatus | undefined {
  const shipments = imports.filter((i) => i.productId === productId).sort(chronological)
  if (shipments.length === 0 || date < shipments[0]!.date) return undefined

  let match = shipments[0]!
  for (const shipment of shipments) {
    if (shipment.date <= date) match = shipment
    else break
  }
  return match.status ?? 'open'
}
