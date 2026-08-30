import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightLeft, PiggyBank, Users } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { AdvanceForm, type AdvanceSubmit } from '@/features/advances/AdvanceForm'
import { CustomerLedgerTable } from '@/features/customerLedger/CustomerLedgerTable'
import { useAppData } from '@/hooks/useAppData'
import type { Transaction } from '@/types'
import { buildSaleSummaries } from '@/utils/sales'
import {
  availableAdvance,
  buildAdvance,
  buildAdvanceAdjustment,
  buildCustomerLedgerRows,
  customerNameOf,
  nextReference,
  transactionsForCustomer,
} from '@/utils/customerLedger'
import { formatCurrency, todayISO } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Advances — money received from a customer ahead of a sale.
 *
 * Never folded into a normal payment: it has its own transaction type, its
 * own running pool per customer, and its own explicit "apply to an invoice"
 * action, so a business owner can always see how much of a customer's credit
 * is genuinely unused.
 */
export default function AdvancesPage() {
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

  const advanceByCustomer = useMemo(() => {
    const map = new Map<string, number>()
    for (const customer of data.customers) {
      map.set(customer.id, availableAdvance(transactionsForCustomer(data.customerTransactions, customer.id)))
    }
    return map
  }, [data.customers, data.customerTransactions])

  const totalAvailable = useMemo(
    () => [...advanceByCustomer.values()].reduce((s, v) => s + v, 0),
    [advanceByCustomer],
  )

  const advanceRows = useMemo(
    () =>
      buildCustomerLedgerRows(
        data.customerTransactions.filter((t) => t.type === 'advance' || t.type === 'advance_adjustment' || t.type === 'refund'),
      ).map((row) => ({ ...row, customerName: customerNameOf(data.customers, row.customerId) })),
    [data.customerTransactions, data.customers],
  )

  const recordAdvance = (values: AdvanceSubmit) => {
    const stamp = now()
    const reference = nextReference('advance', data.customerTransactions)

    const row = buildAdvance({
      id: uid(),
      customerId: values.customerId,
      date: values.date,
      reference,
      amount: values.amount,
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
          details: `Advance received — ${customerNameOf(data.customers, values.customerId)} (${reference})`,
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

  const applyAdvance = (customerId: string, saleId: string, amount: number) => {
    const stamp = now()
    const reference = nextReference('advance_adjustment', data.customerTransactions)

    const row = buildAdvanceAdjustment({
      id: uid(),
      customerId,
      date: todayISO(),
      reference,
      amount,
      referenceSaleId: saleId,
      createdAt: stamp,
    })

    updateMany({ customerTransactions: [row, ...data.customerTransactions] })
    toast.success(`${reference} applied`, { description: formatCurrency(amount) })
  }

  if (loading) return <PageSkeleton />

  if (data.customers.length === 0) {
    return (
      <div>
        <PageHeader title="Advances" />
        <Section>
          <EmptyState icon={Users} size="lg" title="No customers set up" description="Add a customer before recording an advance." action={<Button asChild><Link to="/customers">Add a customer</Link></Button>} />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Advances" description="Money received ahead of a sale, and applying it once one happens." />

      <StatGrid columns={2} className="mb-4">
        <StatCard label="Total available advance" icon={PiggyBank} accent="brass" value={<Money value={totalAvailable} size="2xl" weight="bold" tone="positive" />} />
        <StatCard label="Customers holding advance" icon={Users} accent="primary" value={<Num value={[...advanceByCustomer.values()].filter((v) => v > 0).length} size="2xl" className="font-bold" />} />
      </StatGrid>

      <div className="mb-4 grid gap-4 xl:grid-cols-[27rem_minmax(0,1fr)]">
        <AdvanceForm customers={data.customers} accounts={data.accounts} onSubmit={recordAdvance} />
        <ApplyAdvancePanel
          customers={data.customers}
          advanceByCustomer={advanceByCustomer}
          sales={allSales.filter((s) => s.amountDue > 0)}
          onApply={applyAdvance}
        />
      </div>

      <Section title="Advance activity" description="Every advance received, applied, or refunded" noPadding>
        <CustomerLedgerTable rows={advanceRows} showCustomer />
      </Section>
    </div>
  )
}

function ApplyAdvancePanel({
  customers,
  advanceByCustomer,
  sales,
  onApply,
}: {
  customers: import('@/types').Customer[]
  advanceByCustomer: Map<string, number>
  sales: import('@/types').SaleSummary[]
  onApply: (customerId: string, saleId: string, amount: number) => void
}) {
  const eligible = customers.filter((c) => (advanceByCustomer.get(c.id) ?? 0) > 0)
  const [customerId, setCustomerId] = useState(eligible[0]?.id ?? '')
  const [saleId, setSaleId] = useState('')
  const [amount, setAmount] = useState('')

  const available = advanceByCustomer.get(customerId) ?? 0
  const customerSales = sales.filter((s) => s.customerId === customerId)
  const sale = customerSales.find((s) => s.id === saleId)
  const maxApplicable = sale ? Math.min(available, sale.amountDue) : 0

  return (
    <Section title="Apply advance to an invoice" description="Settle a due invoice using a customer's unused advance.">
      {eligible.length === 0 ? (
        <EmptyState icon={ArrowRightLeft} size="sm" title="No advance available" description="Record an advance first, then apply it here once the customer has a due invoice." />
      ) : (
        <div className="space-y-3">
          <Field label="Customer">
            <Select
              value={customerId}
              onValueChange={(v) => {
                setCustomerId(v)
                setSaleId('')
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a customer" />
              </SelectTrigger>
              <SelectContent>
                {eligible.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} — {formatCurrency(advanceByCustomer.get(c.id) ?? 0)} available
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Due invoice" hint={customerSales.length === 0 ? 'This customer has no due invoices right now.' : undefined}>
            <Select value={saleId} onValueChange={setSaleId} disabled={customerSales.length === 0}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an invoice" />
              </SelectTrigger>
              <SelectContent>
                {customerSales.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.invoiceNo} — due {formatCurrency(s.amountDue)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Amount to apply (৳)" hint={sale ? `Up to ${formatCurrency(maxApplicable)}` : undefined}>
            <Input type="number" min={0} max={maxApplicable} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={!sale} />
          </Field>

          <Button
            className="w-full"
            variant="success"
            disabled={!sale || Number(amount) <= 0 || Number(amount) > maxApplicable}
            onClick={() => {
              if (!sale) return
              onApply(customerId, sale.id, Number(amount))
              setAmount('')
              setSaleId('')
            }}
          >
            <ArrowRightLeft />
            Apply advance
          </Button>
        </div>
      )}
    </Section>
  )
}
