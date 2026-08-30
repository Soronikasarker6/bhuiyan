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
import { buildCustomerLedgerRows, buildPayment, customerNameOf, nextReference } from '@/utils/customerLedger'
import { formatCurrency } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Payments — money received against a due invoice, or on account.
 *
 * A due invoice's amount owed drops the moment a linked payment is recorded
 * here — there is no separate step that "recalculates" it.
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

  const recordPayment = (values: PaymentSubmit) => {
    const stamp = now()
    const reference = nextReference('payment', data.customerTransactions)

    const row = buildPayment({
      id: uid(),
      customerId: values.customerId,
      date: values.date,
      reference,
      amount: values.amount,
      referenceSaleId: values.saleId,
      linkedAccountId: values.accountId,
      createdAt: stamp,
    })

    const patch: { customerTransactions: typeof data.customerTransactions; transactions?: Transaction[] } = {
      customerTransactions: [row, ...data.customerTransactions],
    }

    if (values.accountId) {
      patch.transactions = [
        {
          id: uid(),
          date: values.date,
          details: `Payment received — ${customerNameOf(data.customers, values.customerId)} (${reference})`,
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
    toast.success(`${reference} recorded`, { description: formatCurrency(values.amount) })
  }

  if (loading) return <PageSkeleton />

  if (data.customers.length === 0) {
    return (
      <div>
        <PageHeader title="Payments" />
        <Section>
          <EmptyState icon={Users} size="lg" title="No customers set up" description="Add a customer before recording a payment." action={<Button asChild><Link to="/customers">Add a customer</Link></Button>} />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Payments" description="Money received against a due invoice, or on account." />

      <StatGrid columns={2} className="mb-4">
        <StatCard label="Total payments collected" icon={Banknote} accent="success" value={<Money value={totalCollected} size="2xl" weight="bold" tone="positive" />} />
        <StatCard label="Still outstanding" icon={Banknote} accent={totalDue > 0 ? 'primary' : 'success'} value={<Money value={totalDue} size="2xl" weight="bold" tone={totalDue > 0 ? 'negative' : 'positive'} />} />
      </StatGrid>

      <div className="mb-4">
        <PaymentForm customers={data.customers} dueSales={dueSales} accounts={data.accounts} onSubmit={recordPayment} />
      </div>

      <Section title="Payment history" description={`${paymentRows.length} payments recorded`} noPadding>
        <CustomerLedgerTable rows={paymentRows} showCustomer />
      </Section>
    </div>
  )
}
