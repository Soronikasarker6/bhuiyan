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
  /**
   * The truck/weighbridge's actual measured tonnage for this line, when it
   * differs from `bags × bag weight`. Real bags are rarely exactly the
   * configured weight — a "50kg" bag might scale at 50.2kg — so the
   * calculated figure is a starting point, not the figure billed.
   *
   * Undefined means "use the calculated weight as-is"; a stored value here
   * always wins once set, however small the difference.
   */
  actualWeightTon?: number
}

/**
 * One line item with its weight and amount resolved. Derived, never stored:
 *
 *     Calculated Ton = Bags × Bag Weight (kg) / 1000
 *     Weight (Ton)   = actualWeightTon ?? Calculated Ton   — the *billable* figure
 *     Amount         = Weight (Ton) × Rate / Ton
 *
 * `weightTon` is deliberately the billable figure, not the calculated one —
 * every consumer downstream (amount, the customer ledger, cost of goods
 * sold, reports) reads `weightTon` and must see what the customer was
 * actually charged for, not the theoretical bag-weight arithmetic.
 * `calculatedWeightTon` is kept alongside it purely so the sale form can
 * show both figures side by side.
 */
export interface SaleItemRow extends SaleItem {
  productName: string
  meshSizeName: string
  bagKg: number
  /** Bags × Bag Weight ÷ 1000 — the theoretical figure, never what's billed. */
  calculatedWeightTon: number
  /** The billable weight — `actualWeightTon` if set, else `calculatedWeightTon`. */
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
