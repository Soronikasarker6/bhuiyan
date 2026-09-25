import type { Customer, InternalLedgerRow, InternalLedgerSummary } from '@/types'
import type { PrintPayload } from '@/features/reports/PrintSheet'
import { formatCurrencyExact, formatDate } from '@/utils/format'

/**
 * Presentation helpers for the owner's private bookkeeping ledger.
 *
 * Kept out of the page so the two things worth being sure about — how a signed
 * balance reads, and what ends up on the printed sheet — can be tested on
 * their own rather than only by looking at a screen.
 *
 * Convention throughout, matching the receivables ledger this system already
 * has: a positive balance means the party owes us (Dr); negative means they
 * are ahead (Cr). The sign is never shown as a minus — an accountant reads
 * Dr/Cr, and a bare "-৳50,000" is ambiguous about which way it points.
 */

export function formatSignedBalance(value: number): string {
  // -0 is a real possibility after arithmetic and would print as "৳0.00 Cr".
  const amount = Math.abs(value) < 0.005 ? 0 : value

  return `${formatCurrencyExact(Math.abs(amount))} ${amount < 0 ? 'Cr' : 'Dr'}`
}

export interface InternalLedgerPrintContext {
  rows: InternalLedgerRow[]
  summary: InternalLedgerSummary
  customer: Customer | null
  from?: string
  to?: string
  type?: 'debit' | 'credit'
  search?: string
  narrowed: boolean
}

/**
 * The private ledger as a printable document — the same payload feeds the PDF
 * (via the shared `PrintSheet`, so it carries the company letterhead) and the
 * CSV, so the two can never drift apart.
 *
 * Rows print oldest-first, the opposite of the screen: a running balance only
 * reads correctly if it builds down the page.
 */
export function buildInternalLedgerPrintPayload(context: InternalLedgerPrintContext): PrintPayload {
  const { rows, summary, customer, from, to, type, search, narrowed } = context

  const meta: Array<{ label: string; value: string }> = [
    { label: 'Party', value: customer?.name ?? 'All customers' },
    {
      label: 'Period',
      value: from || to ? `${from ? formatDate(from) : 'the beginning'} → ${to ? formatDate(to) : 'today'}` : 'All dates',
    },
    { label: 'Opening balance', value: formatSignedBalance(summary.openingBalance) },
    { label: 'Total debit', value: formatCurrencyExact(summary.totalDebit) },
    { label: 'Total credit', value: formatCurrencyExact(summary.totalCredit) },
    { label: 'Closing balance', value: formatSignedBalance(summary.closingBalance) },
  ]

  if (type) meta.push({ label: 'Showing', value: type === 'debit' ? 'Debit entries only' : 'Credit entries only' })
  if (search) meta.push({ label: 'Search', value: search })

  return {
    title: 'Customer Ledger (Private)',
    subtitle: `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}${customer ? ` · ${customer.name}` : ''}`,
    meta,
    columns: [
      { key: 'date', label: 'Date' },
      ...(customer ? [] : [{ key: 'customer', label: 'Party' }]),
      { key: 'details', label: 'Details' },
      { key: 'reference', label: 'Reference' },
      { key: 'debit', label: 'Debit', align: 'right' as const },
      { key: 'credit', label: 'Credit', align: 'right' as const },
      { key: 'balance', label: 'Balance', align: 'right' as const },
    ],
    rows: [...rows].reverse().map((row) => ({
      date: formatDate(row.date),
      customer: row.customerName ?? '—',
      details: row.details,
      reference: row.reference || '—',
      debit: row.debit > 0 ? formatCurrencyExact(row.debit) : '',
      credit: row.credit > 0 ? formatCurrencyExact(row.credit) : '',
      balance: formatSignedBalance(row.balance),
    })),
    totals: {
      date: 'Total',
      debit: formatCurrencyExact(summary.totalDebit),
      credit: formatCurrencyExact(summary.totalCredit),
      balance: formatSignedBalance(summary.closingBalance),
    },
    footnote: narrowed
      ? 'Private bookkeeping record. Opening and closing balances cover the whole period; the listed entries are narrowed further by the type or search filter shown above.'
      : 'Private bookkeeping record. The opening balance carries forward everything recorded before this period. This ledger is separate from the operational customer ledger and does not affect customer dues, cash or bank balances.',
  }
}
