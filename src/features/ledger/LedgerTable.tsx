import { useMemo, useState } from 'react'
import { ArrowRightLeft, Link2, Receipt, Search, Trash2, X } from 'lucide-react'
import type { Account, Category, LedgerRow, Transaction } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Money } from '@/components/Money'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { buildLedgerRows, idsToRemoveWith, summariseRows, type LedgerFilters } from '@/utils/ledger'
import { formatCurrency, formatDate } from '@/utils/format'
import { cn } from '@/utils/cn'
import { DEFAULT_TABLE_PAGE_SIZE as PAGE_SIZE } from '@/constants/table'

/**
 * The register.
 *
 * A running balance per account, filters that stack, and pagination once the
 * list outgrows a screen. Transfer legs are marked with a link icon so it is
 * obvious that two rows are one event — and deleting either removes both,
 * which the confirmation says in as many words.
 */
export function LedgerTable({
  transactions,
  accounts,
  categories,
  onDelete,
  toolbar,
}: {
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  onDelete: (ids: string[]) => void
  toolbar?: React.ReactNode
}) {
  const [filters, setFilters] = useState<LedgerFilters>({})
  const [page, setPage] = useState(1)
  const [pending, setPending] = useState<LedgerRow | null>(null)

  const rows = useMemo(
    () => buildLedgerRows(transactions, accounts, filters),
    [transactions, accounts, filters],
  )

  const totals = useMemo(() => summariseRows(rows), [rows])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visible = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const setFilter = <K extends keyof LedgerFilters>(key: K, value: LedgerFilters[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setPage(1)
  }

  const clear = () => {
    setFilters({})
    setPage(1)
  }

  const active = Object.values(filters).some(Boolean)

  // How many rows a deletion will actually take — a transfer takes two.
  const linkedCount = pending ? idsToRemoveWith(transactions, pending.id).length : 0

  if (transactions.length === 0) {
    return (
      <Section title="Register" noPadding>
        <EmptyState
          icon={Receipt}
          title="No transactions yet"
          description="Record a receipt, a payment or a transfer and it will appear here with a running balance for its account."
        />
      </Section>
    )
  }

  return (
    <Section
      title="Register"
      description={`${rows.length} of ${transactions.length} entries`}
      actions={toolbar}
      noPadding
    >
      {/* ------------------------------------------------ filters */}
      <div className="border-b border-border bg-secondary/30 p-3">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={filters.search ?? ''}
              onChange={(event) => setFilter('search', event.target.value)}
              placeholder="Search details, category or account"
              className="pl-8"
              aria-label="Search the register"
            />
          </div>

          <Select
            value={filters.accountId || 'all'}
            onValueChange={(v) => setFilter('accountId', v === 'all' ? '' : v)}
          >
            <SelectTrigger aria-label="Filter by account">
              <SelectValue placeholder="All accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.direction || 'all'}
            onValueChange={(v) => setFilter('direction', v === 'all' ? '' : (v as 'in' | 'out'))}
          >
            <SelectTrigger aria-label="Filter by direction">
              <SelectValue placeholder="In and out" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">In and out</SelectItem>
              <SelectItem value="in">Cash in only</SelectItem>
              <SelectItem value="out">Cash out only</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.category || 'all'}
            onValueChange={(v) => setFilter('category', v === 'all' ? '' : v)}
          >
            <SelectTrigger aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {[...new Set(categories.map((c) => c.name))].sort().map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5 sm:col-span-2 xl:col-span-1">
            <DatePicker
              value={filters.from ?? ''}
              onChange={(value) => setFilter('from', value)}
              aria-label="From date"
              className="text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <DatePicker
              value={filters.to ?? ''}
              onChange={(value) => setFilter('to', value)}
              aria-label="To date"
              className="text-xs"
            />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-3">
          <span className="text-2xs text-muted-foreground">
            In{' '}
            <span className="font-mono tabular font-semibold text-success-700">
              {formatCurrency(totals.totalIn)}
            </span>
          </span>
          <span className="text-2xs text-muted-foreground">
            Out{' '}
            <span className="font-mono tabular font-semibold text-primary-700">
              {formatCurrency(totals.totalOut)}
            </span>
          </span>
          <span className="text-2xs text-muted-foreground">
            Net{' '}
            <span
              className={cn(
                'font-mono tabular font-semibold',
                totals.net < 0 ? 'text-primary-700' : 'text-success-700',
              )}
            >
              {formatCurrency(totals.net)}
            </span>
          </span>

          {active && (
            <Button variant="ghost" size="sm" onClick={clear} className="ml-auto h-6 px-2 text-2xs">
              <X className="h-3 w-3" />
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ rows */}
      {visible.length === 0 ? (
        <EmptyState
          icon={Search}
          size="sm"
          title="Nothing matches these filters"
          description="Try widening the date range or clearing the account filter."
          action={
            <Button variant="outline" size="sm" onClick={clear}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead numeric>In</TableHead>
                <TableHead numeric>Out</TableHead>
                <TableHead numeric>Balance</TableHead>
                <TableHead className="w-10" aria-label="Actions" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatDate(row.date)}
                  </TableCell>

                  <TableCell className="max-w-[16rem]">
                    <span className="flex items-center gap-1.5">
                      {row.transferId && (
                        <Link2
                          className="h-3 w-3 shrink-0 text-brass-600"
                          aria-label="Part of a transfer"
                        />
                      )}
                      <span className="truncate">{row.details || '—'}</span>
                    </span>
                  </TableCell>

                  <TableCell className="whitespace-nowrap font-medium">{row.accountName}</TableCell>

                  <TableCell>
                    <Badge variant={row.transferId ? 'brass' : 'outline'} className="font-normal">
                      {row.transferId && <ArrowRightLeft className="h-2.5 w-2.5" aria-hidden />}
                      {row.category}
                    </Badge>
                  </TableCell>

                  <TableCell numeric>
                    {row.direction === 'in' ? (
                      <Money value={row.amount} size="sm" weight="medium" tone="positive" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell numeric>
                    {row.direction === 'out' ? (
                      <Money value={row.amount} size="sm" weight="medium" tone="negative" />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell numeric>
                    <Money
                      value={row.balance}
                      size="sm"
                      weight="semibold"
                      tone={row.balance < 0 ? 'negative' : 'neutral'}
                    />
                  </TableCell>

                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPending(row)}
                      aria-label={`Delete the entry from ${formatDate(row.date)}`}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pageCount > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
              <p className="text-2xs text-muted-foreground">
                Showing{' '}
                <span className="font-mono tabular">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rows.length)}
                </span>{' '}
                of <span className="font-mono tabular">{rows.length}</span>
              </p>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === 1}
                  onClick={() => setPage(safePage - 1)}
                >
                  Previous
                </Button>
                <span className="px-2 font-mono tabular text-xs text-muted-foreground">
                  {safePage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage === pageCount}
                  onClick={() => setPage(safePage + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={linkedCount > 1 ? 'Delete this transfer?' : 'Delete this entry?'}
        description={
          linkedCount > 1
            ? 'This is one leg of a transfer. Both legs will be deleted together — removing only one would leave money that had left an account without arriving anywhere.'
            : 'This cannot be undone. The running balance for the account will be recalculated.'
        }
        confirmLabel={linkedCount > 1 ? 'Delete both legs' : 'Delete entry'}
        onConfirm={() => {
          if (pending) onDelete(idsToRemoveWith(transactions, pending.id))
          setPending(null)
        }}
      >
        {pending && (
          <dl className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs">
            <SummaryRow label="Date" value={formatDate(pending.date)} />
            <SummaryRow label="Account" value={pending.accountName} />
            <SummaryRow label="Category" value={pending.category} />
            <SummaryRow
              label={pending.direction === 'in' ? 'Money in' : 'Money out'}
              value={formatCurrency(pending.amount)}
            />
            {pending.details && <SummaryRow label="Details" value={pending.details} />}
          </dl>
        )}
      </ConfirmDialog>
    </Section>
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
