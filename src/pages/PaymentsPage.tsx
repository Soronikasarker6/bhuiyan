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
import {
  buildCustomerLedgerRows,
  buildPayment,
  customerBalance,
  customerNameOf,
  nextReference,
  outstandingCustomers,
  transactionsForCustomer,
} from '@/utils/customerLedger'
import { formatCurrency } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Cash In — a plain credit against a customer's overall balance (§4).
 *
 * It is never targeted at one invoice: `buildPayment` posts one credit row,
 * and the ledger's own running balance decides whether that reduces Due or
 * grows Advance — there is nothing here that has to know which case it is.
 */
export default function PaymentsPage() {
  const { data, loading, updateMany } = useAppData()

  const paymentRows = useMemo(
    () =>
      buildCustomerLedgerRows(data.customerTransactions.filter((t) => t.type === 'payment')).map((row) => ({
        ...row,
        customerName: customerNameOf(data.customers, row.customerId),
      })),
    [data.customerTransactions, data.customers],
  )

  const totalCollected = useMemo(() => paymentRows.reduce((sum, r) => sum + r.credit, 0), [paymentRows])

  const totalDue = useMemo(
    () => outstandingCustomers(data.customers, (id) => transactionsForCustomer(data.customerTransactions, id)).reduce((sum, r) => sum + r.totalDue, 0),
    [data.customers, data.customerTransactions],
  )

  const balanceOf = (customerId: string) => customerBalance(transactionsForCustomer(data.customerTransactions, customerId))

  const recordCashIn = (values: PaymentSubmit) => {
    const stamp = now()
    const reference = nextReference('payment', data.customerTransactions)

    const row = buildPayment({
      id: uid(),
      customerId: values.customerId,
      date: values.date,
      reference,
      amount: values.amount,
      method: values.method,
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
          details: `Cash In — ${customerNameOf(data.customers, values.customerId)} (${reference})`,
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

    const balanceBefore = balanceOf(values.customerId)
    const overpayment = Math.max(0, values.amount - Math.max(0, balanceBefore))

    toast.success(`${reference} recorded`, {
      description: overpayment > 0
        ? `${formatCurrency(values.amount - overpayment)} applied to due · ${formatCurrency(overpayment)} added to Advance`
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
      <PageHeader title="Cash In" description="Money received from a customer, against their overall balance." />

      <StatGrid columns={2} className="mb-4">
        <StatCard label="Total cash in collected" icon={Banknote} accent="success" value={<Money value={totalCollected} size="2xl" weight="bold" tone="positive" />} />
        <StatCard label="Still outstanding" icon={Banknote} accent={totalDue > 0 ? 'primary' : 'success'} value={<Money value={totalDue} size="2xl" weight="bold" tone={totalDue > 0 ? 'negative' : 'positive'} />} />
      </StatGrid>

      <div className="mb-4">
        <PaymentForm customers={data.customers} balanceOf={balanceOf} accounts={data.accounts} onSubmit={recordCashIn} />
      </div>

      <Section title="Cash In history" description={`${paymentRows.length} payments recorded`} noPadding>
        <CustomerLedgerTable rows={paymentRows} showCustomer />
      </Section>
    </div>
  )
}
