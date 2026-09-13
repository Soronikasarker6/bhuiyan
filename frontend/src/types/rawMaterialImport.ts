import type { ID, ISODate } from './common'

/**
 * A shipment's inventory cycle status (§3).
 *
 * "Open" means its closing balance is still live-computed from whatever
 * consumption is dated within its cycle window. "Closed" means that balance
 * has been frozen in `RawMaterialImport.closing` — later entries, anywhere in
 * the system, can never move a closed shipment's numbers again.
 */
export type ShipmentStatus = 'open' | 'closed'

/**
 * The frozen snapshot taken the moment a shipment is closed.
 *
 * Stored rather than left to be recomputed on demand — a closed shipment's
 * whole reason to exist is that a later back-dated wastage or production
 * entry, or a future shipment inserted out of order, must never quietly
 * change what was already reported as this cycle's closing balance.
 */
export interface ShipmentClosing {
  openingTon: number
  receivedTon: number
  consumedTon: number
  closingTon: number
  closedAt: string
}

/**
 * Limestone received from a ship, weighed at the yard — gross in, tare out,
 * net worked out. This is upstream of Production: it says how much raw
 * material arrived, not how much finished, bagged stock exists.
 *
 * Each import is also one shipment-wise inventory cycle (§2/§3) for its
 * `productId` — its opening balance is the previous shipment's closing
 * balance for that *same* raw material, never another material's, and never
 * the historical sum of every shipment ever received.
 */
export interface RawMaterialImport {
  id: ID
  date: ISODate
  productId: ID
  shipName?: string
  serialNo?: string
  truckNo?: string
  grossWeightKg: number
  tareWeightKg: number
  /** What this shipment cost, per ton — optional, but needed for average cost / COGS. */
  pricePerTon?: number
  notes?: string
  createdAt: string
  /** Missing/undefined on legacy records — treated as `'open'` everywhere this is read. */
  status?: ShipmentStatus
  /** Present only once this shipment has been closed. */
  closing?: ShipmentClosing
}

/** One import entry with its net weight (and value, if priced) resolved. Derived, never stored. */
export interface ImportRow extends RawMaterialImport {
  productName: string
  netWeightKg: number
  netWeightTon: number
  /** `netWeightTon × pricePerTon`, or undefined if this shipment has no price. */
  value?: number
}

/**
 * Limestone lost during processing or handling — deducted from raw material
 * stock the same way a sale deducts bags from mesh stock, but never shown as
 * revenue. Reported on separately so the business can see what was lost, not
 * just what's left.
 */
export interface WastageEntry {
  id: ID
  date: ISODate
  productId: ID
  quantityKg: number
  reason?: string
  createdAt: string
}

/** One wastage entry with its product name and tons resolved. Derived, never stored. */
export interface WastageRow extends WastageEntry {
  productName: string
  quantityTon: number
}

/**
 * Raw material stock for one product, in tons — costing's own stock, separate
 * from bagged mesh stock.
 *
 * `currentRawStockTon` is the headline "how much is physically there right
 * now" figure — `importedTon − producedTon − wastageTon`.
 *
 * `openingTon` … `closingTon` are a different view of the same material: the
 * *current* shipment cycle only (§1/§4), never a lifetime total, so a fresh
 * 10,000-ton shipment never reads as if the yard suddenly holds every ton ever
 * received. Chained across every shipment they telescope to exactly the
 * headline figure, and `availableTon` (= `closingTon`) is what the Shipment
 * History screen reports. The two only diverge once a shipment has been closed
 * and its numbers frozen — and there, `currentRawStockTon` is the physical one.
 */
export interface RawMaterialStock {
  productId: ID
  productName: string
  importedTon: number
  wastageTon: number
  producedTon: number
  /**
   * `importedTon − producedTon − wastageTon` — the tonnage physically in the
   * yard right now, and the headline figure on the Raw Material Stock cards.
   * Equals `closingTon` while every shipment is open; where a frozen closed
   * shipment makes the two differ, this is the one that describes the yard.
   */
  currentRawStockTon: number
  availableTon: number
  /** This material's current cycle — the latest shipment's opening balance, or 0 with no shipments yet. */
  openingTon: number
  /** Net tons received on the current (latest) shipment. */
  receivedTon: number
  /** Consumed (production + wastage) within the current cycle's window. */
  consumedTon: number
  /** = `availableTon`; kept alongside it because "Closing" is the label used on screen. */
  closingTon: number
  shipmentCount: number
  openShipmentCount: number
  /** Weighted average of priced imports — undefined if nothing has been priced yet. */
  averageCostPerTon?: number
}

/**
 * One limestone type's raw material position, as the stock cards and the Raw
 * Material report show it (§5/§6):
 *
 *     Opening + Total Imported − Production − Wastage = Current Raw Stock
 *
 * Over an all-time view `openingTon` is 0 and the line reads as the brief's
 * three-way subtraction. Over a date window the three movement figures cover
 * the window only and `openingTon` carries in what was already on hand, so the
 * column still adds up to the stock actually held at the end of it.
 */
export interface RawStockSummary {
  productId: ID
  productName: string
  /** Stock on hand the day before the window opens — 0 when there is no `from`. */
  openingTon: number
  /** Net tons received, within the window. */
  importedTon: number
  /** Tons consumed by bagging (`bags × bagKg`), within the window. */
  productionTon: number
  /** Tons lost as wastage — raw material that left *without* being bagged — within the window. */
  wastageTon: number
  /** The headline: tons physically available right now (or at the window's end). */
  currentRawStockTon: number
  /** Weighted average of priced imports — undefined if nothing has been priced yet. */
  averageCostPerTon?: number
  shipmentCount: number
}

/** One shipment's inventory cycle (§2/§4) — a single row of the shipment history table. */
export interface ShipmentCycleRow {
  id: ID
  productId: ID
  productName: string
  date: ISODate
  shipName?: string
  serialNo?: string
  truckNo?: string
  /** Net tons this shipment brought in. */
  receivedTon: number
  /** The previous shipment's closing balance for this same material — 0 for the first. */
  openingTon: number
  /** `openingTon + receivedTon`, before this cycle's consumption. */
  availableTon: number
  /** Production + wastage dated within this cycle's window. */
  consumedTon: number
  /** `availableTon − consumedTon`; frozen once the shipment is closed. */
  closingTon: number
  status: ShipmentStatus
  closedAt?: string
}
