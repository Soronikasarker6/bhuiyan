import type { ID, ISODate } from './common'

/** The invoice header. Line items live in `SaleItem`, keyed by `saleId`. */
export interface Sale {
  id: ID
  invoiceNo: string
  date: ISODate
  customerId: ID
  truckNo?: string
  notes?: string
  /** Collected at the moment of sale — a real input, not a derived figure. */
  paidAtSale: number
  createdAt: string
}

export interface SaleItem {
  id: ID
  saleId: ID
  productId: ID
  /** Required — bag-based stock deduction can't work without knowing the bag weight. */
  meshSizeId: ID
  bags: number
  ratePerTon: number
}

/**
 * One line item with its weight and amount resolved. Derived, never stored:
 *
 *     Weight (Ton) = Bags × Bag Weight (kg) / 1000
 *     Amount       = Weight (Ton) × Rate / Ton
 */
export interface SaleItemRow extends SaleItem {
  productName: string
  meshSizeName: string
  bagKg: number
  weightTon: number
  amount: number
}

export type PaymentStatus = 'paid' | 'partial' | 'due'

/** A sale header with everything a list screen needs. Derived, never stored. */
export interface SaleSummary extends Sale {
  customerName: string
  items: SaleItemRow[]
  totalAmount: number
  totalWeightTon: number
  amountPaid: number
  amountDue: number
  status: PaymentStatus
}
