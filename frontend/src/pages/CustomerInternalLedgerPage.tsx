import { useCallback, useEffect, useMemo, useState } from 'react'
import { BookLock, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ComboBox } from '@/components/ui/combobox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StoneLoader } from '@/components/ui/stone-loader'
import { ExportMenu } from '@/components/ExportMenu'
import { ReasonDialog } from '@/components/ReasonDialog'
import { InternalLedgerEntryDialog } from '@/features/customerInternalLedger/InternalLedgerEntryDialog'
import { OpeningBalanceDialog } from '@/features/customerInternalLedger/OpeningBalanceDialog'
import { usePrint, printPayloadToCsv } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import { usePageHeader } from '@/hooks/usePageHeader'
import { customerInternalLedgerService } from '@/services/api/customerInternalLedgerService'
import type {
  InternalLedgerEntryInput,
  InternalLedgerOpening,
  InternalLedgerResponse,
  InternalLedgerRow,
} from '@/types'
import { buildInternalLedgerPrintPayload, formatSignedBalance } from '@/utils/internalLedger'
import { downloadTextFile } from '@/utils/download'
import { cn } from '@/utils/cn'
import { formatCurrencyExact, formatDate, todayISO } from '@/utils/format'

const ALL = '__all__'

const EMPTY: InternalLedgerResponse = {
  rows: [],
  summary: {
    openingBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    closingBalance: 0,
    entryCount: 0,
    periodEntryCount: 0,
  },
  narrowed: false,
  opening: null,
}

/**
 * Customers → Customer Ledger (Private). Admin only.
 *
 * The owner's own bookkeeping, kept as a traditional ledger: date, party,
 * details, reference, debit, credit, running balance. Deliberately a separate
 * screen from the operational Customer Ledger at `/customer-ledger` — that one
 * is built from sales and payments and drives Customer Due; nothing here
 * touches any of it.
 *
 * The route is guarded and the menu item is hidden without the permission, but
 * neither is what enforces access: every endpoint behind this screen refuses a
 * non-admin server-side.
 *
 * Rows come from the ledger's own Admin-only endpoint rather than `/app-data`,
 * so a Manager's browser never receives one. The customers list is the only
 * thing read from shared data, and only to name the parties in the picker.
 */
export default function CustomerInternalLedgerPage() {
  const { data, loading: customersLoading } = useAppData()
  const { print } = usePrint()

  const [result, setResult] = useState<InternalLedgerResponse>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [customerId, setCustomerId] = useState('')
  const [type, setType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')

  const [entryDialogOpen, setEntryDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InternalLedgerRow | null>(null)
  const [pendingDelete, setPendingDelete] = useState<InternalLedgerRow | null>(null)
  const [openingDialogOpen, setOpeningDialogOpen] = useState(false)

  // Server-side search, so each keystroke would otherwise be a request.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const load = useCallback(async () => {
    setBusy(true)
    try {
      setResult(
        await customerInternalLedgerService.list({
          customerId: customerId || undefined,
          from: from || undefined,
          to: to || undefined,
          type: (type as 'debit' | 'credit') || undefined,
          search: debouncedSearch || undefined,
        }),
      )
    } catch (error) {
      toast.error('Could not load the ledger', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
      setLoading(false)
    }
  }, [customerId, from, to, type, debouncedSearch])

  useEffect(() => {
    load()
  }, [load])

  const customers = data.customers
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  )

  const { rows, summary, narrowed } = result
  const active = Boolean(customerId || type || from || to || search)

  const clear = () => {
    setCustomerId('')
    setType('')
    setFrom('')
    setTo('')
    setSearch('')
  }

  // ---------------------------------------------------------------- actions
  //
  // Each one runs the whole round trip behind a busy state — request, save,
  // then a reload so the running balance and the summary are recomputed from
  // the server rather than patched locally. The dialogs own their own busy
  // indicator (their Save button awaits these), and the table shows the
  // loader while the reload runs.

  const saveEntry = async (values: InternalLedgerEntryInput) => {
    try {
      if (editing) {
        await customerInternalLedgerService.update(editing.id, values, editing.updatedAt)
      } else {
        await customerInternalLedgerService.create(values)
      }
      await load()
      toast.success(editing ? 'Entry updated' : 'Entry added', {
        description: `${formatCurrencyExact(values.debit || values.credit || 0)} · ${values.details}`,
      })
      setEntryDialogOpen(false)
      setEditing(null)
    } catch (error) {
      toast.error(editing ? 'Could not save the change' : 'Could not add the entry', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  const confirmDelete = async (reason?: string) => {
    if (!pendingDelete) return
    try {
      await customerInternalLedgerService.remove(pendingDelete.id, reason)
      await load()
      toast.success('Entry deleted', { description: 'Balances have been recalculated.' })
    } catch (error) {
      toast.error('Could not delete the entry', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setPendingDelete(null)
    }
  }

  const saveOpening = async (values: { openingBalance: number; asOf?: string; notes?: string }) => {
    if (!selectedCustomer) return
    try {
      await customerInternalLedgerService.setOpening(selectedCustomer.id, values)
      await load()
      toast.success('Opening balance saved', {
        description: `${selectedCustomer.name} opens at ${formatSignedBalance(values.openingBalance)}.`,
      })
      setOpeningDialogOpen(false)
    } catch (error) {
      toast.error('Could not save the opening balance', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  // ---------------------------------------------------------------- printing

  const printContext = useMemo(
    () => ({
      rows,
      summary,
      customer: selectedCustomer,
      from: from || undefined,
      to: to || undefined,
      type: (type as 'debit' | 'credit') || undefined,
      search: debouncedSearch || undefined,
      narrowed,
    }),
    [rows, summary, selectedCustomer, from, to, type, debouncedSearch, narrowed],
  )

  const exportPdf = useCallback(
    () => print(buildInternalLedgerPrintPayload(printContext)),
    [print, printContext],
  )

  const exportCsv = useCallback(() => {
    downloadTextFile(
      `customer-ledger-private-${todayISO()}.csv`,
      printPayloadToCsv(buildInternalLedgerPrintPayload(printContext)),
      'text/csv;charset=utf-8;',
    )
    toast.success('Ledger exported', { description: 'Saved as CSV.' })
  }, [printContext])

  usePageHeader({
    title: 'Customer Ledger (Private)',
    description:
      'Your own bookkeeping record, party by party. Separate from the operational customer ledger — nothing entered here changes a customer’s due, advance, cash or bank balances.',
    // Add Entry lives on the ledger's own header, next to the book it writes
    // into, rather than up here — see the Section below. Export stays: it acts
    // on the whole page, filters included.
    actions: <ExportMenu onCsv={exportCsv} onPdf={exportPdf} disabled={rows.length === 0} />,
  })

  if (loading || customersLoading) return <PageSkeleton />

  if (customers.length === 0) {
    return (
      <Section>
        <EmptyState
          icon={BookLock}
          size="lg"
          title="No customers set up"
          description="This ledger records entries against your existing customers, so add one first."
        />
      </Section>
    )
  }

  return (
    <div>
      <Section
        title={selectedCustomer ? `${selectedCustomer.name} — ledger` : 'All parties'}
        description={`${summary.entryCount} ${summary.entryCount === 1 ? 'entry' : 'entries'}${active ? ' · filtered' : ''}`}
        actions={
          <>
            {selectedCustomer && (
              <Button variant="outline" size="sm" onClick={() => setOpeningDialogOpen(true)}>
                {result.opening ? 'Edit opening balance' : 'Set opening balance'}
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setEntryDialogOpen(true)
              }}
              disabled={customers.length === 0}
            >
              <Plus />
              Add Entry
            </Button>
          </>
        }
        noPadding
      >
        {/* ------------------------------------------------ filters */}
        <div className="border-b border-border bg-secondary/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
            <div className="xl:col-span-2">
              <ComboBox
                value={customerId}
                options={[
                  ...customers.map((customer) => ({
                    value: customer.id,
                    label: customer.name,
                    description: customer.company || customer.phone || undefined,
                  })),
                ]}
                onChange={setCustomerId}
                placeholder="All customers"
                aria-label="Filter by customer"
              />
            </div>

            <Select value={type || ALL} onValueChange={(v) => setType(v === ALL ? '' : v)}>
              <SelectTrigger aria-label="Filter by type">
                <SelectValue placeholder="All entries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All entries</SelectItem>
                <SelectItem value="debit">Debit only</SelectItem>
                <SelectItem value="credit">Credit only</SelectItem>
              </SelectContent>
            </Select>

            <div className="sm:col-span-2 xl:col-span-2">
              <DateRangePicker
                from={from}
                to={to}
                onChange={(nextFrom, nextTo) => {
                  setFrom(nextFrom)
                  setTo(nextTo)
                }}
                aria-label="Date range"
                className="text-xs"
              />
            </div>

            <div className="relative xl:col-span-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search details or reference"
                className="pl-8"
                aria-label="Search the ledger"
              />
            </div>
          </div>

          {(active || busy) && (
            <div className="mt-2.5 flex items-center gap-3">
              {busy && (
                <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <StoneLoader />
                  Loading
                </span>
              )}
              {active && (
                <Button variant="ghost" size="sm" onClick={clear} className="ml-auto h-6 px-2 text-2xs">
                  <X className="h-3 w-3" />
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {/* The summary describes the party and the period; Type and Search
              narrow only what is listed. Said out loud so the totals at the
              foot of the table never look wrong against a shorter list. */}
          {narrowed && (
            <p className="mt-2 text-2xs text-muted-foreground">
              Showing {summary.entryCount} of {summary.periodEntryCount} entries in this period. The totals at the
              foot of the table cover the whole period, not just the rows listed.
            </p>
          )}
        </div>

        {/* ------------------------------------------------ rows */}
        {/* A party with an opening balance but nothing in this period still
            has a position worth showing — the table renders with its footer
            alone rather than claiming the book is empty. */}
        {rows.length === 0 && summary.openingBalance === 0 ? (
          <EmptyState
            icon={active ? Search : BookLock}
            size={active ? 'sm' : 'lg'}
            title={active ? 'Nothing matches these filters' : 'This book is empty'}
            description={
              active
                ? 'Try widening the date range, or clearing the party and type filters.'
                : 'Add your first entry — a debit for goods supplied, a credit for money received.'
            }
            action={
              active ? (
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null)
                    setEntryDialogOpen(true)
                  }}
                >
                  <Plus />
                  Add Entry
                </Button>
              )
            }
          />
        ) : (
          /* `min-w` against `Table`'s own scroll container: on a narrow
             screen the ledger scrolls sideways rather than letting the
             columns collapse into each other — a ledger you cannot line up
             is not a ledger (§23). */
          <Table className="min-w-[56rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {!selectedCustomer && <TableHead>Party</TableHead>}
                  <TableHead>Details</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead numeric>Debit</TableHead>
                  <TableHead numeric>Credit</TableHead>
                  <TableHead numeric>Balance</TableHead>
                  <TableHead className="w-20" aria-label="Actions" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(row.date)}
                    </TableCell>

                    {!selectedCustomer && (
                      <TableCell className="whitespace-nowrap font-medium">{row.customerName ?? '—'}</TableCell>
                    )}

                    <TableCell className="max-w-[18rem]">
                      <span className="block truncate">{row.details}</span>
                    </TableCell>

                    <TableCell className="whitespace-nowrap font-mono tabular text-xs text-muted-foreground">
                      {row.reference || '—'}
                    </TableCell>

                    <TableCell numeric>
                      {row.debit > 0 ? (
                        <Money exact value={row.debit} size="sm" weight="medium" tone="negative" className="text-destructive" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell numeric>
                      {row.credit > 0 ? (
                        <Money exact value={row.credit} size="sm" weight="medium" tone="positive" />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell numeric>
                      <span className="font-mono tabular text-xs font-semibold">
                        {formatSignedBalance(row.balance)}
                      </span>
                    </TableCell>

                    <TableCell>
                      <span className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditing(row)
                            setEntryDialogOpen(true)
                          }}
                          aria-label={`Edit the entry from ${formatDate(row.date)}`}
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setPendingDelete(row)}
                          aria-label={`Delete the entry from ${formatDate(row.date)}`}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>

              {/* The period's position, ruled off at the foot of the book the
                  way a paper ledger does it — opening carried in, the period's
                  two columns totalled, closing carried out. The same four
                  figures a summary panel would show, in the place an
                  accountant already looks for them. */}
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={selectedCustomer ? 3 : 4} className="text-muted-foreground">
                    Opening balance
                    <span className="ml-1.5 text-2xs">
                      {from ? '· carried into this period' : '· before any entry'}
                    </span>
                  </TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    —
                  </TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    —
                  </TableCell>
                  <TableCell numeric>
                    <span className="font-mono tabular text-xs font-semibold">
                      {formatSignedBalance(summary.openingBalance)}
                    </span>
                  </TableCell>
                  <TableCell />
                </TableRow>

                <TableRow>
                  <TableCell colSpan={selectedCustomer ? 3 : 4}>
                    Total
                    {narrowed && (
                      <span className="ml-1.5 text-2xs font-normal text-muted-foreground">
                        · whole period, including rows hidden by the filter
                      </span>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    <Money exact value={summary.totalDebit} size="sm" weight="semibold" tone="negative" className="text-destructive" />
                  </TableCell>
                  <TableCell numeric>
                    <Money exact value={summary.totalCredit} size="sm" weight="semibold" tone="positive" />
                  </TableCell>
                  <TableCell numeric>
                    <span
                      className={cn(
                        'font-mono tabular text-xs font-bold',
                        summary.closingBalance < 0 ? 'text-success-700' : 'text-foreground',
                      )}
                    >
                      {formatSignedBalance(summary.closingBalance)}
                    </span>
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
        )}
      </Section>

      <InternalLedgerEntryDialog
        open={entryDialogOpen}
        row={editing}
        customers={customers}
        defaultCustomerId={customerId || undefined}
        onOpenChange={(open) => {
          setEntryDialogOpen(open)
          if (!open) setEditing(null)
        }}
        onSubmit={saveEntry}
      />

      {selectedCustomer && (
        <OpeningBalanceDialog
          open={openingDialogOpen}
          customerName={selectedCustomer.name}
          opening={result.opening as InternalLedgerOpening | null}
          onOpenChange={setOpeningDialogOpen}
          onSubmit={saveOpening}
        />
      )}

      <ReasonDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this ledger entry?"
        description="The entry is removed from your private book and the running balances are recalculated. The original figures are kept in the audit history."
        confirmLabel="Delete entry"
        onConfirm={confirmDelete}
      >
        {pendingDelete && (
          <dl className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs">
            <SummaryRow label="Entry" value={pendingDelete.entryNo} />
            <SummaryRow label="Customer" value={pendingDelete.customerName ?? '—'} />
            <SummaryRow label="Date" value={formatDate(pendingDelete.date)} />
            <SummaryRow label="Details" value={pendingDelete.details} />
            {pendingDelete.reference && <SummaryRow label="Reference" value={pendingDelete.reference} />}
            <SummaryRow
              label={pendingDelete.debit > 0 ? 'Debit' : 'Credit'}
              value={formatCurrencyExact(pendingDelete.debit > 0 ? pendingDelete.debit : pendingDelete.credit)}
            />
          </dl>
        )}
      </ReasonDialog>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium">{value}</dd>
    </div>
  )
}
