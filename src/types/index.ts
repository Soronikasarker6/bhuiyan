/**
 * The domain, as types.
 *
 * Everything the application knows about is declared here and nowhere else.
 * Conventions worth stating up front:
 *
 *   - Raw material import weight is always in KG (gross/tare/net, as the
 *     weighbridge reports it); `netWeightKg` is never stored — it is always
 *     `grossWeightKg - tareWeightKg`, computed through one function, so a
 *     typed net figure can never disagree with the two weights behind it.
 *   - Production and stock are always counted in bags first; kg and tons are
 *     always `bags × bagKg` / `.../1000`, computed, never stored. Sales
 *     quantity is entered in bags for the same reason — it's what a sale
 *     actually deducts from stock — and its ton weight is derived the same
 *     way.
 *   - Money is a number of Taka, rounded for display through one function.
 *   - A customer's balance, due, and available advance are never stored —
 *     they are derived from the `CustomerTransaction` log, the same way an
 *     account balance is derived from `Transaction`s. A stored balance is a
 *     second source of truth, and the two will eventually disagree.
 */

export type ID = string

/** `YYYY-MM-DD`. Sortable as a string, which is why it is a string. */
export type ISODate = string

/** `YYYY-MM`. The identity of a closable month. */
export type MonthKey = string

// ---------------------------------------------------------------- products

/**
 * A product/stone type the business trades in.
 *
 * Nothing about the system hard-codes "Vietnam White Limestone" or any other
 * name — every product on screen came from this list, added the same way the
 * first three were.
 */
export interface Product {
  id: ID
  name: string
  code: string
  description?: string
  /** How it is sold — "Ton" for every product today, but not assumed anywhere. */
  unit: string
  /** Retired products vanish from entry forms but keep their history. */
  active: boolean
  createdAt: string
}

/**
 * A configurable production/sale attribute — mesh size, grind, or grade.
 *
 * A global catalog: "250 Mesh" carries one bag weight shared across every
 * limestone type, rather than each product configuring its own. Adding
 * "1200" later, or changing what a bag of "250" weighs, is a Settings
 * action, never a code change.
 */
export interface MeshSize {
  id: ID
  name: string
  /** kg per bag — the one fact both Production and Sales convert through. */
  bagKg: number
  active: boolean
  createdAt: string
}

// ---------------------------------------------------------------- raw material import

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
  notes?: string
  createdAt: string
}

/** One import entry with its net weight resolved. Derived, never stored. */
export interface ImportRow extends RawMaterialImport {
  productName: string
  netWeightKg: number
  netWeightTon: number
}

// ---------------------------------------------------------------- production & stock

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

// ---------------------------------------------------------------- customers

export interface Customer {
  id: ID
  name: string
  phone?: string
  address?: string
  company?: string
  /** Positive = the customer already owed this before the ledger started. */
  openingBalance: number
  notes?: string
  active: boolean
  createdAt: string
}

// ---------------------------------------------------------------- sales

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

// ---------------------------------------------------------------- customer ledger

export type CustomerTxnType =
  | 'sale'
  | 'payment'
  | 'advance'
  | 'advance_adjustment'
  | 'refund'
  | 'opening_balance'
  | 'other'

/**
 * One row of a customer's account.
 *
 * `balance = running(debit − credit)` — exactly the formula `utils/ledger.ts`
 * already uses for cash accounts, reused here for receivables. A sale is a
 * debit (the customer owes more); a payment or an advance received is a
 * credit (money came in) — both reduce the balance the same way, and `type`
 * is what lets the UI and reports tell them apart.
 *
 * `referenceSaleId` links a payment or an advance-adjustment to the one
 * invoice it settles, which is what lets a single sale show its own paid/due
 * figures. `linkedAccountId` optionally posts the same event into the
 * company's Cash & Bank Ledger as a normal `Transaction`, so the two ledgers
 * stay reconcilable without being the same ledger.
 */
export interface CustomerTransaction {
  id: ID
  customerId: ID
  date: ISODate
  type: CustomerTxnType
  /** "INV-2026-001" / "ADV-001" / "PAY-001" — auto-numbered per type. */
  reference: string
  description: string
  debit: number
  credit: number
  referenceSaleId?: ID
  linkedAccountId?: ID
  /** How a payment arrived — Cash, Bank Transfer, Cheque, Mobile Banking… — for the Cash In report. Purely descriptive. */
  method?: string
  createdAt: string
}

/** A transaction with its running balance resolved. Derived, never stored. */
export interface CustomerLedgerRow extends CustomerTransaction {
  balance: number
}

/** The §13 financial summary for one customer. Derived, never stored. */
export interface CustomerTotals {
  totalSales: number
  totalPaid: number
  totalDue: number
  totalAdvance: number
  availableAdvance: number
  balance: number
  transactionCount: number
  lastTransactionDate: ISODate | null
}

// ---------------------------------------------------------------- ledger (cash & bank)

export type AccountKind = 'cash' | 'bank'

export interface Account {
  id: ID
  name: string
  kind: AccountKind
  /** The cash account cannot be deleted; every business has one. */
  system: boolean
  createdAt: string
}

export type Direction = 'in' | 'out'

export interface Category {
  id: ID
  name: string
  direction: Direction
  createdAt: string
}

export interface Transaction {
  id: ID
  date: ISODate
  details: string
  accountId: ID
  direction: Direction
  category: string
  amount: number
  /**
   * Present on both legs of a transfer, and identical between them. Money
   * moving between two of our own accounts is one event with two entries;
   * this is what keeps them together when one is deleted.
   */
  transferId?: ID
  createdAt: string
}

/** A transaction with its running account balance resolved. Derived. */
export interface LedgerRow extends Transaction {
  accountName: string
  balance: number
}

export interface AccountBalance {
  accountId: ID
  accountName: string
  kind: AccountKind
  totalIn: number
  totalOut: number
  balance: number
}

export interface LedgerClosing {
  id: ID
  monthKey: MonthKey
  month: string
  year: number
  balances: Array<{ accountId: ID; accountName: string; kind: AccountKind; balance: number }>
  cashTotal: number
  bankTotal: number
  grandTotal: number
  monthIn: number
  monthOut: number
  netMovement: number
  closedAt: string
}

// ---------------------------------------------------------------- profit & loss

/** The cost lines that sit above gross profit. */
export const PRODUCTION_COST_KEYS = [
  'materialCost',
  'labourCost',
  'electricity',
  'freight',
  'transport',
  'handling',
  'otherCosts',
] as const

/** The cost lines that sit between gross profit and net profit. */
export const OPERATING_COST_KEYS = ['officeAdmin', 'rent', 'interest'] as const

export type ProductionCostKey = (typeof PRODUCTION_COST_KEYS)[number]
export type OperatingCostKey = (typeof OPERATING_COST_KEYS)[number]
export type PnlCostKey = ProductionCostKey | OperatingCostKey
export type PnlFieldKey = 'sales' | PnlCostKey

export type PnlMonth = {
  /** 0–11, so it indexes MONTHS directly. */
  monthIndex: number
} & Record<PnlFieldKey, number>

export interface PnlYear {
  year: number
  months: PnlMonth[]
}

/** Gross and net for one month. Always computed, never entered. */
export interface PnlResult {
  productionCost: number
  grossProfit: number
  operatingCost: number
  netProfit: number
  grossMargin: number
  netMargin: number
}

// ---------------------------------------------------------------- persistence

export interface AppData {
  products: Product[]
  meshSizes: MeshSize[]
  /** Raw material received from ships — gross/tare/net at the yard. */
  rawMaterialImports: RawMaterialImport[]
  /** Bag-wise production, mesh by mesh. */
  productionEntries: ProductionEntry[]
  customers: Customer[]
  sales: Sale[]
  saleItems: SaleItem[]
  customerTransactions: CustomerTransaction[]
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  pnl: PnlYear[]
  ledgerClosings: LedgerClosing[]
  /** Set once when the sample data is laid down, so the UI can label it. */
  seeded: boolean
}

// ---------------------------------------------------------------- reporting

export interface ReportColumn<T> {
  key: string
  label: string
  align?: 'left' | 'right'
  render: (row: T) => string
}
