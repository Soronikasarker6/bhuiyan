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
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import {
  buildCustomerLedgerRows,
  customerBalance,
  customerNameOf,
  outstandingCustomers,
  transactionsForCustomer,
} from '@/utils/customerLedger'
import { formatCurrency } from '@/utils/format'

/**
 * Cash In — a plain credit against a customer's overall balance (§4).
 *
 * It is never targeted at one invoice: `buildPayment` posts one credit row,
 * and the ledger's own running balance decides whether that reduces Due or
 * grows Advance — there is nothing here that has to know which case it is.
 */
export default function PaymentsPage() {
  const { data, loading, recordPayment } = useAppData()
  const canCreate = usePermission(PERMISSIONS.CASH_IN_CREATE)

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

  const recordCashIn = async (values: PaymentSubmit) => {
    const balanceBefore = balanceOf(values.customerId)

    try {
      const { reference } = await recordPayment({
        customerId: values.customerId,
        date: values.date,
        amount: values.amount,
        method: values.method,
        accountId: values.accountId,
      })

      const overpayment = Math.max(0, values.amount - Math.max(0, balanceBefore))

      toast.success(`${reference} recorded`, {
        description: overpayment > 0
          ? `${formatCurrency(values.amount - overpayment)} applied to due · ${formatCurrency(overpayment)} added to Advance`
          : formatCurrency(values.amount),
      })
    } catch (error) {
      toast.error('Could not record the payment', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
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

      {canCreate && (
        <div className="mb-4">
          <PaymentForm customers={data.customers} balanceOf={balanceOf} accounts={data.accounts} onSubmit={recordCashIn} />
        </div>
      )}

      <Section title="Cash In history" description={`${paymentRows.length} payments recorded`} noPadding>
        <CustomerLedgerTable rows={paymentRows} showCustomer />
      </Section>
    </div>
  )
}
