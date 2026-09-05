import type { ID, ISODate } from './common'

/**
 * Limestone received from a ship, weighed at the yard — gross in, tare out,
 * net worked out. This is upstream of Production: it says how much raw
 * material arrived, not how much finished, bagged stock exists.
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

/** Raw material stock for one product, in tons — costing's own stock, separate from bagged mesh stock. */
export interface RawMaterialStock {
  productId: ID
  productName: string
  importedTon: number
  wastageTon: number
  producedTon: number
  availableTon: number
  /** Weighted average of priced imports — undefined if nothing has been priced yet. */
  averageCostPerTon?: number
}
