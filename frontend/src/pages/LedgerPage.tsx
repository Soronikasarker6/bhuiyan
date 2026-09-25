import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Landmark, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/PageSkeleton'
import { ExportMenu } from '@/components/ExportMenu'
import { TransactionForm, NO_CUSTOMER, type TransactionSubmit } from '@/features/ledger/TransactionForm'
import { LedgerTable } from '@/features/ledger/LedgerTable'
import { BalanceSummary } from '@/features/dashboard/BalanceSummary'
import { usePrint, printPayloadToCsv, type PrintPayload } from '@/features/reports/PrintSheet'
import { useAppData, type TransactionUpdateInput, type TransferUpdateInput } from '@/hooks/useAppData'
import { usePageHeader } from '@/hooks/usePageHeader'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import type { Transaction } from '@/types'
import {
  accountBalances,
  buildLedgerRows,
  buildTransferLegs,
  describeLedgerFilters,
  ledgerFiltersActive,
  summariseRows,
  totalBalances,
  type LedgerFilters,
} from '@/utils/ledger'
import { customerBalance, transactionsForCustomer } from '@/utils/customerLedger'
import { downloadTextFile } from '@/utils/download'
import { formatCurrency, formatDate, monthKeyOf, todayISO } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Cash and bank.
 *
 * The register plus the balances it produces. The balances are never stored —
 * they are the sum of the entries, so the two can never disagree.
 */
export default function LedgerPage() {
  const { data, loading, update, recordPayment, updateTransaction, voidTransaction } = useAppData()
  const { print } = usePrint()
  const canCreate = usePermission(PERMISSIONS.LEDGER_CREATE)

  // Owned here, not inside LedgerTable, so Print/Export can build a PDF from
  // the exact same filtered rows the table is showing (§6/§7 of the brief).
  const [filters, setFilters] = useState<LedgerFilters>({})

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

  /**
   * A customer's running receivables balance — positive is Due, negative is
   * Advance. Read straight from the customer ledger, the same way the Cash In
   * screen reads it, so the due shown next to the Customer dropdown is the
   * same number that screen shows.
   */
  const balanceOfCustomer = useCallback(
    (customerId: string) => customerBalance(transactionsForCustomer(data.customerTransactions, customerId)),
    [data.customerTransactions],
  )

  // ---------------------------------------------------------------- actions

  const addTransaction = useCallback(
    async (values: TransactionSubmit) => {
      const stamp = now()

      // §9 — a Cash In with a customer attached is a customer payment, so it
      // goes through the one `recordPayment` path the Cash In screen already
      // uses. That writes the receivables credit and this account's money-in
      // row together, linked; recording them separately here is exactly the
      // duplicate the brief rules out.
      if (values.mode === 'in' && values.customerId && values.customerId !== NO_CUSTOMER) {
        const customer = data.customers.find((c) => c.id === values.customerId)
        const balanceBefore = balanceOfCustomer(values.customerId)

        try {
          const { reference } = await recordPayment({
            customerId: values.customerId,
            date: values.date,
            amount: values.amount,
            accountId: values.accountId!,
          })

          const overpayment = Math.max(0, values.amount - Math.max(0, balanceBefore))
          toast.success(`${reference} recorded`, {
            description: overpayment > 0
              ? `${formatCurrency(values.amount - overpayment)} applied to ${customer?.name ?? 'the customer'}'s due · ${formatCurrency(overpayment)} added to Advance`
              : `${formatCurrency(values.amount)} from ${customer?.name ?? 'customer'} · their due is now ${formatCurrency(Math.max(0, balanceBefore - values.amount))}`,
          })
        } catch (error) {
          toast.error('Could not record the payment', {
            description: error instanceof Error ? error.message : undefined,
          })
        }
        return
      }

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

        // Awaited so the form's busy state covers the whole round trip —
        // request, database write, audit record, refetch — rather than
        // clearing the moment the call is made (§27). `update` resolves false
        // (having already reported the error) instead of rejecting.
        if (!(await update('transactions', [...legs, ...data.transactions]))) return

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

      if (!(await update('transactions', [transaction, ...data.transactions]))) return

      toast.success(values.mode === 'in' ? 'Money in recorded' : 'Money out recorded', {
        description: `${formatCurrency(values.amount)} · ${values.category}`,
      })
    },
    [data.accounts, data.customers, data.transactions, update, recordPayment, balanceOfCustomer],
  )

  /**
   * A void, not a delete (§14): the entry leaves this register but its
   * original figures — and who removed them, and the reason given — stay in
   * the audit history. The reason is never written onto the ledger row, so
   * the register itself is unchanged in shape (§15).
   */
  const removeTransactions = useCallback(
    async (ids: string[], reason?: string) => {
      const wasCustomerPayment = ids.length === 1
        && data.transactions.some((t) => t.id === ids[0] && t.customerId)

      try {
        await voidTransaction(ids, reason)
      } catch (error) {
        toast.error('Could not remove the entry', {
          description: error instanceof Error ? error.message : undefined,
        })
        return
      }

      toast.success(ids.length > 1 ? 'Transfer removed' : 'Entry removed', {
        description:
          ids.length > 1
            ? 'Both legs were removed so the accounts stay in balance.'
            : wasCustomerPayment
              ? 'The payment was removed from the customer ledger too, and the amount is back on their due.'
              : 'Balances have been recalculated. The original entry is kept in the audit history.',
      })
    },
    [data.transactions, voidTransaction],
  )

  /**
   * Editing corrects the entry in place — it is never deleted and re-entered,
   * so its reference and every report already citing it still point at the
   * same event (§13). A transfer leg edits both legs at once (§17).
   */
  const editTransaction = useCallback(
    async (id: string, values: TransactionUpdateInput | TransferUpdateInput) => {
      try {
        await updateTransaction(id, values)
      } catch (error) {
        toast.error('Could not save the change', {
          description: error instanceof Error ? error.message : undefined,
        })
        return
      }

      toast.success('Entry updated', {
        description: `${formatCurrency(values.amount)} · the change is recorded in the audit history.`,
      })
    },
    [updateTransaction],
  )

  // ---------------------------------------------------------------- printing

  /**
   * Built from whatever filters are passed in, never from the full,
   * unfiltered register — the same `buildLedgerRows` call the on-screen table
   * makes, so a filtered PDF's rows and totals can never drift from what's
   * on screen (§6). With no filters active this is exactly the previous,
   * unfiltered behaviour (§6, "preserve the existing default behavior").
   */
  const buildRegisterPayload = useCallback(
    (current: LedgerFilters): PrintPayload => {
      const rows = buildLedgerRows(data.transactions, data.accounts, current)
      const summary = summariseRows(rows)
      const active = ledgerFiltersActive(current)

      // A running balance summed across accounts describes nothing (see
      // utils/ledger.ts) — so the printed total only carries a Balance figure
      // when the filter narrows to one account, taken from its most recent
      // visible entry (rows is newest-first here, before the print reversal).
      const balanceTotal = current.accountId && rows.length > 0 ? formatCurrency(rows[0]!.balance) : ''

      return {
        title: 'Cash & Bank Ledger',
        subtitle: `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}${active ? ' · filtered' : ''}`,
        meta: active
          ? describeLedgerFilters(current, data.accounts)
          : [
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
          balance: balanceTotal || (active ? '' : formatCurrency(totals.combined)),
        },
        footnote:
          'Transfers appear as two linked entries — one out, one in — and do not change the combined cash and bank total.',
      }
    },
    [data.transactions, data.accounts, totals],
  )

  const printRegister = useCallback(() => print(buildRegisterPayload(filters)), [buildRegisterPayload, filters, print])

  const exportRegisterCsv = useCallback(() => {
    downloadTextFile(
      `cash-bank-ledger-${todayISO()}.csv`,
      printPayloadToCsv(buildRegisterPayload(filters)),
      'text/csv;charset=utf-8;',
    )
    toast.success('Register exported', { description: 'Saved as CSV.' })
  }, [buildRegisterPayload, filters])

  usePageHeader({
    title: 'Cash & Bank Ledger',
    description: data.accounts.length > 0
      ? 'Every receipt, payment and transfer. Balances are calculated from the entries — never stored separately.'
      : undefined,
    actions: data.accounts.length > 0 && (
      <ExportMenu onCsv={exportRegisterCsv} onPdf={printRegister} disabled={data.transactions.length === 0} />
    ),
  })

  if (loading) return <PageSkeleton />

  if (data.accounts.length === 0) {
    return (
      <div>
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

      <div className="grid gap-4 xl:grid-cols-2">
        {canCreate && (
          <TransactionForm
            accounts={data.accounts}
            categories={data.categories}
            customers={data.customers}
            balanceOf={balanceOfCustomer}
            transactions={data.transactions}
            onSubmit={addTransaction}
          />
        )}

        <Section title="Account balances" description="Calculated from every entry">
          <BalanceSummary balances={balances} totals={totals} />
        </Section>
      </div>

      <LedgerTable
        transactions={data.transactions}
        accounts={data.accounts}
        categories={data.categories}
        customers={data.customers}
        onDelete={removeTransactions}
        onEdit={editTransaction}
        filters={filters}
        onFiltersChange={setFilters}
        className="mt-4"
      />
    </div>
  )
}
