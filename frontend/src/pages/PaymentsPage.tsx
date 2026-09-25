import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { CustomerLedgerRow } from '@/types'
import { Section } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { ReasonDialog } from '@/components/ReasonDialog'
import { PaymentForm, type PaymentSubmit } from '@/features/payments/PaymentForm'
import { EditPaymentDialog } from '@/features/payments/EditPaymentDialog'
import { CustomerLedgerTable } from '@/features/customerLedger/CustomerLedgerTable'
import { useAppData, type PaymentUpdateInput } from '@/hooks/useAppData'
import { usePageHeader } from '@/hooks/usePageHeader'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import {
  buildCustomerLedgerRows,
  customerBalance,
  customerNameOf,
  outstandingCustomers,
  transactionsForCustomer,
} from '@/utils/customerLedger'
import { formatCurrency, formatDate } from '@/utils/format'

type PaymentRow = CustomerLedgerRow & { customerName?: string }

/**
 * Cash In — a plain credit against a customer's overall balance (§4).
 *
 * It is never targeted at one invoice: `buildPayment` posts one credit row,
 * and the ledger's own running balance decides whether that reduces Due or
 * grows Advance — there is nothing here that has to know which case it is.
 */
export default function PaymentsPage() {
  const { data, loading, recordPayment, updatePayment, deletePayment } = useAppData()
  const canCreate = usePermission(PERMISSIONS.CASH_IN_CREATE)
  const canEdit = usePermission(PERMISSIONS.CASH_IN_EDIT)
  const canDelete = usePermission(PERMISSIONS.CASH_IN_DELETE)

  const [editing, setEditing] = useState<PaymentRow | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PaymentRow | null>(null)

  /*
   * Payments only in the table, but the balance on each row is computed from
   * the customer's *whole* ledger — so it reads as that customer's position
   * the moment the money landed, sales included, rather than as a running
   * total of receipts.
   */
  const paymentRows = useMemo(
    () =>
      buildCustomerLedgerRows(
        data.customerTransactions.filter((t) => t.type === 'payment'),
        data.customerTransactions,
      ).map((row) => ({
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

  usePageHeader({
    title: 'Cash In',
    description: data.customers.length > 0 ? 'Money received from a customer, against their overall balance.' : undefined,
  })

  const saveEdit = async (values: PaymentUpdateInput) => {
    if (!editing) return
    try {
      await updatePayment(editing.id, values)
      toast.success('Payment updated', { description: formatCurrency(values.amount) })
      setEditing(null)
    } catch (error) {
      toast.error('Could not update the payment', {
        description: error instanceof Error ? error.message : undefined,
      })
    }
  }

  /**
   * A void, not a delete: the payment leaves the active ledgers but the
   * original receipt — and who removed it, and the reason given — stays in the
   * Admin-only audit history.
   */
  const confirmDelete = async (reason?: string) => {
    if (!pendingDelete) return
    try {
      await deletePayment(pendingDelete.id, reason)
      toast.success('Payment removed', {
        description: "The amount is back on the customer's due. The original receipt is kept in the audit history.",
      })
    } catch (error) {
      toast.error('Could not remove the payment', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setPendingDelete(null)
    }
  }

  if (loading) return <PageSkeleton />

  if (data.customers.length === 0) {
    return (
      <div>
        <Section>
          <EmptyState icon={Users} size="lg" title="No customers set up" description="Add a customer before recording a Cash In." action={<Button asChild><Link to="/customers">Add a customer</Link></Button>} />
        </Section>
      </div>
    )
  }

  return (
    <div>
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
        <CustomerLedgerTable
          rows={paymentRows}
          showCustomer
          onEdit={canEdit ? (row) => setEditing(row) : undefined}
          onDelete={canDelete ? (row) => setPendingDelete(row) : undefined}
        />
      </Section>

      <EditPaymentDialog
        row={editing}
        accounts={data.accounts}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={saveEdit}
      />

      <ReasonDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Remove this payment?"
        description="This takes the payment off the customer's ledger and puts the amount back on their due. If it was deposited into an account, that Cash & Bank entry goes with it. The original receipt is kept in the audit history."
        confirmLabel="Remove payment"
        onConfirm={confirmDelete}
      >
        {pendingDelete && (
          <dl className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs">
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="shrink-0 text-muted-foreground">Date</dt>
              <dd className="truncate text-right font-medium">{formatDate(pendingDelete.date)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="shrink-0 text-muted-foreground">Customer</dt>
              <dd className="truncate text-right font-medium">{pendingDelete.customerName}</dd>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="shrink-0 text-muted-foreground">Amount</dt>
              <dd className="truncate text-right font-medium">{formatCurrency(pendingDelete.credit)}</dd>
            </div>
          </dl>
        )}
      </ReasonDialog>
    </div>
  )
}
