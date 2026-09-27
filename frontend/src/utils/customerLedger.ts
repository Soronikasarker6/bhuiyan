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

/** Milliseconds, or 0 for a blank/unparseable stamp — which then falls through to the id tiebreak. */
function instantOf(value: string): number {
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? 0 : ms
}

/**
 * Oldest first: by date, then by when the row was written, then by id.
 *
 * `createdAt` is compared as an instant rather than as text. The same moment
 * has more than one spelling — `…T00:00:00Z` and `…T00:00:00.000Z` are the
 * same time, but the second sorts *before* the first as a string, because
 * `.` is below `Z`. That put a sale's own paid-at-sale credit ahead of the
 * debit it settles, which a running balance survives (addition does not care
 * about order) but credit allocation does not: a payment arriving before its
 * invoice looks like advance the customer was already holding.
 */
function chronological(a: CustomerTransaction, b: CustomerTransaction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1

  const at = instantOf(a.createdAt)
  const bt = instantOf(b.createdAt)
  if (at !== bt) return at < bt ? -1 : 1

  return a.id < b.id ? -1 : 1
}

export function transactionsForCustomer(
  transactions: CustomerTransaction[],
  customerId: ID,
): CustomerTransaction[] {
  return transactions.filter((t) => t.customerId === customerId)
}

/**
 * Each transaction's running balance *for its own customer*, keyed by id.
 *
 * The accumulation is per customer, never across the whole list. A balance is
 * a fact about one account: running one total through a list that holds
 * several customers produces a figure that belongs to nobody, and every
 * screen that lists transactions company-wide — Cash In, the customer ledger
 * with no customer selected, the ledger report — passes exactly such a list.
 */
export function balanceByTransaction(transactions: CustomerTransaction[]): Map<ID, number> {
  const byCustomer = new Map<ID, CustomerTransaction[]>()
  for (const t of transactions) {
    const list = byCustomer.get(t.customerId)
    if (list) list.push(t)
    else byCustomer.set(t.customerId, [t])
  }

  const balances = new Map<ID, number>()
  for (const list of byCustomer.values()) {
    let running = 0
    for (const t of list.sort(chronological)) {
      running += t.debit - t.credit
      balances.set(t.id, running)
    }
  }

  return balances
}

/**
 * Each customer's balance immediately *before* `from` — the position a
 * date-filtered statement has to open on.
 *
 * Without `from` there is no prior period and every opening balance is zero.
 * Comparison is a plain string compare, which is exact for the `YYYY-MM-DD`
 * dates used throughout, and strict: a transaction dated `from` itself falls
 * inside the range, not before it.
 */
export function openingBalances(
  transactions: CustomerTransaction[],
  from?: string,
): Map<ID, number> {
  const opening = new Map<ID, number>()
  if (!from) return opening

  for (const t of transactions) {
    if (t.date >= from) continue
    opening.set(t.customerId, (opening.get(t.customerId) ?? 0) + t.debit - t.credit)
  }

  return opening
}

/**
 * The opening balance for one customer, or — with `customerId` omitted — the
 * total across every customer, which is the company's receivable position at
 * the moment the range starts.
 */
export function openingBalanceTotal(
  transactions: CustomerTransaction[],
  from?: string,
  customerId?: ID,
): number {
  const opening = openingBalances(transactions, from)
  if (customerId) return opening.get(customerId) ?? 0
  return [...opening.values()].reduce((sum, value) => sum + value, 0)
}

/**
 * Transactions newest first, each carrying its customer's running balance.
 *
 * `ledger` is what the balance is computed from, and defaults to the rows
 * being rendered. Every filtered view must pass the *complete* ledger here,
 * because a filter chooses what is displayed — it does not rewrite history.
 * Narrow the balance to the same rows and two things break: Cash In lists
 * payments only, so the balance never sees a sale and can only descend; and
 * a date range restarts every customer from zero, dropping the balance they
 * carried into the range. Passing the whole ledger makes each row's balance
 * absolute — opening position included — no matter how the view is filtered.
 */
export function buildCustomerLedgerRows(
  transactions: CustomerTransaction[],
  ledger: CustomerTransaction[] = transactions,
): CustomerLedgerRow[] {
  const balances = balanceByTransaction(ledger)

  return [...transactions]
    .sort(chronological)
    .map((t) => ({ ...t, balance: balances.get(t.id) ?? 0 }))
    .reverse()
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

// ------------------------------------------------- credit allocation

/** Half a paisa — below this, a difference is float noise, not money. */
const EPSILON = 0.005

export interface CustomerSettlement {
  /** How much of each sale has been settled, by sale id. */
  paidBySale: Map<ID, number>
  /**
   * How much of each sale was settled by credit the customer *already held*
   * when the invoice was raised — what makes a covered invoice read "Advance"
   * rather than "Paid".
   */
  advanceBySale: Map<ID, number>
  /** Credit not yet applied to anything: the customer's advance. */
  unappliedCredit: number
  /** Signed, and always equal to `customerBalance()` — positive is Due. */
  balance: number
}

/**
 * Which credits have settled which invoices, for one customer.
 *
 * This exists because payments here are *customer-level*, not invoice-level.
 * `referenceSaleId` is set on exactly one kind of credit — the amount
 * collected at the moment of sale — and on nothing else. A later Cash In is
 * a plain credit against the account, which is why asking "what has been paid
 * against this invoice?" by looking only at `referenceSaleId` reports every
 * ordinary payment as if it had never happened, and leaves a customer who has
 * paid in full showing a page of Due invoices.
 *
 * The rule, walking the account in date order:
 *
 *   1. A credit settles its own invoice first, when it names one.
 *   2. Anything left over settles the oldest outstanding charge, then the
 *      next — FIFO, the way a running account is normally applied.
 *   3. Credit with nothing left to settle stays in hand as advance, and
 *      settles the next charge raised — which is how an existing advance
 *      covers a new sale without anyone allocating it by hand.
 *
 * Charges are not only invoices: an opening balance the customer owed, or a
 * refund raised against them, are debits too and take their turn in the same
 * queue. Only sales are reported back per-id, because only sales have a
 * status to show.
 *
 * The one invariant worth stating: `balance` here is the same number
 * `customerBalance()` returns for the same rows. This function decides how
 * the money is *attributed*; it never changes how much there is.
 */
export function allocateCustomerCredit(transactions: CustomerTransaction[]): CustomerSettlement {
  const rows = [...transactions].sort(chronological)

  const paidBySale = new Map<ID, number>()
  const advanceBySale = new Map<ID, number>()

  const saleIdOf = (t: CustomerTransaction): ID | undefined =>
    t.type === 'sale' ? (t.referenceSaleId ?? t.id) : undefined

  const add = (map: Map<ID, number>, saleId: ID, amount: number) =>
    map.set(saleId, (map.get(saleId) ?? 0) + amount)

  // --- Pass 1: earmarked credit.
  //
  // A credit naming an invoice was collected for that invoice, so it settles
  // it regardless of where the two rows land relative to each other. Order
  // matters for the pool below, but it must not decide whether a payment
  // counts against the invoice it was literally recorded against — an
  // advance-adjustment carries its debit and credit on one row, and a
  // paid-at-sale credit shares its invoice's timestamp to the millisecond.
  const saleTotal = new Map<ID, number>()
  for (const t of rows) {
    const saleId = saleIdOf(t)
    if (saleId) saleTotal.set(saleId, (saleTotal.get(saleId) ?? 0) + t.debit)
  }

  const earmarked = new Map<ID, number>()
  /** What is left of each credit row once its own invoice has taken its share. */
  const freeCredit = new Map<ID, number>()

  for (const t of rows) {
    if (t.credit <= 0) continue

    const target = t.referenceSaleId
    if (target && saleTotal.has(target)) {
      const room = (saleTotal.get(target) ?? 0) - (earmarked.get(target) ?? 0)
      const applied = Math.max(0, Math.min(t.credit, room))
      if (applied > 0) {
        add(earmarked, target, applied)
        add(paidBySale, target, applied)
      }
      freeCredit.set(t.id, t.credit - applied)
    } else {
      freeCredit.set(t.id, t.credit)
    }
  }

  // --- Pass 2: everything else, in date order.
  //
  // Whatever is still owing queues up oldest-first, and unearmarked credit
  // drains into it. Credit already in hand when a charge is raised settles it
  // on the spot — which is what makes an existing advance cover a new sale
  // without anyone allocating it by hand, and what `advanceBySale` records.
  const open: Array<{ saleId?: ID; outstanding: number }> = []
  let pool = 0

  for (const t of rows) {
    if (t.debit > 0) {
      const saleId = saleIdOf(t)
      let outstanding = t.debit - (saleId ? (earmarked.get(saleId) ?? 0) : 0)

      if (outstanding > EPSILON) {
        const fromPool = Math.min(pool, outstanding)
        if (fromPool > 0) {
          pool -= fromPool
          outstanding -= fromPool
          if (saleId) {
            add(paidBySale, saleId, fromPool)
            add(advanceBySale, saleId, fromPool)
          }
        }
        if (outstanding > EPSILON) open.push({ saleId, outstanding })
      }
    }

    let remaining = freeCredit.get(t.id) ?? 0
    if (remaining <= EPSILON) continue

    for (const charge of open) {
      if (remaining <= EPSILON) break
      const applied = Math.min(remaining, charge.outstanding)
      charge.outstanding -= applied
      remaining -= applied
      if (charge.saleId) add(paidBySale, charge.saleId, applied)
    }

    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i]!.outstanding <= EPSILON) open.splice(i, 1)
    }

    pool += remaining
  }

  return {
    paidBySale,
    advanceBySale,
    unappliedCredit: pool,
    balance: open.reduce((sum, c) => sum + c.outstanding, 0) - pool,
  }
}

/**
 * Every customer's settlement in one pass, keyed by customer id — so a screen
 * listing sales across customers resolves each invoice's position without
 * re-walking the whole ledger per row.
 */
export function allocateCreditByCustomer(
  transactions: CustomerTransaction[],
): Map<ID, CustomerSettlement> {
  const byCustomer = new Map<ID, CustomerTransaction[]>()
  for (const t of transactions) {
    const list = byCustomer.get(t.customerId)
    if (list) list.push(t)
    else byCustomer.set(t.customerId, [t])
  }

  const settlements = new Map<ID, CustomerSettlement>()
  for (const [customerId, list] of byCustomer) {
    settlements.set(customerId, allocateCustomerCredit(list))
  }

  return settlements
}

/**
 * Where a customer's account stands, in the three words the UI uses.
 * Positive is Due, negative is Advance, zero is settled — the same signed
 * balance every other figure here is derived from.
 */
export function balanceStatusOf(balance: number): 'due' | 'no_due' | 'advance' {
  if (balance > EPSILON) return 'due'
  if (balance < -EPSILON) return 'advance'
  return 'no_due'
}

export const BALANCE_STATUS_LABEL: Record<'due' | 'no_due' | 'advance', string> = {
  due: 'Due',
  no_due: 'No due',
  advance: 'Advance',
}

/** The tag that follows an advance amount. Nothing follows a due — a due is the default reading. */
export const ADVANCE_TAG = '(ADV)'

/**
 * The one way a customer balance is written anywhere in this application.
 *
 *     ৳ 30,000          owed to us
 *     ৳ 0               settled
 *     ৳ 10,000 (ADV)    paid ahead
 *
 * Never `−৳ 10,000`. A minus sign in a money column is read as "less money"
 * far more readily than as "the other party owes it", and on a printed
 * statement it is easy to miss entirely. The amount is shown as a magnitude
 * and the direction is named.
 *
 * This is presentation only. The stored balance stays signed — positive Due,
 * negative Advance — and every sort, filter and sum still works on that
 * signed number; see `balanceStatusOf`, which is what decides the tag.
 */
export function formatCustomerBalance(balance: number): string {
  const status = balanceStatusOf(balance)
  const amount = formatCurrency(status === 'no_due' ? 0 : Math.abs(balance))

  return status === 'advance' ? `${amount} ${ADVANCE_TAG}` : amount
}

/** `'(ADV)'` for an advance, `''` otherwise — for callers that render the amount themselves. */
export function customerBalanceTag(balance: number): string {
  return balanceStatusOf(balance) === 'advance' ? ADVANCE_TAG : ''
}

/** The magnitude to print, with a settled balance normalised so `-0` never reaches the page. */
export function customerBalanceMagnitude(balance: number): number {
  return balanceStatusOf(balance) === 'no_due' ? 0 : Math.abs(balance)
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

/**
 * "Priya Sharma — Dhaka Ceramics Ltd", for anywhere a customer picker lists
 * more than one customer at a time — several contacts can share a name, and
 * the company is what actually tells them apart at a glance. Falls back to
 * the plain name when no company is on file, which is the common case.
 */
export function customerDisplayLabel(customer: Customer): string {
  return customer.company ? `${customer.name} — ${customer.company}` : customer.name
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
