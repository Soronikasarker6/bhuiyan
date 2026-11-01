import type { ID, ISODate } from './common'

/**
 * - `finished_product` — bagged, mesh-wise stock out of production (every
 *   sale before raw material sales existed).
 * - `raw_material` — raw limestone sold straight from the yard by weighbridge
 *   net weight. Deducts raw stock (never bags) and is never production.
 */
export type SaleType = 'finished_product' | 'raw_material'

/** The invoice header. Line items live in `SaleItem`, keyed by `saleId`. */
export interface Sale {
  id: ID
  invoiceNo: string
  date: ISODate
  customerId: ID
  /** Absent on data recorded before sale types existed — read as `finished_product` (see `saleTypeOf`). */
  saleType?: SaleType
  truckNo?: string
  /**
   * The truck's weighbridge slip for the whole load — null on sales recorded
   * before the slip was captured (never backfilled).
   *
   * On a finished-product sale it is optional and only a record of what the
   * truck carried: net (`gross − tare`, see `saleNetWeightKg`) never feeds
   * amounts, ledgers or stock — those read the items' billable `weightTon`.
   * On a raw material sale it is required, and the net *is* the billable
   * weight: the server writes it onto the sale's one line as `actualWeightTon`.
   */
  grossWeightKg?: number | null
  tareWeightKg?: number | null
  notes?: string
  /** Collected at the moment of sale — a real input, not a derived figure. */
  paidAtSale: number
  /**
   * Set once an Admin reverses the sale: the business date the reversal took
   * effect. The sale and everything it posted stay untouched; a
   * `sale_reversal` credit (and, for raw material, a stock return) is posted
   * on this date instead. A reversed sale cannot be edited or deleted.
   */
  reversedOn?: ISODate | null
  reversalReason?: string | null
  createdAt: string
}

export interface SaleItem {
  id: ID
  saleId: ID
  productId: ID
  /**
   * Required on a finished-product line — bag-based stock deduction can't
   * work without knowing the bag weight. Null on a raw material line, which
   * is sold loose by weight (bags is 0 there too).
   */
  meshSizeId: ID | null
  bags: number
  /**
   * Confidential — only included by the API for users with SALES_RATE_VIEW
   * (Admin/Manager). Absent for everyone else; `amount` below is always
   * present regardless, computed server-side, so totals/due/reports never
   * depend on this field being visible.
   */
  ratePerTon?: number
  /** Billable weight × rate, computed server-side — always present even when `ratePerTon` is hidden. */
  amount?: number
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

/**
 * How an invoice stands.
 *
 * 'advance' is its own case rather than a flavour of 'paid': both mean
 * nothing is owed, but 'advance' says the invoice was covered by credit the
 * customer already held when it was raised, not by money received for it.
 */
/** 'reversed' — cancelled by an Admin reversal; the sale is kept as history but no longer stands. */
export type PaymentStatus = 'paid' | 'partial' | 'due' | 'advance' | 'reversed'

/** A sale header with everything a list screen needs. Derived, never stored. */
export interface SaleSummary extends Sale {
  customerName: string
  items: SaleItemRow[]
  totalAmount: number
  totalWeightTon: number
  amountPaid: number
  amountDue: number
  /** How much of `amountPaid` came from credit the customer already held when this invoice was raised. */
  coveredByAdvance: number
  status: PaymentStatus
}

/** One raw material sale as a raw-stock OUT — subtracted beside production and wastage, never as either. */
export interface RawMaterialSaleMovement {
  saleId: ID
  productId: ID
  date: ISODate
  ton: number
}
