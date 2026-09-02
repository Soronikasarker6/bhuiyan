import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Users } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { PaymentForm, type PaymentSubmit } from '@/features/payments/PaymentForm'
import { CustomerLedgerTable } from '@/features/customerLedger/CustomerLedgerTable'
import { useAppData } from '@/hooks/useAppData'
import type { Transaction } from '@/types'
import { buildSaleSummaries } from '@/utils/sales'
import { allocateCashIn, buildCustomerLedgerRows, customerNameOf, nextReference } from '@/utils/customerLedger'
import { formatCurrency } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Cash In — money received against a due invoice, or on account.
 *
 * A due invoice's amount owed drops the moment a Cash In is recorded — there
 * is no separate step that "recalculates" it — and an amount beyond what a
 * customer actually owes is never left as an invalid negative due; it's
 * tracked as Advance instead (§12/§13).
 */
export default function PaymentsPage() {
  const { data, loading, updateMany } = useAppData()

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

  const dueSales = useMemo(() => allSales.filter((s) => s.amountDue > 0), [allSales])

  const paymentRows = useMemo(
    () =>
      buildCustomerLedgerRows(data.customerTransactions.filter((t) => t.type === 'payment')).map((row) => ({
        ...row,
        customerName: customerNameOf(data.customers, row.customerId),
      })),
    [data.customerTransactions, data.customers],
  )

  const totalCollected = useMemo(() => paymentRows.reduce((sum, r) => sum + r.credit, 0), [paymentRows])
  const totalDue = useMemo(() => dueSales.reduce((sum, s) => sum + s.amountDue, 0), [dueSales])

  const recordCashIn = (values: PaymentSubmit) => {
    const stamp = now()
    const paymentReference = nextReference('payment', data.customerTransactions)

    const rows = allocateCashIn({
      customerId: values.customerId,
      date: values.date,
      amount: values.amount,
      dueSales: dueSales.filter((s) => s.customerId === values.customerId),
      targetSaleId: values.saleId,
      paymentReference,
      // Computed once up front so a same-call advance row never collides
      // with the payment reference above, however many invoices it settles.
      advanceReference: nextReference('advance', data.customerTransactions),
      method: values.method,
      linkedAccountId: values.accountId,
      createdAt: stamp,
      makeId: uid,
    })

    const patch: { customerTransactions: typeof data.customerTransactions; transactions?: Transaction[] } = {
      customerTransactions: [...rows, ...data.customerTransactions],
    }

    if (values.accountId) {
      patch.transactions = [
        {
          id: uid(),
          date: values.date,
          details: `Cash In — ${customerNameOf(data.customers, values.customerId)} (${paymentReference})`,
          accountId: values.accountId,
          direction: 'in',
          category: 'Customer Payment',
          amount: values.amount,
          createdAt: stamp,
        },
        ...data.transactions,
      ]
    }

    updateMany(patch)

    const advanceRow = rows.find((r) => r.type === 'advance')
    toast.success(`${paymentReference} recorded`, {
      description: advanceRow
        ? `${formatCurrency(values.amount - advanceRow.credit)} applied to due · ${formatCurrency(advanceRow.credit)} added to Advance`
        : formatCurrency(values.amount),
    })
  }

  if (loading) return <PageSkeleton />

  if (data.customers.length === 0) {
    return (
      <div>
        <PageHeader title="Cash In" />
        <Section>
          <EmptyState icon={Users} size="lg" title="No customers set up" description="Add a customer before recording a Cash In." action={<Button asChild><Link to="/customers">Add a customer</Link></Button>} />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Cash In" description="Money received against a due invoice, or on account." />

      <StatGrid columns={2} className="mb-4">
        <StatCard label="Total cash in collected" icon={Banknote} accent="success" value={<Money value={totalCollected} size="2xl" weight="bold" tone="positive" />} />
        <StatCard label="Still outstanding" icon={Banknote} accent={totalDue > 0 ? 'primary' : 'success'} value={<Money value={totalDue} size="2xl" weight="bold" tone={totalDue > 0 ? 'negative' : 'positive'} />} />
      </StatGrid>

      <div className="mb-4">
        <PaymentForm customers={data.customers} dueSales={dueSales} accounts={data.accounts} onSubmit={recordCashIn} />
      </div>

      <Section title="Cash In history" description={`${paymentRows.length} payments recorded`} noPadding>
        <CustomerLedgerTable rows={paymentRows} showCustomer />
      </Section>
    </div>
  )
}
