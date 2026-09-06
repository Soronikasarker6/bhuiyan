import { useMemo, useState } from 'react'
import { BookText } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { ExportMenu } from '@/components/ExportMenu'
import { CustomerLedgerTable } from '@/features/customerLedger/CustomerLedgerTable'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { CustomerTxnType } from '@/types'
import {
  buildCustomerLedgerRows,
  buildCustomerLedgerStatementRows,
  CUSTOMER_LEDGER_STATEMENT_COLUMNS,
  customerBalance,
  customerLedgerStatementCsv,
  customerLedgerStatementPrintRows,
  customerNameOf,
  dueOrAdvanceLabel,
  filterCustomerTransactions,
} from '@/utils/customerLedger'
import { buildSaleSummaries, filterSaleSummaries } from '@/utils/sales'
import { downloadTextFile } from '@/utils/download'
import { formatCurrency, todayISO } from '@/utils/format'

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

  const rows = useMemo(
    () => buildCustomerLedgerRows(filtered).map((row) => ({ ...row, customerName: customerNameOf(data.customers, row.customerId) })),
    [filtered, data.customers],
  )

  const totals = useMemo(
    () => filtered.reduce((sum, t) => ({ debit: sum.debit + t.debit, credit: sum.credit + t.credit }), { debit: 0, credit: 0 }),
    [filtered],
  )

  const netBalance = useMemo(() => customerBalance(data.customerTransactions), [data.customerTransactions])

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

  const statementDue = useMemo(() => {
    const totalAmount = exportSales.reduce((sum, s) => sum + s.totalAmount, 0)
    const totalCredit = exportPayments.reduce((sum, t) => sum + t.credit, 0)
    const balance = totalAmount - totalCredit
    return { totalDue: Math.max(0, balance), availableAdvance: Math.max(0, -balance) }
  }, [exportSales, exportPayments])

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

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Customer Ledger"
        description="Every sale and payment, across every customer — a running balance, like a bank statement."
        actions={<ExportMenu onCsv={exportStatementCsv} onPdf={exportStatementPdf} disabled={statementRows.length === 0} />}
      />

      <StatGrid columns={3} className="mb-4">
        <StatCard label="Total out (sales)" value={<Money value={totals.debit} size="2xl" weight="bold" tone="negative" />} />
        <StatCard label="Total in (payments)" value={<Money value={totals.credit} size="2xl" weight="bold" tone="positive" />} />
        <StatCard label="Net position, all customers" value={<Money value={netBalance} size="2xl" weight="bold" />} />
      </StatGrid>

      <Section title="Filters" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All customers</SelectItem>
              {data.customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
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

          <DatePicker value={from} onChange={setFrom} aria-label="From date" />
          <DatePicker value={to} onChange={setTo} aria-label="To date" />
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
