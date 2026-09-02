import type {
  Customer,
  CustomerLedgerRow,
  CustomerTotals,
  CustomerTransaction,
  CustomerTxnType,
  ID,
  ISODate,
  SaleSummary,
} from '@/types'
import { isWithin } from './format'

/**
 * The customer ledger.
 *
 *     Balance = running(Debit − Credit)
 *
 * exactly the formula `utils/ledger.ts` already uses for cash accounts,
 * reused here for receivables. A sale debits (the customer owes more); a
 * payment or an advance received credits (money came in) — both move the
 * balance the same way. `type` is what lets the UI and reports tell a
 * payment apart from an advance, not the arithmetic.
 *
 * "Total Due" and "Available Advance" are deliberately two separate figures,
 * not one netted balance — a customer can be overdue on one invoice while
 * still holding unused advance from an unrelated deposit. Due is tracked per
 * invoice (via `SaleSummary.amountDue`, computed in `utils/sales.ts`);
 * advance is tracked as its own pool here.
 */

function chronological(a: CustomerTransaction, b: CustomerTransaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : 1
}

export function transactionsForCustomer(
  transactions: CustomerTransaction[],
  customerId: ID,
): CustomerTransaction[] {
  return transactions.filter((t) => t.customerId === customerId)
}

/** Every transaction for one customer, newest first, with its running balance. */
export function buildCustomerLedgerRows(transactions: CustomerTransaction[]): CustomerLedgerRow[] {
  const ordered = [...transactions].sort(chronological)
  let running = 0

  const rows = ordered.map((t) => {
    running += t.debit - t.credit
    return { ...t, balance: running }
  })

  return rows.reverse()
}

export function customerBalance(transactions: CustomerTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.debit - t.credit, 0)
}

/**
 * Advance received, minus what has since been applied to a sale or refunded.
 *
 * An `advance_adjustment` carries an equal debit and credit (net zero on the
 * main balance — the sale it settles already debited that amount, and the
 * advance already credited it) purely so it can be labelled and subtracted
 * from this pool.
 */
export function availableAdvance(transactions: CustomerTransaction[]): number {
  return transactions.reduce((sum, t) => {
    if (t.type === 'advance') return sum + t.credit
    if (t.type === 'advance_adjustment') return sum - t.credit
    if (t.type === 'refund') return sum - t.debit
    return sum
  }, 0)
}

/** The §13 financial summary for one customer. */
export function customerTotals(
  transactions: CustomerTransaction[],
  customerSales: SaleSummary[],
): CustomerTotals {
  const totalSales = customerSales.reduce((s, sale) => s + sale.totalAmount, 0)
  const totalDue = customerSales.reduce((s, sale) => s + sale.amountDue, 0)

  const invoicePaid = customerSales.reduce((s, sale) => s + sale.amountPaid, 0)
  const onAccountPayments = transactions
    .filter((t) => t.type === 'payment' && !t.referenceSaleId)
    .reduce((s, t) => s + t.credit, 0)

  const totalAdvance = transactions
    .filter((t) => t.type === 'advance')
    .reduce((s, t) => s + t.credit, 0)

  const dates = [...transactions].map((t) => t.date).sort()

  return {
    totalSales,
    totalPaid: invoicePaid + onAccountPayments,
    totalDue,
    totalAdvance,
    availableAdvance: availableAdvance(transactions),
    balance: customerBalance(transactions),
    transactionCount: transactions.length,
    lastTransactionDate: dates.length > 0 ? dates[dates.length - 1]! : null,
  }
}

const REFERENCE_PREFIX: Record<Exclude<CustomerTxnType, 'sale'>, string> = {
  payment: 'PAY',
  advance: 'ADV',
  advance_adjustment: 'ADJ',
  refund: 'REF',
  opening_balance: 'OPN',
  other: 'OTH',
}

/** "ADV-001", "PAY-014" — sequential per type, never reused. */
export function nextReference(
  type: Exclude<CustomerTxnType, 'sale'>,
  transactions: CustomerTransaction[],
): string {
  const prefix = `${REFERENCE_PREFIX[type]}-`
  const max = transactions
    .map((t) => t.reference)
    .filter((ref) => ref.startsWith(prefix))
    .map((ref) => Number(ref.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0)

  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

// ---------------------------------------------------------------- builders

interface BaseParams {
  id: ID
  customerId: ID
  date: ISODate
  reference: string
  description?: string
  linkedAccountId?: ID
  createdAt: string
}

export function buildPayment(
  params: BaseParams & { amount: number; referenceSaleId?: ID; method?: string },
): CustomerTransaction {
  return {
    id: params.id,
    customerId: params.customerId,
    date: params.date,
    type: 'payment',
    reference: params.reference,
    description: params.description ?? `Payment received — ${params.reference}`,
    debit: 0,
    credit: params.amount,
    referenceSaleId: params.referenceSaleId,
    linkedAccountId: params.linkedAccountId,
    method: params.method,
    createdAt: params.createdAt,
  }
}

export function buildAdvance(params: BaseParams & { amount: number; method?: string }): CustomerTransaction {
  return {
    id: params.id,
    customerId: params.customerId,
    date: params.date,
    type: 'advance',
    reference: params.reference,
    description: params.description ?? `Advance received — ${params.reference}`,
    debit: 0,
    credit: params.amount,
    linkedAccountId: params.linkedAccountId,
    method: params.method,
    createdAt: params.createdAt,
  }
}

/** Applies part of a customer's available advance against one specific invoice. */
export function buildAdvanceAdjustment(
  params: BaseParams & { amount: number; referenceSaleId: ID },
): CustomerTransaction {
  return {
    id: params.id,
    customerId: params.customerId,
    date: params.date,
    type: 'advance_adjustment',
    reference: params.reference,
    description: params.description ?? `Advance applied — ${params.referenceSaleId}`,
    debit: params.amount,
    credit: params.amount,
    referenceSaleId: params.referenceSaleId,
    createdAt: params.createdAt,
  }
}

export function buildRefund(params: BaseParams & { amount: number }): CustomerTransaction {
  return {
    id: params.id,
    customerId: params.customerId,
    date: params.date,
    type: 'refund',
    reference: params.reference,
    description: params.description ?? `Refund — ${params.reference}`,
    debit: params.amount,
    credit: 0,
    linkedAccountId: params.linkedAccountId,
    createdAt: params.createdAt,
  }
}

/** Signed: positive = the customer already owed this before the ledger started. */
export function buildOpeningBalance(params: BaseParams & { amount: number }): CustomerTransaction {
  const amount = Number(params.amount) || 0

  return {
    id: params.id,
    customerId: params.customerId,
    date: params.date,
    type: 'opening_balance',
    reference: params.reference,
    description: params.description ?? 'Opening balance',
    debit: amount > 0 ? amount : 0,
    credit: amount < 0 ? -amount : 0,
    createdAt: params.createdAt,
  }
}

/**
 * Cash In — §12/§13 together.
 *
 * Money paid against a specific invoice (or, if none is chosen, applied
 * oldest-due-first across every invoice this customer actually owes on) is a
 * `payment`, one row per invoice it touches, so `SaleSummary.amountDue` — and
 * therefore `CustomerTotals.totalDue` — genuinely drops, not just the
 * customer's overall ledger balance. Anything left over once every due
 * invoice is settled is never a negative due: it becomes one `advance` row
 * instead, tracked in its own pool (§13), ready to be applied to a future
 * sale via `buildAdvanceAdjustment`.
 */
export function allocateCashIn(params: {
  customerId: ID
  date: ISODate
  amount: number
  /** This customer's due sales. If `targetSaleId` is omitted, every one of them is eligible, oldest first. */
  dueSales: SaleSummary[]
  /** Settle one specific invoice only; omit to apply on account, oldest-due-first. */
  targetSaleId?: ID
  paymentReference: string
  advanceReference: string
  method?: string
  linkedAccountId?: ID
  createdAt: string
  /** Generates each row's id — pass `uid` in the app, a deterministic counter in tests. */
  makeId: () => ID
}): CustomerTransaction[] {
  const rows: CustomerTransaction[] = []
  let remaining = Number(params.amount) || 0

  const targets = params.targetSaleId
    ? params.dueSales.filter((s) => s.id === params.targetSaleId)
    : [...params.dueSales].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1))

  for (const sale of targets) {
    if (remaining <= 0) break
    const applied = Math.min(remaining, sale.amountDue)
    if (applied <= 0) continue

    rows.push(
      buildPayment({
        id: params.makeId(),
        customerId: params.customerId,
        date: params.date,
        reference: params.paymentReference,
        description: `Payment received — ${params.paymentReference} (${sale.invoiceNo})`,
        amount: applied,
        referenceSaleId: sale.id,
        method: params.method,
        linkedAccountId: params.linkedAccountId,
        createdAt: params.createdAt,
      }),
    )
    remaining -= applied
  }

  if (remaining > 0) {
    rows.push(
      buildAdvance({
        id: params.makeId(),
        customerId: params.customerId,
        date: params.date,
        reference: params.advanceReference,
        description:
          rows.length > 0
            ? `Advance received — ${params.advanceReference} (overpayment beyond due)`
            : `Advance received — ${params.advanceReference}`,
        amount: remaining,
        method: params.method,
        linkedAccountId: params.linkedAccountId,
        createdAt: params.createdAt,
      }),
    )
  }

  return rows
}

// ---------------------------------------------------------------- reporting

export interface CustomerTxnFilters {
  customerId?: ID
  type?: CustomerTxnType
  from?: string
  to?: string
}

export function filterCustomerTransactions(
  transactions: CustomerTransaction[],
  filters: CustomerTxnFilters = {},
): CustomerTransaction[] {
  return transactions.filter((t) => {
    if (filters.customerId && t.customerId !== filters.customerId) return false
    if (filters.type && t.type !== filters.type) return false
    if (!isWithin(t.date, filters.from, filters.to)) return false
    return true
  })
}

export function customerNameOf(customers: Customer[], customerId: ID): string {
  return customers.find((c) => c.id === customerId)?.name ?? 'Unknown customer'
}

/** Customers with the highest outstanding due, for the dashboard. */
export function outstandingCustomers(
  customers: Customer[],
  salesByCustomer: (customerId: ID) => SaleSummary[],
): Array<{ customer: Customer; totalDue: number }> {
  return customers
    .map((customer) => ({
      customer,
      totalDue: salesByCustomer(customer.id).reduce((sum, sale) => sum + sale.amountDue, 0),
    }))
    .filter((row) => row.totalDue > 0)
    .sort((a, b) => b.totalDue - a.totalDue)
}
