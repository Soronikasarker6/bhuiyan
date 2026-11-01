import type { ID, ISODate } from './common'

/**
 * One day's bagging of a product into a given mesh size.
 *
 * There is deliberately no "sell" field here — "Today's Sell" in the stock
 * ledger is always read from actual `SaleItem`s dated that day, never typed
 * directly, which is what keeps stock trustworthy instead of a second,
 * driftable source of truth.
 */
export interface ProductionEntry {
  id: ID
  date: ISODate
  productId: ID
  meshId: ID
  bags: number
  notes?: string
  /**
   * Set once an Admin reverses the entry (it sat in a closed shipment cycle,
   * where edit/delete are refused). The entry stays as recorded; its effect
   * is undone on this date instead — never in the original, frozen cycle.
   */
  reversedOn?: ISODate | null
  reversalReason?: string | null
  createdAt: string
}

/** One row of the §4 stock ledger for one (product, mesh) on one date. */
export interface StockLedgerRow {
  date: ISODate
  productId: ID
  meshId: ID
  previousStockBags: number
  productionBags: number
  totalProductionBags: number
  sellBags: number
  stockBags: number
}

/** The §9 per-mesh breakdown for one product. */
export interface MeshStock {
  meshId: ID
  meshName: string
  bagKg: number
  stockBags: number
  stockKg: number
  stockTon: number
}
