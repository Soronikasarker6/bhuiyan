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
import { formatBags, formatCurrency, formatDate, formatNumber, formatTons, isWithin } from './format'

/**
 * The customer ledger — one running balance per customer, like a bank
 * statement.
 *
 *     Balance = running(Debit − Credit)
 *
 * exactly the formula `utils/ledger.ts` already uses for cash accounts,
 * reused here for receivables. A sale debits (Out, the customer owes more);
 * a payment credits (In, money came in) — both move the balance the same
 * way, and `type` is what lets the UI and reports tell them apart, not the
 * arithmetic.
 *
 * There is deliberately no per-invoice allocation and no separate advance
 * pool: `totalDue` and `availableAdvance` are just the two sides of the one
 * balance (`max(0, balance)` and `max(0, -balance)`). A customer who has
 * paid ahead is simply a negative balance, labelled Advance in the UI —
 * never a second thing that has to be kept in sync with the first.
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

/**
 * One line of a customer's bill-book statement (§5, invoice-book layout):
 *
 *     Date | Invoice | Customer | Details | Bag(Count, Per Kg) | Ton | Price | Total | Credit
 *
 * One row per *sale line item*, not per invoice — a customer buying two
 * products on one invoice gets two rows, both carrying that invoice's
 * number. Interleaved chronologically with the customer's payments, each
 * shown as its own row: `invoice` reads "CASH/BANK", `detail` reads
 * "PAYMENT", and only `credit` is filled in. `customerName` is always
 * resolved (even on a single-customer statement, where it repeats every
 * row) so CSV/PDF exports never lose whose statement a row belongs to.
 */
export interface CustomerLedgerStatementRow {
  id: ID
  date: ISODate
  invoice: string
  customerName: string
  detail: string
  bags?: number
  bagKg?: number
  weightTon?: number
  ratePerTon?: number
  amount?: number
  credit?: number
}

/** A customer's sales (exploded to one row per item) and payments, oldest first. */
export function buildCustomerLedgerStatementRows(
  sales: SaleSummary[],
  transactions: CustomerTransaction[],
  customerNameOfId: (customerId: ID) => string,
): CustomerLedgerStatementRow[] {
  const saleRows = sales.flatMap((sale) =>
    sale.items.map((item) => ({
      id: item.id,
      date: sale.date,
      createdAt: sale.createdAt,
      invoice: sale.invoiceNo,
      customerName: customerNameOfId(sale.customerId),
      detail: `${item.productName} ${item.meshSizeName}`.trim(),
      bags: item.bags,
      bagKg: item.bagKg,
      weightTon: item.weightTon,
      ratePerTon: item.ratePerTon,
      amount: item.amount,
    })),
  )

  const paymentRows = transactions
    .filter((t) => t.type === 'payment')
    .map((t) => ({
      id: t.id,
      date: t.date,
      createdAt: t.createdAt,
      invoice: 'CASH/BANK',
      customerName: customerNameOfId(t.customerId),
      detail: 'PAYMENT',
      credit: t.credit,
    }))

  return [...saleRows, ...paymentRows]
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
      return a.id < b.id ? -1 : 1
    })
    .map(({ createdAt: _createdAt, ...row }) => row)
}

/** The Total row's two figures — Total (sum of item amounts) and Credit (sum of payments). */
export function statementTotals(rows: CustomerLedgerStatementRow[]): { totalAmount: number; totalCredit: number } {
  return {
    totalAmount: rows.reduce((sum, r) => sum + (r.amount ?? 0), 0),
    totalCredit: rows.reduce((sum, r) => sum + (r.credit ?? 0), 0),
  }
}

/** "Total Due: ৳X" / "Total Advance: ৳X" — the one line a printed statement closes on. */
export function dueOrAdvanceLabel(totals: { totalDue: number; availableAdvance: number }): string {
  return totals.totalDue > 0
    ? `Total Due: ${formatCurrency(totals.totalDue)}`
    : `Total Advance: ${formatCurrency(totals.availableAdvance)}`
}

/** The flat column set the print sheet renders the statement with — shared so both pages agree. */
export const CUSTOMER_LEDGER_STATEMENT_COLUMNS: Array<{ key: string; label: string; align?: 'left' | 'right' }> = [
  { key: 'date', label: 'Date' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'customer', label: 'Customer' },
  { key: 'detail', label: 'Details' },
  { key: 'bags', label: 'Bag Count', align: 'right' },
  { key: 'bagKg', label: 'Per Kg', align: 'right' },
  { key: 'ton', label: 'Ton', align: 'right' },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'total', label: 'Total', align: 'right' },
  { key: 'credit', label: 'Credit', align: 'right' },
]

/** Rows formatted for the print sheet — plain, currency-formatted strings keyed to `CUSTOMER_LEDGER_STATEMENT_COLUMNS`. */
export function customerLedgerStatementPrintRows(rows: CustomerLedgerStatementRow[]): Array<Record<string, string>> {
  return rows.map((row) => ({
    date: formatDate(row.date),
    invoice: row.invoice,
    customer: row.customerName,
    detail: row.detail,
    bags: row.bags != null ? formatBags(row.bags) : '',
    bagKg: row.bagKg != null ? formatNumber(row.bagKg) : '',
    ton: row.weightTon != null ? formatTons(row.weightTon) : '',
    price: row.ratePerTon != null ? formatCurrency(row.ratePerTon) : '',
    total: row.amount != null ? formatCurrency(row.amount) : '',
    credit: row.credit != null ? formatCurrency(row.credit) : '',
  }))
}

/**
 * The statement as CSV, laid out like the paper bill-book it mirrors: a
 * "BAG" super-header over Count/Per Kg, "TOTAL" under Price with the two
 * summed columns beside it, and a Total Due/Advance line under Count/Ton —
 * the same three positions the printed register uses. Numeric cells are
 * plain numbers (no currency symbol, no digit grouping) so a spreadsheet
 * can sum them directly.
 */
export function customerLedgerStatementCsv(
  rows: CustomerLedgerStatementRow[],
  totals: { totalDue: number; availableAdvance: number },
): string {
  const { totalAmount, totalCredit } = statementTotals(rows)
  const isDue = totals.totalDue > 0
  const dueValue = isDue ? totals.totalDue : totals.availableAdvance

  const escape = (value: string | number | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const num = (value: number | undefined) => (value == null ? '' : Math.round(value * 1000) / 1000)
  const line = (cells: Array<string | number | undefined>) => cells.map(escape).join(',')

  const lines = [
    line(['', '', '', '', 'BAG', '', '', '', '', '']),
    line(['Date', 'Invoice', 'Customer', 'Details', 'Count', 'Per Kg', 'Ton', 'Price', 'Total', 'Credit']),
    ...rows.map((row) =>
      line([
        formatDate(row.date),
        row.invoice,
        row.customerName,
        row.detail,
        num(row.bags),
        num(row.bagKg),
        num(row.weightTon),
        num(row.ratePerTon),
        num(row.amount),
        num(row.credit),
      ]),
    ),
    line(['', '', '', '', '', '', '', 'TOTAL', num(totalAmount), num(totalCredit)]),
    line([]),
    line(['', '', '', '', isDue ? 'TOTAL DUE' : 'TOTAL ADVANCE', '', num(dueValue), '', '', '']),
  ]

  return '﻿' + lines.join('\r\n')
}

export function customerBalance(transactions: CustomerTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.debit - t.credit, 0)
}

/** A customer's financial summary — everything derived from the one running balance. */
export function customerTotals(transactions: CustomerTransaction[]): CustomerTotals {
  const totalSales = transactions.filter((t) => t.type === 'sale').reduce((s, t) => s + t.debit, 0)
  const totalPaid = transactions.filter((t) => t.type === 'payment').reduce((s, t) => s + t.credit, 0)
  const balance = customerBalance(transactions)
  const dates = transactions.map((t) => t.date).sort()

  return {
    totalSales,
    totalPaid,
    totalDue: Math.max(0, balance),
    availableAdvance: Math.max(0, -balance),
    balance,
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

/** "PAY-014" — sequential per type, never reused. */
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

/**
 * Cash In — a plain credit against the customer's overall balance. It is
 * never required to target one invoice: `referenceSaleId` is set only when
 * this is the payment collected at the moment of sale (`paidAtSale`,
 * via `buildSaleTransactions`), purely so that invoice's own history can
 * show what was paid then. A later Cash In simply reduces the running
 * balance — if that balance was already at or below zero, the customer's
 * Advance grows instead; nothing here has to know which case it is.
 */
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

/** Customers with the highest outstanding balance, for the dashboard. */
export function outstandingCustomers(
  customers: Customer[],
  transactionsOf: (customerId: ID) => CustomerTransaction[],
): Array<{ customer: Customer; totalDue: number }> {
  return customers
    .map((customer) => ({ customer, totalDue: Math.max(0, customerBalance(transactionsOf(customer.id))) }))
    .filter((row) => row.totalDue > 0)
    .sort((a, b) => b.totalDue - a.totalDue)
}
