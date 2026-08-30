import { useMemo, useState } from 'react'
import { Plus, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { CustomerForm, type CustomerSubmit } from '@/features/customers/CustomerForm'
import { CustomerTable } from '@/features/customers/CustomerTable'
import { useAppData } from '@/hooks/useAppData'
import type { Customer } from '@/types'
import { buildSaleSummaries } from '@/utils/sales'
import { buildOpeningBalance, customerTotals, nextReference, transactionsForCustomer } from '@/utils/customerLedger'
import { now, uid } from '@/utils/id'

/**
 * Customers — the master list every sale and ledger entry points back to.
 */
export default function CustomersPage() {
  const { data, loading, update, updateMany } = useAppData()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)

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

  const totalsByCustomer = useMemo(() => {
    const map = new Map<string, ReturnType<typeof customerTotals>>()
    for (const customer of data.customers) {
      const txns = transactionsForCustomer(data.customerTransactions, customer.id)
      const sales = allSales.filter((s) => s.customerId === customer.id)
      map.set(customer.id, customerTotals(txns, sales))
    }
    return map
  }, [data.customers, data.customerTransactions, allSales])

  const grandTotals = useMemo(() => {
    let totalDue = 0
    let totalAdvance = 0
    for (const totals of totalsByCustomer.values()) {
      totalDue += totals.totalDue
      totalAdvance += totals.availableAdvance
    }
    return { totalDue, totalAdvance }
  }, [totalsByCustomer])

  const addOrUpdate = (values: CustomerSubmit) => {
    if (editing) {
      update(
        'customers',
        data.customers.map((c) =>
          c.id === editing.id
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
      return
    }

    const id = uid()
    const stamp = now()
    const opening = Number(values.openingBalance) || 0

    const customer: Customer = {
      id,
      name: values.name.trim(),
      company: values.company?.trim() || undefined,
      phone: values.phone?.trim() || undefined,
      address: values.address?.trim() || undefined,
      openingBalance: opening,
      notes: values.notes?.trim() || undefined,
      active: true,
      createdAt: stamp,
    }

    const patch: Partial<typeof data> = { customers: [...data.customers, customer] }

    if (opening !== 0) {
      const row = buildOpeningBalance({
        id: uid(),
        customerId: id,
        date: stamp.slice(0, 10),
        reference: nextReference('opening_balance', data.customerTransactions),
        amount: opening,
        createdAt: stamp,
      })
      patch.customerTransactions = [row, ...data.customerTransactions]
    }

    updateMany(patch)
    toast.success(`${customer.name} added`)
  }

  const removeCustomer = (customer: Customer) => {
    update('customers', data.customers.filter((c) => c.id !== customer.id))
    toast.success(`${customer.name} removed`)
  }

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Every sale and ledger entry points back to one of these."
        actions={
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus />
            Add customer
          </Button>
        }
      />

      <StatGrid columns={3} className="mb-4">
        <StatCard label="Customers" icon={Users} accent="primary" value={<Num value={data.customers.length} size="2xl" className="font-bold" />} />
        <StatCard label="Total outstanding due" icon={Wallet} accent={grandTotals.totalDue > 0 ? 'primary' : 'success'} value={<Money value={grandTotals.totalDue} size="2xl" weight="bold" tone={grandTotals.totalDue > 0 ? 'negative' : 'positive'} />} />
        <StatCard label="Total customer advance" icon={Wallet} accent="brass" value={<Money value={grandTotals.totalAdvance} size="2xl" weight="bold" tone="positive" />} />
      </StatGrid>

      <CustomerTable
        customers={data.customers}
        totalsOf={(id) => totalsByCustomer.get(id) ?? customerTotals([], [])}
        onEdit={(customer) => {
          setEditing(customer)
          setFormOpen(true)
        }}
        onDelete={removeCustomer}
      />

      <CustomerForm open={formOpen} onOpenChange={setFormOpen} editing={editing} onSubmit={addOrUpdate} />
    </div>
  )
}
