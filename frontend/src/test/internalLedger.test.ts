import { describe, expect, it } from 'vitest'
import type { Customer, InternalLedgerRow, InternalLedgerSummary } from '@/types'
import { buildInternalLedgerPrintPayload, formatSignedBalance } from '@/utils/internalLedger'
import { PERMISSIONS, PERMISSION_GROUPS } from '@/constants/permissions'
import { navigation, navigationSegments } from '@/router/navigation'

/**
 * The private bookkeeping ledger's frontend surface.
 *
 * The arithmetic itself lives on the backend (and is covered there, against
 * the brief's own worked example) — the running balance has to be derived from
 * the complete series, which the client never holds. What these guard is the
 * part the client *does* own: how a signed balance reads, what reaches the
 * printed sheet, and that the menu entry is gated on the Admin-only
 * permission rather than on anything a Manager holds.
 */

const row = (over: Partial<InternalLedgerRow> = {}): InternalLedgerRow => ({
  id: '1',
  customerId: '7',
  customerName: 'ABC Trading',
  date: '2026-09-05',
  details: 'Goods supplied',
  reference: 'INV-102',
  debit: 50_000,
  credit: 0,
  balance: 50_000,
  entryNo: 'ILG-000001',
  ...over,
})

const summary = (over: Partial<InternalLedgerSummary> = {}): InternalLedgerSummary => ({
  openingBalance: 50_000,
  totalDebit: 120_000,
  totalCredit: 80_000,
  closingBalance: 90_000,
  entryCount: 2,
  periodEntryCount: 2,
  ...over,
})

const customer = { id: '7', name: 'ABC Trading' } as Customer

describe('formatSignedBalance', () => {
  it('reads a positive balance as Dr — the party owes us', () => {
    expect(formatSignedBalance(50_000)).toBe('৳ 50,000.00 Dr')
  })

  it('reads a negative balance as Cr, without a minus sign', () => {
    // A bare "-৳50,000" is ambiguous about which way it points; an accountant
    // reads Dr/Cr.
    expect(formatSignedBalance(-50_000)).toBe('৳ 50,000.00 Cr')
  })

  it('never prints a settled book as "Cr" because of a negative zero', () => {
    expect(formatSignedBalance(0)).toBe('৳ 0.00 Dr')
    expect(formatSignedBalance(-0)).toBe('৳ 0.00 Dr')
    // Rounding dust from decimal arithmetic must not flip the side either.
    expect(formatSignedBalance(-0.001)).toBe('৳ 0.00 Dr')
  })
})

describe('buildInternalLedgerPrintPayload', () => {
  const payload = () =>
    buildInternalLedgerPrintPayload({
      rows: [row({ id: '2', date: '2026-09-26', details: 'Payment received', reference: 'PAY-021', debit: 0, credit: 20_000, balance: 30_000 }), row()],
      summary: summary({ totalDebit: 50_000, totalCredit: 20_000, closingBalance: 30_000 }),
      customer,
      from: '2026-09-01',
      to: '2026-09-30',
      narrowed: false,
    })

  it('prints oldest first, so the running balance builds down the page', () => {
    const rows = payload().rows
    expect(rows.map((r) => r.date)).toEqual(['5 Sep 2026', '26 Sep 2026'])
    expect(rows.map((r) => r.balance)).toEqual(['৳ 50,000.00 Dr', '৳ 30,000.00 Dr'])
  })

  it('carries the period and both balances into the document header', () => {
    const meta = Object.fromEntries(payload().meta!.map((entry) => [entry.label, entry.value]))
    expect(meta.Party).toBe('ABC Trading')
    expect(meta['Opening balance']).toBe('৳ 50,000.00 Dr')
    expect(meta['Closing balance']).toBe('৳ 30,000.00 Dr')
    expect(meta.Period).toBe('1 Sep 2026 → 30 Sep 2026')
  })

  it('drops the Party column when the sheet is already one party’s ledger', () => {
    expect(payload().columns.map((c) => c.key)).not.toContain('customer')
  })

  it('keeps the Party column on an all-customers sheet', () => {
    const all = buildInternalLedgerPrintPayload({
      rows: [row()],
      summary: summary(),
      customer: null,
      narrowed: false,
    })
    expect(all.columns.map((c) => c.key)).toContain('customer')
    expect(all.meta!.find((m) => m.label === 'Party')?.value).toBe('All customers')
  })

  it('says so on the sheet when a type or search filter is hiding rows the totals still count', () => {
    const narrowed = buildInternalLedgerPrintPayload({
      rows: [row()],
      summary: summary(),
      customer,
      type: 'debit',
      narrowed: true,
    })
    expect(narrowed.footnote).toContain('narrowed further')
    expect(narrowed.meta!.find((m) => m.label === 'Showing')?.value).toBe('Debit entries only')
  })

  it('states on every sheet that this book is separate from the operational one', () => {
    expect(payload().footnote).toContain('does not affect customer dues')
  })
})

describe('Customer Ledger (Private) navigation', () => {
  const item = navigation.find((nav) => nav.path === '/customers/internal-ledger')

  it('sits in the Customers section, beside the operational ledger', () => {
    expect(item).toBeDefined()

    const customers = navigationSegments.find((s) => s.type === 'group' && s.name === 'Customers')
    const labels = customers && customers.type === 'group' ? customers.items.map((i) => i.label) : []

    expect(labels).toEqual(['Customers', 'Customer Ledger', 'Customer Ledger (Private)', 'Cash In'])
  })

  it('is gated on the Admin-only permission, never on one a Manager holds', () => {
    expect(item?.permission).toBe(PERMISSIONS.CUSTOMER_INTERNAL_LEDGER_VIEW)
    expect(Array.isArray(item?.permission)).toBe(false)
    // The operational ledger's own permission must not be what opens this.
    expect(item?.permission).not.toBe(PERMISSIONS.CUSTOMER_LEDGER_VIEW)
  })

  it('leaves the operational Customer Ledger exactly as it was', () => {
    const operational = navigation.find((nav) => nav.path === '/customer-ledger')
    expect(operational?.label).toBe('Customer Ledger')
    expect(operational?.permission).toBe(PERMISSIONS.CUSTOMER_LEDGER_VIEW)
  })

  it('is the only nav item asking for the private-ledger permission', () => {
    const asking = navigation.filter((nav) =>
      (Array.isArray(nav.permission) ? nav.permission : [nav.permission]).includes(
        PERMISSIONS.CUSTOMER_INTERNAL_LEDGER_VIEW,
      ),
    )
    expect(asking.map((n) => n.path)).toEqual(['/customers/internal-ledger'])
  })

  it('offers the permission in the role editor, in a group of its own', () => {
    const group = PERMISSION_GROUPS.find((g) => g.label === 'Customer Ledger (Private)')
    expect(group?.permissions).toEqual([PERMISSIONS.CUSTOMER_INTERNAL_LEDGER_VIEW])
  })
})
