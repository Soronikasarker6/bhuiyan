import { useMemo, useState } from 'react'
import { BookText, Printer } from 'lucide-react'
import { PageHeader, Section } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import { CustomerLedgerTable } from '@/features/customerLedger/CustomerLedgerTable'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { CustomerTxnType } from '@/types'
import {
  buildCustomerLedgerRows,
  customerBalance,
  customerNameOf,
  filterCustomerTransactions,
} from '@/utils/customerLedger'
import { formatCurrency, formatDate } from '@/utils/format'

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

  const printLedger = () => {
    print({
      title: 'Customer Ledger',
      subtitle: `${rows.length} entries${customerId !== ALL ? ` · ${customerNameOf(data.customers, customerId)}` : ''}`,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'reference', label: 'Reference' },
        { key: 'customer', label: 'Customer' },
        { key: 'description', label: 'Description' },
        { key: 'debit', label: 'Debit', align: 'right' },
        { key: 'credit', label: 'Credit', align: 'right' },
        { key: 'balance', label: 'Balance', align: 'right' },
      ],
      rows: [...rows].reverse().map((r) => ({
        date: formatDate(r.date),
        reference: r.reference,
        customer: r.customerName,
        description: r.description,
        debit: r.debit > 0 ? formatCurrency(r.debit) : '',
        credit: r.credit > 0 ? formatCurrency(r.credit) : '',
        balance: formatCurrency(r.balance),
      })),
      totals: { date: 'Total', debit: formatCurrency(totals.debit), credit: formatCurrency(totals.credit) },
    })
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Customer Ledger"
        description="Every sale and payment, across every customer — a running balance, like a bank statement."
        actions={
          <Button variant="outline" size="sm" onClick={printLedger} disabled={rows.length === 0}>
            <Printer />
            Print
          </Button>
        }
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
