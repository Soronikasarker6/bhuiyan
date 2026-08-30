import { useMemo, useState } from 'react'
import { Lock, LockOpen, Printer, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Money } from '@/components/Money'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { PageSkeleton } from '@/components/PageSkeleton'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { LedgerClosing } from '@/types'
import { accountBalances, monthMovement, totalBalances } from '@/utils/ledger'
import {
  MONTHS,
  formatCurrency,
  formatDateTime,
  lastDayOfMonth,
  makeMonthKey,
} from '@/utils/format'
import { now, uid } from '@/utils/id'
import { cn } from '@/utils/cn'

/**
 * Monthly closing — the cash & bank position.
 *
 * Available stock (Production vs. Sales) needs no month-end snapshot to stay
 * correct — it is always the live totals, so there is nothing to freeze
 * there. Cash and bank balances are different: a company wants to be able to
 * point at what every account held on a given date and have that figure never
 * move again, even if a back-dated entry is added later. **A closing is a
 * snapshot** — computed once, at the moment of closing, and stored.
 */
export default function ClosingPage() {
  const { loading } = useAppData()

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Monthly Closing"
        description="Freeze a month's cash & bank balances so a later back-dated entry cannot quietly change what was already reported."
      />

      <LedgerClosingPanel />
    </div>
  )
}

/**
 * Freezing the cash position.
 *
 * Records what every account held at month end, plus the month's income and
 * expenditure. Transfers are excluded from both movement figures — money
 * moving between our own accounts is neither income nor expense, and counting
 * it would double the month's apparent turnover.
 */
function LedgerClosingPanel() {
  const { data, update } = useAppData()
  const { print } = usePrint()

  const today = new Date()
  const [monthIndex, setMonthIndex] = useState(today.getMonth())
  const [year, setYear] = useState(today.getFullYear())
  const [confirming, setConfirming] = useState(false)
  const [reopening, setReopening] = useState<LedgerClosing | null>(null)

  const monthKey = makeMonthKey(year, monthIndex)
  const alreadyClosed = data.ledgerClosings.some((c) => c.monthKey === monthKey)

  // Balances as they stood at month end, not as they stand now.
  const preview = useMemo(() => {
    const cutoff = lastDayOfMonth(year, monthIndex)
    const balances = accountBalances(data.accounts, data.transactions, cutoff)
    const totals = totalBalances(balances)
    const movement = monthMovement(data.transactions, monthKey)

    return { balances, totals, movement }
  }, [data.accounts, data.transactions, year, monthIndex, monthKey])

  const hasActivity =
    preview.movement.monthIn > 0 || preview.movement.monthOut > 0

  const closeMonth = () => {
    if (alreadyClosed) return

    const record: LedgerClosing = {
      id: uid(),
      monthKey,
      month: MONTHS[monthIndex] ?? '',
      year,
      balances: preview.balances.map((balance) => ({
        accountId: balance.accountId,
        accountName: balance.accountName,
        kind: balance.kind,
        balance: balance.balance,
      })),
      cashTotal: preview.totals.cash,
      bankTotal: preview.totals.bank,
      grandTotal: preview.totals.combined,
      monthIn: preview.movement.monthIn,
      monthOut: preview.movement.monthOut,
      netMovement: preview.movement.net,
      closedAt: now(),
    }

    update('ledgerClosings', [record, ...data.ledgerClosings])
    setConfirming(false)

    toast.success(`${MONTHS[monthIndex]} ${year} closed`, {
      description: 'Cash and bank balances for the month end are now frozen.',
    })
  }

  const reopen = (closing: LedgerClosing) => {
    update(
      'ledgerClosings',
      data.ledgerClosings.filter((c) => c.id !== closing.id),
    )
    setReopening(null)

    toast.success(`${closing.month} ${closing.year} reopened`, {
      description: 'The snapshot has been removed.',
    })
  }

  const printClosing = (closing: LedgerClosing) => {
    print({
      title: `Cash & Bank Closing — ${closing.month} ${closing.year}`,
      subtitle: 'Frozen month-end snapshot',
      meta: [
        { label: 'Closed on', value: formatDateTime(closing.closedAt) },
        { label: 'Money in', value: formatCurrency(closing.monthIn) },
        { label: 'Money out', value: formatCurrency(closing.monthOut) },
        { label: 'Net movement', value: formatCurrency(closing.netMovement) },
      ],
      columns: [
        { key: 'account', label: 'Account' },
        { key: 'kind', label: 'Type' },
        { key: 'balance', label: 'Balance at month end', align: 'right' },
      ],
      rows: closing.balances.map((balance) => ({
        account: balance.accountName,
        kind: balance.kind === 'cash' ? 'Cash' : 'Bank',
        balance: formatCurrency(balance.balance),
      })),
      totals: { account: 'Total cash + bank', balance: formatCurrency(closing.grandTotal) },
      footnote:
        'Money in and money out exclude transfers between accounts, which are not income or expenditure.',
    })
  }

  const sorted = [...data.ledgerClosings].sort((a, b) => b.monthKey.localeCompare(a.monthKey))

  return (
    <div className="space-y-4">
      <Section
        title="Close a cash month"
        description="Freezes each account's balance at month end, plus the month's income and expenditure."
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[9rem]">
            <label
              htmlFor="ledger-closing-month"
              className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Month
            </label>
            <Select value={String(monthIndex)} onValueChange={(v) => setMonthIndex(Number(v))}>
              <SelectTrigger id="ledger-closing-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, index) => (
                  <SelectItem key={month} value={String(index)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-28">
            <label
              htmlFor="ledger-closing-year"
              className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Year
            </label>
            <Input
              id="ledger-closing-year"
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
            />
          </div>

          <Button
            onClick={() => setConfirming(true)}
            disabled={alreadyClosed || !hasActivity}
            variant={alreadyClosed ? 'secondary' : 'default'}
          >
            <Lock />
            {alreadyClosed ? 'Already closed' : 'Close this month'}
          </Button>
        </div>

        {alreadyClosed ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {MONTHS[monthIndex]} {year} is already closed. Reopen it below if the figures need to
            change.
          </p>
        ) : !hasActivity ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No cash movement was recorded in {MONTHS[monthIndex]} {year}, so there is nothing to
            freeze.
          </p>
        ) : (
          <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3">
            <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              What will be frozen
            </p>
            <BalanceTable
              balances={preview.balances}
              cashTotal={preview.totals.cash}
              bankTotal={preview.totals.bank}
              grandTotal={preview.totals.combined}
            />
            <dl className="mt-2.5 grid grid-cols-1 gap-1.5 border-t border-border pt-2.5 text-xs sm:grid-cols-3">
              <MovementRow label="Money in" value={preview.movement.monthIn} tone="positive" />
              <MovementRow label="Money out" value={preview.movement.monthOut} tone="negative" />
              <MovementRow label="Net movement" value={preview.movement.net} tone="auto" strong />
            </dl>
          </div>
        )}
      </Section>

      <Section
        title="Closed cash months"
        description={`${data.ledgerClosings.length} snapshot${data.ledgerClosings.length === 1 ? '' : 's'} on record`}
        noPadding
      >
        {sorted.length === 0 ? (
          <EmptyState
            icon={Wallet}
            size="sm"
            title="No cash months closed yet"
            description="Closing a month records what each account held at month end, so the figure can be checked against a bank statement later."
          />
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((closing) => (
              <article key={closing.id} className="p-4">
                <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 font-display text-base">
                      {closing.month} {closing.year}
                      <Badge variant="success">
                        <Lock className="h-2.5 w-2.5" aria-hidden />
                        Closed
                      </Badge>
                    </h3>
                    <p className="mt-0.5 text-2xs text-muted-foreground">
                      Frozen {formatDateTime(closing.closedAt)}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => printClosing(closing)}>
                      <Printer />
                      Print
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setReopening(closing)}
                    >
                      <LockOpen />
                      Reopen
                    </Button>
                  </div>
                </header>

                <BalanceTable
                  balances={closing.balances.map((b) => ({
                    accountId: b.accountId,
                    accountName: b.accountName,
                    kind: b.kind,
                    balance: b.balance,
                    totalIn: 0,
                    totalOut: 0,
                  }))}
                  cashTotal={closing.cashTotal}
                  bankTotal={closing.bankTotal}
                  grandTotal={closing.grandTotal}
                />

                <dl className="mt-2.5 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-3">
                  <MovementRow label="Money in" value={closing.monthIn} tone="positive" />
                  <MovementRow label="Money out" value={closing.monthOut} tone="negative" />
                  <MovementRow label="Net movement" value={closing.netMovement} tone="auto" strong />
                </dl>
              </article>
            ))}
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Close ${MONTHS[monthIndex]} ${year}?`}
        description="This creates a permanent snapshot of every account's balance at month end. Entries added later — including back-dated ones — will not change these figures."
        confirmLabel="Close month"
        variant="default"
        onConfirm={closeMonth}
      >
        <dl className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs">
          <div className="flex justify-between gap-4 py-0.5">
            <dt className="text-muted-foreground">Cash + bank at month end</dt>
            <dd>
              <Money value={preview.totals.combined} size="sm" weight="bold" />
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-0.5">
            <dt className="text-muted-foreground">Net movement in the month</dt>
            <dd>
              <Money value={preview.movement.net} size="sm" weight="medium" />
            </dd>
          </div>
        </dl>
      </ConfirmDialog>

      <ConfirmDialog
        open={reopening !== null}
        onOpenChange={(open) => !open && setReopening(null)}
        title={reopening ? `Reopen ${reopening.month} ${reopening.year}?` : ''}
        description="The saved snapshot will be deleted. Any report that referred to these frozen balances will show live figures instead until the month is closed again."
        confirmLabel="Reopen month"
        onConfirm={() => reopening && reopen(reopening)}
      />
    </div>
  )
}

function BalanceTable({
  balances,
  cashTotal,
  bankTotal,
  grandTotal,
}: {
  balances: Array<{ accountId: string; accountName: string; kind: 'cash' | 'bank'; balance: number }>
  cashTotal: number
  bankTotal: number
  grandTotal: number
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Type</TableHead>
            <TableHead numeric>Balance at month end</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {balances.map((balance) => (
            <TableRow key={balance.accountId}>
              <TableCell className="font-medium">{balance.accountName}</TableCell>
              <TableCell>
                <Badge variant={balance.kind === 'cash' ? 'primary' : 'brass'}>
                  {balance.kind === 'cash' ? 'Cash' : 'Bank'}
                </Badge>
              </TableCell>
              <TableCell numeric>
                <Money
                  value={balance.balance}
                  size="sm"
                  weight="medium"
                  tone={balance.balance < 0 ? 'negative' : 'neutral'}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>

        <TableFooter>
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={2} className="text-2xs uppercase tracking-wider">
              Cash {formatCurrency(cashTotal)} · Banks {formatCurrency(bankTotal)}
            </TableCell>
            <TableCell numeric>
              <Money value={grandTotal} size="sm" weight="bold" />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

function MovementRow({
  label,
  value,
  tone,
  strong,
}: {
  label: string
  value: number
  tone: 'positive' | 'negative' | 'auto'
  strong?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5',
        strong ? 'bg-secondary' : 'bg-transparent',
      )}
    >
      <dt className="text-muted-foreground">{label}</dt>
      <dd>
        <Money value={value} size="sm" weight={strong ? 'bold' : 'medium'} tone={tone} />
      </dd>
    </div>
  )
}
