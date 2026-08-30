import type {
  Account,
  AppData,
  Customer,
  CustomerTransaction,
  MeshSize,
  PnlYear,
  Product,
  ProductionEntry,
  Sale,
  SaleItem,
} from '@/types'
import { emptyMonth } from '@/utils/pnl'
import { toISODate } from '@/utils/format'
import { buildSaleTransactions } from '@/utils/sales'
import { buildAdvance, buildAdvanceAdjustment, buildOpeningBalance, buildPayment } from '@/utils/customerLedger'

/**
 * Starting data for a first run.
 *
 * Real opening figures for a limestone trading business, not a demonstration
 * to be cleared out: three products, four mesh sizes, three customers with a
 * short but genuine transaction history, and the one month of P&L that was
 * already on hand when the ledger was set up. The sales here deliberately
 * reproduce the spec's own worked examples — a multi-item invoice, a credit
 * sale settled by a later payment, and an advance partly applied to a sale —
 * so the very first thing anyone sees is proof the arithmetic is right.
 */

const DAY = 24 * 60 * 60 * 1000

const daysAgo = (n: number): string => toISODate(new Date(Date.now() - n * DAY))
const stampAgo = (n: number): string => new Date(Date.now() - n * DAY).toISOString()

const YEAR = new Date().getFullYear()

// ---------------------------------------------------------------- products

const PRODUCT_SEED: Array<{ id: string; name: string; code: string; description: string }> = [
  {
    id: 'product-1',
    name: 'Vietnam White Limestone',
    code: 'VWL',
    description: 'Imported white limestone aggregate',
  },
  {
    id: 'product-2',
    name: 'Oman Red Limestone',
    code: 'ORL',
    description: 'Imported red limestone aggregate',
  },
  {
    id: 'product-3',
    name: 'Gray Limestone',
    code: 'GRL',
    description: 'Domestic gray limestone aggregate',
  },
]

const MESH_SEED: Array<{ id: string; name: string }> = [
  { id: 'mesh-1', name: '10 Mesh' },
  { id: 'mesh-2', name: '20 Mesh' },
  { id: 'mesh-3', name: '30 Mesh' },
  { id: 'mesh-4', name: 'Powder' },
]

// ---------------------------------------------------------------- customers

const CUSTOMER_SEED: Array<Omit<Customer, 'active' | 'createdAt'>> = [
  {
    id: 'cust-1',
    name: 'ABC Trading',
    company: 'ABC Trading Ltd',
    phone: '01711-000111',
    address: 'Tongi, Gazipur',
    openingBalance: 0,
  },
  {
    id: 'cust-2',
    name: 'Meghna Glass Works',
    company: 'Meghna Glass Works Ltd',
    phone: '01819-222333',
    address: 'Narayanganj',
    openingBalance: 20_000,
  },
  {
    id: 'cust-3',
    name: 'Dhaka Ceramics Ltd',
    phone: '01922-444555',
    address: 'Savar, Dhaka',
    openingBalance: 0,
  },
]

// ---------------------------------------------------------------- accounts & categories

const ACCOUNT_SEED: Array<{ name: string; kind: Account['kind']; system: boolean }> = [
  { name: 'Cash', kind: 'cash', system: true },
  { name: 'UCB', kind: 'bank', system: false },
  { name: 'Dutch Bangla', kind: 'bank', system: false },
  { name: 'South East', kind: 'bank', system: false },
  { name: 'Janata', kind: 'bank', system: false },
]

const IN_CATEGORIES = [
  'Customer Payment',
  'Bank Loan',
  'Cash to Bank',
  'Bank to Cash',
  'Opening Balance',
  'Others',
]

const OUT_CATEGORIES = [
  'Labour Bill',
  'Electricity Bill',
  'Freight & Transport',
  'Office Cost',
  'Rent',
  'Bank Loan Repayment',
  'Cash to Bank',
  'Bank to Cash',
  'Others',
]

/** The one month of P&L already on record when the ledger started. Always January. */
const OPENING_MONTH = {
  sales: 6_090_000,
  materialCost: 5_000_000,
  labourCost: 97_440,
  electricity: 365_400,
  freight: 182_700,
  transport: 20_000,
  handling: 20_000,
  otherCosts: 5_000,
  officeAdmin: 120_000,
  rent: 100_000,
  interest: 359_000,
}

export function seedData(): AppData {
  const stamp = stampAgo(20)

  const products: Product[] = PRODUCT_SEED.map((p) => ({ ...p, unit: 'Ton', active: true, createdAt: stamp }))
  const meshSizes: MeshSize[] = MESH_SEED.map((m) => ({ ...m, active: true, createdAt: stamp }))
  const customers: Customer[] = CUSTOMER_SEED.map((c) => ({ ...c, active: true, createdAt: stamp }))

  const accounts: Account[] = ACCOUNT_SEED.map((account, index) => ({
    id: `acc-${index + 1}`,
    name: account.name,
    kind: account.kind,
    system: account.system,
    createdAt: stamp,
  }))

  const categories = [
    ...IN_CATEGORIES.map((name, i) => ({ id: `cat-in-${i + 1}`, name, direction: 'in' as const, createdAt: stamp })),
    ...OUT_CATEGORIES.map((name, i) => ({ id: `cat-out-${i + 1}`, name, direction: 'out' as const, createdAt: stamp })),
  ]

  // ---------------------------------------------------------------- production
  const productionEntries: ProductionEntry[] = [
    { id: 'prod-1', date: daysAgo(18), productId: 'product-1', grossWeightKg: 32_000, tareWeightKg: 9_000, createdAt: stampAgo(18) },
    { id: 'prod-2', date: daysAgo(14), productId: 'product-1', grossWeightKg: 28_000, tareWeightKg: 8_500, createdAt: stampAgo(14) },
    { id: 'prod-3', date: daysAgo(9), productId: 'product-1', grossWeightKg: 25_000, tareWeightKg: 8_000, createdAt: stampAgo(9) },
    { id: 'prod-4', date: daysAgo(3), productId: 'product-1', grossWeightKg: 30_000, tareWeightKg: 9_200, createdAt: stampAgo(3) },
    { id: 'prod-5', date: daysAgo(16), productId: 'product-2', grossWeightKg: 27_000, tareWeightKg: 8_200, createdAt: stampAgo(16) },
    { id: 'prod-6', date: daysAgo(11), productId: 'product-2', grossWeightKg: 26_500, tareWeightKg: 8_300, createdAt: stampAgo(11) },
    { id: 'prod-7', date: daysAgo(5), productId: 'product-2', grossWeightKg: 29_000, tareWeightKg: 8_900, createdAt: stampAgo(5) },
    { id: 'prod-8', date: daysAgo(19), productId: 'product-3', grossWeightKg: 31_000, tareWeightKg: 9_300, createdAt: stampAgo(19) },
    { id: 'prod-9', date: daysAgo(12), productId: 'product-3', grossWeightKg: 24_000, tareWeightKg: 7_800, createdAt: stampAgo(12) },
    { id: 'prod-10', date: daysAgo(6), productId: 'product-3', grossWeightKg: 27_500, tareWeightKg: 8_400, createdAt: stampAgo(6) },
    { id: 'prod-11', date: daysAgo(2), productId: 'product-3', grossWeightKg: 26_000, tareWeightKg: 8_100, createdAt: stampAgo(2) },
  ]

  // ---------------------------------------------------------------- sales
  // sale-1 reproduces the spec's own multi-item invoice example exactly:
  // Vietnam White 10t @5000 + Gray 5t @4500 = 72,500, paid in full.
  const sales: Sale[] = [
    { id: 'sale-1', invoiceNo: `INV-${YEAR}-001`, date: daysAgo(10), customerId: 'cust-1', truckNo: 'DHA-1234', paidAtSale: 72_500, createdAt: stampAgo(10) },
    // sale-2 reproduces the spec's credit-sale example: 100,000 sold, 40,000
    // paid at sale, 60,000 due — settled later by PAY-001 below.
    { id: 'sale-2', invoiceNo: `INV-${YEAR}-002`, date: daysAgo(7), customerId: 'cust-2', truckNo: 'DHA-5678', paidAtSale: 40_000, createdAt: stampAgo(7) },
    { id: 'sale-3', invoiceNo: `INV-${YEAR}-003`, date: daysAgo(4), customerId: 'cust-3', truckNo: 'DHA-9012', paidAtSale: 49_000, createdAt: stampAgo(4) },
    // sale-4 reproduces the spec's advance-adjustment example: 35,000 sold,
    // settled entirely by applying part of ADV-001 below (see ADJ-001).
    { id: 'sale-4', invoiceNo: `INV-${YEAR}-004`, date: daysAgo(2), customerId: 'cust-1', truckNo: 'DHA-1234', paidAtSale: 0, createdAt: stampAgo(2) },
  ]

  const saleItems: SaleItem[] = [
    { id: 'item-1a', saleId: 'sale-1', productId: 'product-1', meshSizeId: 'mesh-1', weightTon: 10, ratePerTon: 5_000 },
    { id: 'item-1b', saleId: 'sale-1', productId: 'product-3', meshSizeId: 'mesh-2', weightTon: 5, ratePerTon: 4_500 },
    { id: 'item-2a', saleId: 'sale-2', productId: 'product-2', meshSizeId: 'mesh-3', weightTon: 20, ratePerTon: 5_000 },
    { id: 'item-3a', saleId: 'sale-3', productId: 'product-3', meshSizeId: 'mesh-4', weightTon: 6, ratePerTon: 4_700 },
    { id: 'item-3b', saleId: 'sale-3', productId: 'product-1', meshSizeId: 'mesh-1', weightTon: 4, ratePerTon: 5_200 },
    { id: 'item-4a', saleId: 'sale-4', productId: 'product-1', meshSizeId: 'mesh-2', weightTon: 7, ratePerTon: 5_000 },
  ]

  // ---------------------------------------------------------------- customer ledger
  const customerTransactions: CustomerTransaction[] = [
    buildOpeningBalance({
      id: 'ctxn-opening-cust-2',
      customerId: 'cust-2',
      date: daysAgo(20),
      reference: 'OPN-001',
      amount: 20_000,
      createdAt: stampAgo(20),
    }),
    // Advance received well before it is used against sale-4.
    buildAdvance({
      id: 'ctxn-adv-001',
      customerId: 'cust-1',
      date: daysAgo(15),
      reference: 'ADV-001',
      amount: 50_000,
      createdAt: stampAgo(15),
    }),
    ...buildSaleTransactions({ sale: sales[0]!, totalAmount: 72_500, paymentReference: `${sales[0]!.invoiceNo}-PD` }),
    ...buildSaleTransactions({ sale: sales[1]!, totalAmount: 100_000, paymentReference: `${sales[1]!.invoiceNo}-PD` }),
    ...buildSaleTransactions({ sale: sales[2]!, totalAmount: 49_000, paymentReference: `${sales[2]!.invoiceNo}-PD` }),
    ...buildSaleTransactions({ sale: sales[3]!, totalAmount: 35_000, paymentReference: `${sales[3]!.invoiceNo}-PD` }),
    // A later, standalone payment settling the rest of sale-2's due.
    buildPayment({
      id: 'ctxn-pay-001',
      customerId: 'cust-2',
      date: daysAgo(3),
      reference: 'PAY-001',
      amount: 20_000,
      referenceSaleId: 'sale-2',
      createdAt: stampAgo(3),
    }),
    // Part of ADV-001 applied against sale-4 — settles it in full and
    // leaves 15,000 of advance still available, matching the spec exactly.
    // createdAt is one tick after sale-4's own, so the ledger always orders
    // the sale before the adjustment that settles it.
    buildAdvanceAdjustment({
      id: 'ctxn-adj-001',
      customerId: 'cust-1',
      date: daysAgo(2),
      reference: 'ADJ-001',
      amount: 35_000,
      referenceSaleId: 'sale-4',
      createdAt: new Date(new Date(sales[3]!.createdAt).getTime() + 1).toISOString(),
    }),
  ]

  // ---------------------------------------------------------------- P&L
  const pnl: PnlYear[] = [
    {
      year: YEAR,
      months: Array.from({ length: 12 }, (_, monthIndex) =>
        monthIndex === 0 ? { monthIndex, ...OPENING_MONTH } : emptyMonth(monthIndex),
      ),
    },
  ]

  return {
    products,
    meshSizes,
    productionEntries,
    customers,
    sales,
    saleItems,
    customerTransactions,
    accounts,
    categories,
    transactions: [],
    pnl,
    ledgerClosings: [],
    seeded: true,
  }
}
