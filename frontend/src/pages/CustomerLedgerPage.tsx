import { useMemo, useState } from 'react'
import { BookText, Receipt, Scale, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { ExportMenu } from '@/components/ExportMenu'
import { CustomerLedgerTable } from '@/features/customerLedger/CustomerLedgerTable'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import { usePageHeader } from '@/hooks/usePageHeader'
import type { CustomerTxnType } from '@/types'
import {
  buildCustomerLedgerRows,
  buildCustomerLedgerStatementRows,
  CUSTOMER_LEDGER_STATEMENT_COLUMNS,
  customerLedgerStatementCsv,
  customerLedgerStatementPrintRows,
  customerDisplayLabel,
  customerNameOf,
  dueOrAdvanceLabel,
  filterCustomerTransactions,
  openingBalanceTotal,
} from '@/utils/customerLedger'
import { buildSaleSummaries, filterSaleSummaries } from '@/utils/sales'
import { downloadTextFile } from '@/utils/download'
import { formatCurrency, formatDate, todayISO } from '@/utils/format'

const ALL = '__all__'

const TYPE_OPTIONS: Array<{ value: CustomerTxnType | typeof ALL; label: string }> = [
  { value: ALL, label: 'All types' },
  { value: 'sale', label: 'Sale' },
  { value: 'payment', label: 'Payment' },
  { value: 'refund', label: 'Refund' },
  { value: 'opening_balance', label: 'Opening Balance' },
  { value: 'other', label: 'Other' },
]

/**
 * The company-wide customer ledger — every sale and payment, across every
 * customer, filterable down to one (§5).
 */
export default function CustomerLedgerPage() {
  const { data, loading } = useAppData()
  const { print } = usePrint()

  const [customerId, setCustomerId] = useState(ALL)
  const [type, setType] = useState<CustomerTxnType | typeof ALL>(ALL)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const filtered = useMemo(
    () =>
      filterCustomerTransactions(data.customerTransactions, {
        customerId: customerId === ALL ? undefined : customerId,
        type: type === ALL ? undefined : type,
        from: from || undefined,
        to: to || undefined,
      }),
    [data.customerTransactions, customerId, type, from, to],
  )

  // The filter picks the rows; the balance still comes from the whole ledger,
  // so a row dated inside a range carries everything that happened before it.
  const rows = useMemo(
    () =>
      buildCustomerLedgerRows(filtered, data.customerTransactions).map((row) => ({
        ...row,
        customerName: customerNameOf(data.customers, row.customerId),
      })),
    [filtered, data.customerTransactions, data.customers],
  )

  /*
   * The account summary — Opening + Sales − Payments = Closing.
   *
   * Scoped by customer and date but deliberately *not* by the type dropdown:
   * that dropdown narrows which rows you are reading, while these four
   * figures describe the account itself, and they have to reconcile with each
   * other. Filtering them to "payments only" would leave a Closing balance
   * that no longer follows from the Opening one above it.
   */
  const scoped = useMemo(
    () =>
      filterCustomerTransactions(data.customerTransactions, {
        customerId: customerId === ALL ? undefined : customerId,
        from: from || undefined,
        to: to || undefined,
      }),
    [data.customerTransactions, customerId, from, to],
  )

  const movement = useMemo(
    () => scoped.reduce((sum, t) => ({ debit: sum.debit + t.debit, credit: sum.credit + t.credit }), { debit: 0, credit: 0 }),
    [scoped],
  )

  const opening = useMemo(
    () => openingBalanceTotal(data.customerTransactions, from || undefined, customerId === ALL ? undefined : customerId),
    [data.customerTransactions, from, customerId],
  )

  const closing = opening + movement.debit - movement.credit

  // ---------------------------------------------------------------- export
  //
  // The bill-book export (CSV/PDF) is a different shape from the
  // bank-statement table above — one row per sale line item, not per
  // transaction — so it's built from the sales themselves, scoped only by
  // customer and date range. It deliberately ignores the `type` dropdown:
  // that filter belongs to the bank-statement view, and a bill-book export
  // is definitionally about sales and payments.
  const allSales = useMemo(
    () =>
      buildSaleSummaries(
        data.sales,
        data.saleItems,
        data.products,
        data.meshSizes,
        data.customers,
        data.customerTransactions,
      ),
    [data.sales, data.saleItems, data.products, data.meshSizes, data.customers, data.customerTransactions],
  )

  const exportSales = useMemo(
    () =>
      filterSaleSummaries(allSales, {
        customerId: customerId === ALL ? undefined : customerId,
        from: from || undefined,
        to: to || undefined,
      }),
    [allSales, customerId, from, to],
  )

  const exportPayments = useMemo(
    () =>
      filterCustomerTransactions(data.customerTransactions, {
        customerId: customerId === ALL ? undefined : customerId,
        type: 'payment',
        from: from || undefined,
        to: to || undefined,
      }),
    [data.customerTransactions, customerId, from, to],
  )

  const statementRows = useMemo(
    () => buildCustomerLedgerStatementRows(exportSales, exportPayments, (cid) => customerNameOf(data.customers, cid)),
    [exportSales, exportPayments, data.customers],
  )

  /*
   * The statement closes on the customer's real position, so the balance the
   * range opened with is carried into it — a statement for August that
   * ignores July's unpaid invoices states a due the customer does not owe.
   */
  const statementDue = useMemo(() => {
    const totalAmount = exportSales.reduce((sum, s) => sum + s.totalAmount, 0)
    const totalCredit = exportPayments.reduce((sum, t) => sum + t.credit, 0)
    const balance = opening + totalAmount - totalCredit
    return { totalDue: Math.max(0, balance), availableAdvance: Math.max(0, -balance) }
  }, [exportSales, exportPayments, opening])

  const exportStatementCsv = () => {
    const csv = customerLedgerStatementCsv(statementRows, statementDue)
    const label = customerId === ALL ? 'all-customers' : customerNameOf(data.customers, customerId).replace(/\s+/g, '-').toLowerCase()
    downloadTextFile(`customer-ledger-${label}-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8;')
    toast.success('Ledger exported', { description: 'Statement saved as CSV.' })
  }

  const exportStatementPdf = () => {
    const totalAmount = statementRows.reduce((sum, r) => sum + (r.amount ?? 0), 0)
    const totalCredit = statementRows.reduce((sum, r) => sum + (r.credit ?? 0), 0)
    print({
      title: 'Customer Ledger',
      subtitle: `${statementRows.length} entries${customerId !== ALL ? ` · ${customerNameOf(data.customers, customerId)}` : ''}`,
      columns: CUSTOMER_LEDGER_STATEMENT_COLUMNS,
      rows: customerLedgerStatementPrintRows(statementRows),
      totals: { date: '', detail: 'Total', total: formatCurrency(totalAmount), credit: formatCurrency(totalCredit) },
      footnote: dueOrAdvanceLabel(statementDue),
    })
  }

  usePageHeader({
    title: 'Customer Ledger',
    description: 'Every sale and payment, across every customer — a running balance, like a bank statement.',
    actions: <ExportMenu onCsv={exportStatementCsv} onPdf={exportStatementPdf} disabled={statementRows.length === 0} />,
  })

  if (loading) return <PageSkeleton />

  return (
    <div>
      <StatGrid columns={from ? 4 : 3} className="mb-4">
        {from && (
          <StatCard
            label={`Opening balance · before ${formatDate(from)}`}
            icon={Scale}
            accent={opening > 0 ? 'primary' : 'success'}
            value={<Money value={opening} size="2xl" weight="bold" />}
          />
        )}
        <StatCard label="Total out (sales)" icon={Receipt} accent="primary" value={<Money value={movement.debit} size="2xl" weight="bold" tone="negative" />} />
        <StatCard label="Total in (payments)" icon={Wallet} accent="success" value={<Money value={movement.credit} size="2xl" weight="bold" tone="positive" />} />
        <StatCard
          label={customerId === ALL ? 'Closing balance · all customers' : 'Closing balance'}
          icon={Scale}
          accent={closing > 0 ? 'primary' : 'success'}
          value={<Money value={closing} size="2xl" weight="bold" />}
        />
      </StatGrid>

      <Section title="Filters" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All customers</SelectItem>
              {data.customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {customerDisplayLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={type} onValueChange={(v) => setType(v as CustomerTxnType | typeof ALL)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} aria-label="Date range" />
        </div>
      </Section>

      <Section title="Ledger" description={`${rows.length} entries`} noPadding>
        <CustomerLedgerTable rows={rows} showCustomer={customerId === ALL} />
      </Section>

      {rows.length === 0 && data.customerTransactions.length === 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          <BookText className="mr-1 inline h-3 w-3" aria-hidden />
          Entries appear here automatically as sales and payments are recorded.
        </p>
      )}
    </div>
  )
}
