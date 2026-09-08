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
 * `openingTon` … `closingTon` describe the *current* shipment cycle only
 * (§1/§4) — never a lifetime total — so a fresh 10,000-ton shipment never
 * reads as if the yard suddenly holds every ton ever received. `availableTon`
 * is kept as the headline "how much is there right now" figure and always
 * equals `closingTon`; `importedTon`/`wastageTon`/`producedTon` stay as the
 * all-time totals other screens (average cost, historical reports) already
 * depend on.
 */
export interface RawMaterialStock {
  productId: ID
  productName: string
  importedTon: number
  wastageTon: number
  producedTon: number
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
