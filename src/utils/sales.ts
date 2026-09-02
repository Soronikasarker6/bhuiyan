import type {
  Customer,
  CustomerTransaction,
  ID,
  MeshSize,
  PaymentStatus,
  Product,
  Sale,
  SaleItem,
  SaleItemRow,
  SaleSummary,
} from '@/types'
import { bagKgOf, meshSizeNameOf, productNameOf } from './products'
import { customerNameOf } from './customerLedger'
import { isWithin } from './format'
import { kgToTons } from './imports'

/**
 * Sales.
 *
 * A sale is a header (customer, date, truck) plus one or more items (product,
 * mesh size, bags, rate). A customer buying two products in one visit is
 * one invoice with two items — never two invoices, and never a page per
 * product. Every figure below is computed from the header and its items;
 * nothing here is a second source of truth for an amount already on a line.
 *
 *     Weight (Ton) = Bags × Bag Weight (kg) / 1000
 *     Amount       = Weight (Ton) × Rate / Ton
 *
 * Bags is the figure a person actually counts and the figure stock is
 * deducted by; weight and amount are always derived from it, never entered.
 */

export function saleItemWeightTon(bags: number, bagKg: number): number {
  return kgToTons((Number(bags) || 0) * (Number(bagKg) || 0))
}

export function saleItemAmount(weightTon: number, ratePerTon: number): number {
  return (Number(weightTon) || 0) * (Number(ratePerTon) || 0)
}

export function itemsForSale(saleItems: SaleItem[], saleId: ID): SaleItem[] {
  return saleItems.filter((i) => i.saleId === saleId)
}

export function buildSaleItemRows(
  items: SaleItem[],
  products: Product[],
  meshSizes: MeshSize[],
): SaleItemRow[] {
  return items.map((item) => {
    const bagKg = bagKgOf(meshSizes, item.meshSizeId)
    const weightTon = saleItemWeightTon(item.bags, bagKg)

    return {
      ...item,
      productName: productNameOf(products, item.productId),
      meshSizeName: meshSizeNameOf(meshSizes, item.meshSizeId),
      bagKg,
      weightTon,
      amount: saleItemAmount(weightTon, item.ratePerTon),
    }
  })
}

export function itemsTotal(rows: Array<{ amount: number }>): number {
  return rows.reduce((sum, r) => sum + r.amount, 0)
}

export function itemsWeightTotal(rows: Array<{ weightTon: number }>): number {
  return rows.reduce((sum, r) => sum + (Number(r.weightTon) || 0), 0)
}

export function itemsBagsTotal(rows: Array<{ bags: number }>): number {
  return rows.reduce((sum, r) => sum + (Number(r.bags) || 0), 0)
}

/**
 * Everything paid against one invoice: the amount collected at the moment of
 * sale, plus every payment and advance-adjustment recorded against it since.
 *
 * `sale.paidAtSale` is the figure the sale form captured, but it is not added
 * here on top of the ledger — `buildSaleTransactions` already turns it into a
 * linked `payment` row at the moment the sale is saved, and summing both
 * would count the same money twice. The ledger, not the sale record, is the
 * one source of truth for what has actually been paid.
 */
export function saleAmountPaid(sale: Sale, transactions: CustomerTransaction[]): number {
  return transactions
    .filter(
      (t) =>
        t.referenceSaleId === sale.id &&
        (t.type === 'payment' || t.type === 'advance_adjustment'),
    )
    .reduce((sum, t) => sum + t.credit, 0)
}

export function saleAmountDue(totalAmount: number, amountPaid: number): number {
  return Math.max(0, totalAmount - amountPaid)
}

export function paymentStatusOf(totalAmount: number, amountPaid: number): PaymentStatus {
  if (totalAmount > 0 && amountPaid >= totalAmount) return 'paid'
  if (amountPaid > 0) return 'partial'
  return 'due'
}

function chronological(a: Sale, b: Sale): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : 1
}

/** Every sale, newest first, with its items, totals and payment status resolved. */
export function buildSaleSummaries(
  sales: Sale[],
  saleItems: SaleItem[],
  products: Product[],
  meshSizes: MeshSize[],
  customers: Customer[],
  customerTransactions: CustomerTransaction[],
): SaleSummary[] {
  return [...sales]
    .sort(chronological)
    .reverse()
    .map((sale) => {
      const items = buildSaleItemRows(itemsForSale(saleItems, sale.id), products, meshSizes)
      const totalAmount = itemsTotal(items)
      const amountPaid = saleAmountPaid(sale, customerTransactions)
      const amountDue = saleAmountDue(totalAmount, amountPaid)

      return {
        ...sale,
        customerName: customerNameOf(customers, sale.customerId),
        items,
        totalAmount,
        totalWeightTon: itemsWeightTotal(items),
        amountPaid,
        amountDue,
        status: paymentStatusOf(totalAmount, amountPaid),
      }
    })
}

/** "INV-2026-001" — sequential within the year, never reused. */
export function nextInvoiceNo(sales: Sale[], year: number): string {
  const prefix = `INV-${year}-`
  const max = sales
    .map((s) => s.invoiceNo)
    .filter((no) => no.startsWith(prefix))
    .map((no) => Number(no.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0)

  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

/**
 * The linked ledger rows a new sale writes.
 *
 * A sale always debits the customer's account for its full amount. If
 * anything was collected at the moment of sale, a linked payment credit is
 * written in the same call — the same "linked pair, written together" idiom
 * the cash ledger uses for transfers (`buildTransferLegs`), so a sale can
 * never exist without its debit being recorded, and a same-moment payment can
 * never exist without the invoice it belongs to.
 */
export function buildSaleTransactions(params: {
  sale: Sale
  totalAmount: number
  paymentReference: string
}): CustomerTransaction[] {
  const { sale, totalAmount, paymentReference } = params

  const rows: CustomerTransaction[] = [
    {
      id: `${sale.id}-sale`,
      customerId: sale.customerId,
      date: sale.date,
      type: 'sale',
      reference: sale.invoiceNo,
      description: `Sale — ${sale.invoiceNo}`,
      debit: totalAmount,
      credit: 0,
      referenceSaleId: sale.id,
      createdAt: sale.createdAt,
    },
  ]

  if (sale.paidAtSale > 0) {
    rows.push({
      id: `${sale.id}-payment`,
      customerId: sale.customerId,
      date: sale.date,
      type: 'payment',
      reference: paymentReference,
      description: `Payment at sale — ${sale.invoiceNo}`,
      debit: 0,
      credit: sale.paidAtSale,
      referenceSaleId: sale.id,
      // One millisecond after the sale's own timestamp, never equal to it —
      // the ledger sorts by (date, createdAt, id), and an equal createdAt
      // would fall back to comparing "…-payment" against "…-sale" as plain
      // strings, which can place the payment before the debit it settles
      // and show a nonsensical mid-ledger balance. The invoice is raised,
      // then the same-moment payment is applied against it; this is what
      // keeps that always true regardless of how the ids happen to compare.
      createdAt: new Date(new Date(sale.createdAt).getTime() + 1).toISOString(),
    })
  }

  return rows
}

// ---------------------------------------------------------------- reporting

export interface SaleFilters {
  from?: string
  to?: string
  customerId?: ID
  productId?: ID
  meshSizeId?: ID
  truckNo?: string
  status?: PaymentStatus
  search?: string
}

export function filterSaleSummaries(sales: SaleSummary[], filters: SaleFilters = {}): SaleSummary[] {
  const needle = filters.search?.trim().toLowerCase()

  return sales.filter((sale) => {
    if (!isWithin(sale.date, filters.from, filters.to)) return false
    if (filters.customerId && sale.customerId !== filters.customerId) return false
    if (filters.status && sale.status !== filters.status) return false
    if (filters.truckNo && sale.truckNo !== filters.truckNo) return false
    if (filters.productId && !sale.items.some((i) => i.productId === filters.productId)) return false
    if (filters.meshSizeId && !sale.items.some((i) => i.meshSizeId === filters.meshSizeId)) return false

    if (needle) {
      const haystack = [sale.invoiceNo, sale.customerName, sale.truckNo ?? '', sale.notes ?? '']
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(needle)) return false
    }

    return true
  })
}

/** Sales revenue and count per month for a year, for charts. */
export function monthlySalesSeries(
  sales: SaleSummary[],
  year: number,
): Array<{ monthIndex: number; amount: number; count: number }> {
  const series = Array.from({ length: 12 }, (_, monthIndex) => ({ monthIndex, amount: 0, count: 0 }))

  for (const sale of sales) {
    const [y, m] = sale.date.split('-').map(Number)
    if (y !== year || !m) continue

    const bucket = series[m - 1]
    if (!bucket) continue

    bucket.amount += sale.totalAmount
    bucket.count += 1
  }

  return series
}

/** Sales revenue per product, biggest first — "product-wise sales". */
export function salesByProduct(
  sales: SaleSummary[],
): Array<{ productId: ID; productName: string; amount: number; weightTon: number }> {
  const totals = new Map<ID, { productName: string; amount: number; weightTon: number }>()

  for (const sale of sales) {
    for (const item of sale.items) {
      const existing = totals.get(item.productId) ?? {
        productName: item.productName,
        amount: 0,
        weightTon: 0,
      }
      existing.amount += item.amount
      existing.weightTon += item.weightTon
      totals.set(item.productId, existing)
    }
  }

  return [...totals.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.amount - a.amount)
}

/** Sales revenue per customer, biggest first — "customer-wise sales". */
export function salesByCustomer(
  sales: SaleSummary[],
): Array<{ customerId: ID; customerName: string; amount: number; count: number }> {
  const totals = new Map<ID, { customerName: string; amount: number; count: number }>()

  for (const sale of sales) {
    const existing = totals.get(sale.customerId) ?? {
      customerName: sale.customerName,
      amount: 0,
      count: 0,
    }
    existing.amount += sale.totalAmount
    existing.count += 1
    totals.set(sale.customerId, existing)
  }

  return [...totals.entries()]
    .map(([customerId, v]) => ({ customerId, ...v }))
    .sort((a, b) => b.amount - a.amount)
}

/** Sales revenue per truck, biggest first — "truck-wise sales". */
export function salesByTruck(
  sales: SaleSummary[],
): Array<{ truckNo: string; amount: number; count: number }> {
  const totals = new Map<string, { amount: number; count: number }>()

  for (const sale of sales) {
    const truck = sale.truckNo?.trim()
    if (!truck) continue

    const existing = totals.get(truck) ?? { amount: 0, count: 0 }
    existing.amount += sale.totalAmount
    existing.count += 1
    totals.set(truck, existing)
  }

  return [...totals.entries()]
    .map(([truckNo, v]) => ({ truckNo, ...v }))
    .sort((a, b) => b.amount - a.amount)
}

/** Sales revenue per mesh size, biggest first — "mesh-wise sales". */
export function salesByMeshSize(
  sales: SaleSummary[],
): Array<{ meshSizeName: string; bags: number; amount: number; weightTon: number }> {
  const totals = new Map<string, { bags: number; amount: number; weightTon: number }>()

  for (const sale of sales) {
    for (const item of sale.items) {
      const key = item.meshSizeName
      const existing = totals.get(key) ?? { bags: 0, amount: 0, weightTon: 0 }
      existing.bags += Number(item.bags) || 0
      existing.amount += item.amount
      existing.weightTon += item.weightTon
      totals.set(key, existing)
    }
  }

  return [...totals.entries()]
    .map(([meshSizeName, v]) => ({ meshSizeName, ...v }))
    .sort((a, b) => b.amount - a.amount)
}
