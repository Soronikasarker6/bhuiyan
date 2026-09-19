import type { ID, ISODate } from './common'

/**
 * A shipment cycle's status.
 *
 * "Open" means its closing balance is still live-computed from whatever
 * consumption is dated within its cycle window, and any new import for this
 * raw material accumulates into it. "Closed" means that balance has been
 * frozen in `ShipmentCycle.closing` — later entries, anywhere in the system,
 * can never move a closed shipment's numbers again, and the next import for
 * this raw material opens a new cycle instead of joining this one.
 */
export type ShipmentStatus = 'open' | 'closed'

/**
 * The frozen snapshot taken the moment a shipment cycle is closed.
 *
 * Stored rather than left to be recomputed on demand — a closed cycle's
 * whole reason to exist is that a later back-dated wastage or production
 * entry, or a future shipment inserted out of order, must never quietly
 * change what was already reported as this cycle's closing balance.
 * Consumed (production) and wastage are frozen as two separate figures —
 * the Shipment History screen reports them apart, never blended.
 */
export interface ShipmentClosing {
  openingTon: number
  receivedTon: number
  consumedTon: number
  wastageTon: number
  closingTon: number
  closedAt: string
}

/**
 * One raw material's inventory cycle. At most one cycle per `productId` is
 * ever `open` at a time (§3) — every import received while it's open
 * belongs to it (`RawMaterialImport.shipmentId`); closing freezes it
 * permanently and the next import opens a new cycle with a new id (§6/§7).
 * This id is the "Shipment ID" shown on screen.
 */
export interface ShipmentCycle {
  id: ID
  productId: ID
  /** Set once, from the first import that opened this cycle — never moved by a later one joining it. */
  openedOn: ISODate
  status: ShipmentStatus
  /** Present only once this cycle has been closed. */
  closing?: ShipmentClosing
}

/**
 * Limestone received from a ship, weighed at the yard — gross in, tare out,
 * net worked out. This is upstream of Production: it says how much raw
 * material arrived, not how much finished, bagged stock exists.
 *
 * Belongs to exactly one `ShipmentCycle` (`shipmentId`) — the inventory
 * cycle it accumulated into, never one of its own (§1/§2).
 */
export interface RawMaterialImport {
  id: ID
  shipmentId: ID
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
  /** Net tons received on the current (latest, possibly still-accumulating) shipment. */
  receivedTon: number
  /** Production consumption within the current cycle's window — never includes wastage. */
  consumedTon: number
  /** Wastage within the current cycle's window — see `wastageTon` above for the all-time figure. */
  cycleWastageTon: number
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

/**
 * One shipment cycle — a single summarized row of the Shipment History
 * table (§8). Never one row per import; see `RawMaterialImport.shipmentId`
 * for how several imports fold into one of these while it stays open. Ship
 * name/truck/serial live on the individual imports, not here — see the
 * cycle's full import history (the "Download" action) for those.
 */
export interface ShipmentCycleRow {
  id: ID
  productId: ID
  productName: string
  /** Set once, from the first import that opened this cycle. */
  openedOn: ISODate
  /** Net tons received across every import folded into this cycle so far. */
  receivedTon: number
  /** The previous shipment's closing balance for this same material — 0 for the first. */
  openingTon: number
  /** `openingTon + receivedTon`, before this cycle's consumption. */
  availableTon: number
  /** Production consumption dated within this cycle's window — never includes wastage. */
  consumedTon: number
  /** Wastage dated within this cycle's window. */
  wastageTon: number
  /** `availableTon − consumedTon − wastageTon`; frozen once the shipment is closed. */
  closingTon: number
  status: ShipmentStatus
  closedAt?: string
}
