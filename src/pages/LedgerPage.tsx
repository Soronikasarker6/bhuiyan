import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Landmark, Printer, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/PageSkeleton'
import { TransactionForm, type TransactionSubmit } from '@/features/ledger/TransactionForm'
import { LedgerTable } from '@/features/ledger/LedgerTable'
import { BalanceSummary } from '@/features/dashboard/BalanceSummary'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { Transaction } from '@/types'
import {
  accountBalances,
  buildLedgerRows,
  buildTransferLegs,
  summariseRows,
  totalBalances,
} from '@/utils/ledger'
import { formatCurrency, formatDate, monthKeyOf, todayISO } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Cash and bank.
 *
 * The register plus the balances it produces. The balances are never stored —
 * they are the sum of the entries, so the two can never disagree.
 */
export default function LedgerPage() {
  const { data, loading, update } = useAppData()
  const { print } = usePrint()

  const balances = useMemo(
    () => accountBalances(data.accounts, data.transactions),
    [data.accounts, data.transactions],
  )

  const totals = useMemo(() => totalBalances(balances), [balances])

  const thisMonth = useMemo(() => {
    const key = monthKeyOf(todayISO())
    const rows = data.transactions.filter((t) => monthKeyOf(t.date) === key && !t.transferId)

    return {
      inflow: rows.filter((t) => t.direction === 'in').reduce((sum, t) => sum + t.amount, 0),
      outflow: rows.filter((t) => t.direction === 'out').reduce((sum, t) => sum + t.amount, 0),
    }
  }, [data.transactions])

  // ---------------------------------------------------------------- actions

  const addTransaction = useCallback(
    (values: TransactionSubmit) => {
      const stamp = now()

      // A transfer is written as two legs in a single update. There is no
      // code path that can create one without the other.
      if (values.mode === 'transfer') {
        const from = data.accounts.find((a) => a.id === values.fromAccountId)
        const to = data.accounts.find((a) => a.id === values.toAccountId)

        if (!from || !to) {
          toast.error('Could not record the transfer', {
            description: 'One of the accounts no longer exists.',
          })
          return
        }

        const legs = buildTransferLegs({
          transferId: uid(),
          outId: uid(),
          inId: uid(),
          date: values.date,
          details: values.details ?? '',
          amount: values.amount,
          from,
          to,
          createdAt: stamp,
        })

        update('transactions', [...legs, ...data.transactions])

        toast.success('Transfer recorded', {
          description: `${formatCurrency(values.amount)} moved from ${from.name} to ${to.name}. Your combined total is unchanged.`,
        })
        return
      }

      const transaction: Transaction = {
        id: uid(),
        date: values.date,
        details: values.details?.trim() ?? '',
        accountId: values.accountId!,
        direction: values.mode,
        category: values.category!,
        amount: values.amount,
        createdAt: stamp,
      }

      update('transactions', [transaction, ...data.transactions])

      toast.success(values.mode === 'in' ? 'Money in recorded' : 'Money out recorded', {
        description: `${formatCurrency(values.amount)} · ${values.category}`,
      })
    },
    [data.accounts, data.transactions, update],
  )

  const deleteTransactions = useCallback(
    (ids: string[]) => {
      update(
        'transactions',
        data.transactions.filter((transaction) => !ids.includes(transaction.id)),
      )

      toast.success(ids.length > 1 ? 'Transfer deleted' : 'Entry deleted', {
        description:
          ids.length > 1
            ? 'Both legs were removed so the accounts stay in balance.'
            : 'Balances have been recalculated.',
      })
    },
    [data.transactions, update],
  )

  // ---------------------------------------------------------------- printing

  const printRegister = useCallback(() => {
    const rows = buildLedgerRows(data.transactions, data.accounts)
    const summary = summariseRows(rows)

    print({
      title: 'Cash & Bank Ledger',
      subtitle: `${rows.length} entries`,
      meta: [
        { label: 'Cash in hand', value: formatCurrency(totals.cash) },
        { label: 'Total in banks', value: formatCurrency(totals.bank) },
        { label: 'Combined', value: formatCurrency(totals.combined) },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'details', label: 'Details' },
        { key: 'account', label: 'Account' },
        { key: 'category', label: 'Category' },
        { key: 'in', label: 'In', align: 'right' },
        { key: 'out', label: 'Out', align: 'right' },
        { key: 'balance', label: 'Balance', align: 'right' },
      ],
      // Oldest first on paper, so the running balance builds down the page.
      rows: [...rows].reverse().map((row) => ({
        date: formatDate(row.date),
        details: row.details || '—',
        account: row.accountName,
        category: row.category,
        in: row.direction === 'in' ? formatCurrency(row.amount) : '',
        out: row.direction === 'out' ? formatCurrency(row.amount) : '',
        balance: formatCurrency(row.balance),
      })),
      totals: {
        date: 'Total',
        in: formatCurrency(summary.totalIn),
        out: formatCurrency(summary.totalOut),
        balance: formatCurrency(totals.combined),
      },
      footnote:
        'Transfers appear as two linked entries — one out, one in — and do not change the combined cash and bank total.',
    })
  }, [data.transactions, data.accounts, totals, print])

  if (loading) return <PageSkeleton />

  if (data.accounts.length === 0) {
    return (
      <div>
        <PageHeader title="Cash & Bank Ledger" />
        <Section>
          <EmptyState
            icon={Landmark}
            size="lg"
            title="No accounts set up"
            description="Add your cash box and bank accounts before recording transactions."
            action={
              <Button asChild>
                <Link to="/settings">Add accounts</Link>
              </Button>
            }
          />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Cash & Bank Ledger"
        description="Every receipt, payment and transfer. Balances are calculated from the entries — never stored separately."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={printRegister}
            disabled={data.transactions.length === 0}
          >
            <Printer />
            Print register
          </Button>
        }
      />

      <StatGrid className="mb-4">
        <StatCard
          label="Cash in hand"
          icon={Wallet}
          accent="primary"
          value={
            <Money
              value={totals.cash}
              size="2xl"
              weight="bold"
              tone={totals.cash < 0 ? 'negative' : 'neutral'}
            />
          }
        />

        <StatCard
          label="Total in banks"
          icon={Landmark}
          accent="brass"
          value={<Money value={totals.bank} size="2xl" weight="bold" tone="neutral" />}
          footer={
            <span className="text-2xs text-muted-foreground">
              across {balances.filter((b) => b.kind === 'bank').length} accounts
            </span>
          }
        />

        <StatCard
          label="This month in"
          icon={ArrowDownLeft}
          accent="success"
          value={<Money value={thisMonth.inflow} size="2xl" weight="bold" tone="positive" />}
          footer={
            <span className="text-2xs text-muted-foreground">transfers excluded</span>
          }
        />

        <StatCard
          label="This month out"
          icon={ArrowUpRight}
          accent="primary"
          value={<Money value={thisMonth.outflow} size="2xl" weight="bold" tone="negative" />}
          footer={
            <span className="text-2xs text-muted-foreground">transfers excluded</span>
          }
        />
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-[27rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <TransactionForm
            accounts={data.accounts}
            categories={data.categories}
            transactions={data.transactions}
            onSubmit={addTransaction}
          />

          <Section title="Account balances" description="Calculated from every entry">
            <BalanceSummary balances={balances} totals={totals} />
          </Section>
        </div>

        <LedgerTable
          transactions={data.transactions}
          accounts={data.accounts}
          categories={data.categories}
          onDelete={deleteTransactions}
        />
      </div>
    </div>
  )
}
