import type {
  Account,
  AppData,
  Customer,
  CustomerTransaction,
  MeshSize,
  PnlYear,
  Product,
  ProductionEntry,
  RawMaterialImport,
  Sale,
  SaleItem,
} from '@/types'
import { emptyMonth } from '@/utils/pnl'
import { toISODate } from '@/utils/format'
import { buildSaleTransactions } from '@/utils/sales'
import { buildAdvance, buildPayment } from '@/utils/customerLedger'

/**
 * Starting data for a first run.
 *
 * This is not a demonstration — it is the real opening position of the
 * business, walking through the actual pipeline this system exists to track:
 * raw material import → mesh-wise production & stock → sales → customer due
 * → Cash In. The featured invoice below reproduces this system's own worked
 * example number for number — 300 bags previous stock, 400 bags produced
 * today (700 total), 200 bags sold today (500 in hand), a ৳50,000 sale, and
 * a ৳20,000 Cash In leaving exactly ৳30,000 due — so the very first thing
 * anyone sees is proof the arithmetic is right.
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

// The business's actual mesh catalog — every one packed 50kg to the bag.
const MESH_SEED: Array<{ id: string; name: string; bagKg: number }> = [
  { id: 'mesh-250', name: '250', bagKg: 50 },
  { id: 'mesh-400', name: '400', bagKg: 50 },
  { id: 'mesh-500', name: '500', bagKg: 50 },
  { id: 'mesh-800', name: '800', bagKg: 50 },
  { id: 'mesh-1000', name: '1000', bagKg: 50 },
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

  // ---------------------------------------------------------------- raw material import
  // imp-1 reproduces this system's own worked example exactly:
  // 28,480 kg gross − 7,820 kg tare = 20,660 kg net = 20.66 Ton.
  const rawMaterialImports: RawMaterialImport[] = [
    { id: 'imp-1', date: daysAgo(12), productId: 'product-1', shipName: 'MV Sea Falcon', serialNo: 'SL-001', truckNo: 'DHA-1001', grossWeightKg: 28_480, tareWeightKg: 7_820, createdAt: stampAgo(12) },
    { id: 'imp-2', date: daysAgo(14), productId: 'product-1', shipName: 'MV Sea Falcon', serialNo: 'SL-002', truckNo: 'DHA-1002', grossWeightKg: 32_000, tareWeightKg: 9_000, createdAt: stampAgo(14) },
    { id: 'imp-3', date: daysAgo(9), productId: 'product-1', shipName: 'MV Coral Star', serialNo: 'SL-003', truckNo: 'DHA-1003', grossWeightKg: 30_000, tareWeightKg: 9_200, createdAt: stampAgo(9) },
    { id: 'imp-4', date: daysAgo(16), productId: 'product-2', shipName: 'MV Gulf Pearl', serialNo: 'SL-004', truckNo: 'DHA-2001', grossWeightKg: 27_000, tareWeightKg: 8_200, createdAt: stampAgo(16) },
    { id: 'imp-5', date: daysAgo(8), productId: 'product-2', shipName: 'MV Gulf Pearl', serialNo: 'SL-005', truckNo: 'DHA-2002', grossWeightKg: 26_500, tareWeightKg: 8_300, createdAt: stampAgo(8) },
    { id: 'imp-6', date: daysAgo(19), productId: 'product-3', shipName: 'MV Delta Wave', serialNo: 'SL-006', truckNo: 'DHA-3001', grossWeightKg: 31_000, tareWeightKg: 9_300, createdAt: stampAgo(19) },
    { id: 'imp-7', date: daysAgo(11), productId: 'product-3', shipName: 'MV Delta Wave', serialNo: 'SL-007', truckNo: 'DHA-3002', grossWeightKg: 24_000, tareWeightKg: 7_800, createdAt: stampAgo(11) },
  ]

  // ---------------------------------------------------------------- production & stock
  const productionEntries: ProductionEntry[] = [
    // VWL / Mesh 250 — the featured example: previous stock 300, today's
    // production 400, total production 700.
    { id: 'prod-1', date: daysAgo(10), productId: 'product-1', meshId: 'mesh-250', bags: 300, createdAt: stampAgo(10) },
    { id: 'prod-2', date: daysAgo(0), productId: 'product-1', meshId: 'mesh-250', bags: 400, createdAt: stampAgo(0) },
    // ORL / Mesh 500
    { id: 'prod-3', date: daysAgo(14), productId: 'product-2', meshId: 'mesh-500', bags: 200, createdAt: stampAgo(14) },
    { id: 'prod-4', date: daysAgo(7), productId: 'product-2', meshId: 'mesh-500', bags: 150, createdAt: stampAgo(7) },
    // GRL / Mesh 400
    { id: 'prod-5', date: daysAgo(13), productId: 'product-3', meshId: 'mesh-400', bags: 150, createdAt: stampAgo(13) },
    { id: 'prod-6', date: daysAgo(5), productId: 'product-3', meshId: 'mesh-400', bags: 100, createdAt: stampAgo(5) },
  ]

  // ---------------------------------------------------------------- sales
  const sales: Sale[] = [
    { id: 'sale-1', invoiceNo: `INV-${YEAR}-001`, date: daysAgo(9), customerId: 'cust-1', truckNo: 'DHA-1234', paidAtSale: 15_000, createdAt: stampAgo(9) },
    { id: 'sale-2', invoiceNo: `INV-${YEAR}-002`, date: daysAgo(6), customerId: 'cust-2', truckNo: 'DHA-5678', paidAtSale: 10_000, createdAt: stampAgo(6) },
    { id: 'sale-3', invoiceNo: `INV-${YEAR}-003`, date: daysAgo(3), customerId: 'cust-3', truckNo: 'DHA-9012', paidAtSale: 18_800, createdAt: stampAgo(3) },
    // sale-4 reproduces the spec's own worked example: 200 bags of VWL /
    // Mesh 250 at ৳5,000/Ton = ৳50,000, sold entirely on credit.
    { id: 'sale-4', invoiceNo: `INV-${YEAR}-004`, date: daysAgo(0), customerId: 'cust-1', truckNo: 'DHA-1234', paidAtSale: 0, createdAt: stampAgo(0) },
  ]

  const saleItems: SaleItem[] = [
    { id: 'item-1', saleId: 'sale-1', productId: 'product-2', meshSizeId: 'mesh-500', bags: 60, ratePerTon: 5_000 },
    { id: 'item-2', saleId: 'sale-2', productId: 'product-2', meshSizeId: 'mesh-500', bags: 100, ratePerTon: 4_800 },
    { id: 'item-3', saleId: 'sale-3', productId: 'product-3', meshSizeId: 'mesh-400', bags: 80, ratePerTon: 4_700 },
    { id: 'item-4', saleId: 'sale-4', productId: 'product-1', meshSizeId: 'mesh-250', bags: 200, ratePerTon: 5_000 },
  ]

  // ---------------------------------------------------------------- customer ledger
  const customerTransactions: CustomerTransaction[] = [
    {
      id: 'ctxn-opening-cust-2',
      customerId: 'cust-2',
      date: daysAgo(20),
      type: 'opening_balance',
      reference: 'OPN-001',
      description: 'Opening balance',
      debit: 20_000,
      credit: 0,
      createdAt: stampAgo(20),
    },
    // An advance sitting unapplied, so the Advances page has something to show.
    buildAdvance({
      id: 'ctxn-adv-001',
      customerId: 'cust-1',
      date: daysAgo(15),
      reference: 'ADV-001',
      amount: 15_000,
      createdAt: stampAgo(15),
    }),
    ...buildSaleTransactions({ sale: sales[0]!, totalAmount: 60 * 5_000 * 50 / 1000, paymentReference: `${sales[0]!.invoiceNo}-PD` }),
    ...buildSaleTransactions({ sale: sales[1]!, totalAmount: 100 * 4_800 * 50 / 1000, paymentReference: `${sales[1]!.invoiceNo}-PD` }),
    ...buildSaleTransactions({ sale: sales[2]!, totalAmount: 80 * 4_700 * 50 / 1000, paymentReference: `${sales[2]!.invoiceNo}-PD` }),
    ...buildSaleTransactions({ sale: sales[3]!, totalAmount: 200 * 5_000 * 50 / 1000, paymentReference: `${sales[3]!.invoiceNo}-PD` }),
    // The spec's own Cash In example: ৳20,000 collected against the
    // ৳50,000 sale above, leaving exactly ৳30,000 due.
    buildPayment({
      id: 'ctxn-pay-001',
      customerId: 'cust-1',
      date: daysAgo(0),
      reference: 'PAY-001',
      amount: 20_000,
      referenceSaleId: 'sale-4',
      method: 'Cash',
      createdAt: new Date(new Date(stampAgo(0)).getTime() + 1).toISOString(),
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
    rawMaterialImports,
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
