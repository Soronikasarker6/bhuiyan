import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Receipt, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CustomerForm, type CustomerSubmit } from '@/features/customers/CustomerForm'
import { CustomerLedgerTable } from '@/features/customerLedger/CustomerLedgerTable'
import { useAppData } from '@/hooks/useAppData'
import { buildSaleSummaries } from '@/utils/sales'
import { buildCustomerLedgerRows, customerTotals, transactionsForCustomer } from '@/utils/customerLedger'
import { formatDate, formatDateTime } from '@/utils/format'
import { SALE_STATUS_LABEL, SALE_STATUS_VARIANT } from '@/constants/saleStatus'

/**
 * One customer's full financial picture — the §9/§13 profile: totals up top,
 * their sales history, then their complete ledger in transaction order.
 */
export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, loading, update } = useAppData()
  const [editOpen, setEditOpen] = useState(false)

  const customer = data.customers.find((c) => c.id === id)

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

  const sales = useMemo(() => allSales.filter((s) => s.customerId === id), [allSales, id])

  const transactions = useMemo(
    () => (id ? transactionsForCustomer(data.customerTransactions, id) : []),
    [data.customerTransactions, id],
  )

  const totals = useMemo(() => customerTotals(transactions), [transactions])
  const ledgerRows = useMemo(() => buildCustomerLedgerRows(transactions), [transactions])

  if (loading) return <PageSkeleton />
  if (!customer) return <Navigate to="/customers" replace />

  const saveEdit = (values: CustomerSubmit) => {
    update(
      'customers',
      data.customers.map((c) =>
        c.id === customer.id
          ? {
              ...c,
              name: values.name.trim(),
              company: values.company?.trim() || undefined,
              phone: values.phone?.trim() || undefined,
              address: values.address?.trim() || undefined,
              notes: values.notes?.trim() || undefined,
            }
          : c,
      ),
    )
    toast.success('Customer updated')
  }

  return (
    <div>
      <Link to="/customers" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" />
        All customers
      </Link>

      <PageHeader
        title={customer.name}
        description={[customer.company, customer.phone, customer.address].filter(Boolean).join(' · ') || 'No contact details on file'}
        actions={
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil />
            Edit
          </Button>
        }
      />

      <StatGrid className="mb-4">
        <StatCard label="Total sales" icon={Receipt} accent="primary" value={<Money value={totals.totalSales} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{sales.length} invoices</span>} />
        <StatCard label="Total paid" icon={Wallet} accent="success" value={<Money value={totals.totalPaid} size="2xl" weight="bold" tone="positive" />} />
        <StatCard label="Total due" icon={Wallet} accent={totals.totalDue > 0 ? 'primary' : 'success'} value={<Money value={totals.totalDue} size="2xl" weight="bold" tone={totals.totalDue > 0 ? 'negative' : 'positive'} />} />
        <StatCard label="Advance" icon={Wallet} accent="brass" value={<Money value={totals.availableAdvance} size="2xl" weight="bold" tone={totals.availableAdvance > 0 ? 'positive' : 'neutral'} />} footer={<span className="text-2xs text-muted-foreground">Shown when the balance runs ahead</span>} />
      </StatGrid>

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Transactions</p>
          <Num value={totals.transactionCount} size="xl" className="mt-1 font-bold" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 shadow-card">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Last activity</p>
          <p className="mt-1 text-xl font-bold">{totals.lastTransactionDate ? formatDate(totals.lastTransactionDate) : '—'}</p>
        </div>
      </div>

      {customer.notes && (
        <div className="mb-4 rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">Notes:</strong> {customer.notes}
        </div>
      )}

      <Section title="Sales history" description={`${sales.length} invoices`} noPadding className="mb-4">
        {sales.length === 0 ? (
          <EmptyState icon={Receipt} size="sm" title="No sales yet" description="Invoices for this customer will appear here." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Truck</TableHead>
                <TableHead numeric>Total</TableHead>
                <TableHead numeric>Paid</TableHead>
                <TableHead numeric>Due</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-mono text-xs font-medium">{sale.invoiceNo}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(sale.date)}</TableCell>
                  <TableCell className="font-mono text-2xs text-muted-foreground">{sale.truckNo || '—'}</TableCell>
                  <TableCell numeric>
                    <Money value={sale.totalAmount} size="sm" weight="medium" />
                  </TableCell>
                  <TableCell numeric>
                    <Money value={sale.amountPaid} size="sm" tone="positive" />
                  </TableCell>
                  <TableCell numeric>
                    <Money value={sale.amountDue} size="sm" tone={sale.amountDue > 0 ? 'negative' : 'positive'} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={SALE_STATUS_VARIANT[sale.status]}>{SALE_STATUS_LABEL[sale.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Customer ledger" description="Every sale and payment, running balance included" noPadding>
        <CustomerLedgerTable rows={ledgerRows} />
      </Section>

      <p className="mt-4 text-center text-2xs text-muted-foreground">Customer since {formatDateTime(customer.createdAt)}</p>

      <CustomerForm open={editOpen} onOpenChange={setEditOpen} editing={customer} onSubmit={saveEdit} />
    </div>
  )
}
