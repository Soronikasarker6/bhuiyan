import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, Users } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/PageSkeleton'
import { SaleForm, type SaleSubmit } from '@/features/sales/SaleForm'
import { SalesTable } from '@/features/sales/SalesTable'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { Sale, SaleItem, SaleSummary } from '@/types'
import { activeProducts, activeMeshSizes } from '@/utils/products'
import { buildSaleSummaries, buildSaleTransactions, nextInvoiceNo } from '@/utils/sales'
import { formatCurrency, formatDate, todayISO } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Sales — how much stone we sold, to whom, at what rate, and on which truck.
 *
 * Deliberately separate from Production: this page never touches gross/tare
 * weight. One invoice can carry several products or mesh sizes as line
 * items, which is why a sale is a header plus items rather than a flat row.
 */
export default function SalesPage() {
  const { data, loading, updateMany } = useAppData()
  const { print } = usePrint()

  const products = useMemo(() => activeProducts(data.products), [data.products])
  const meshSizes = useMemo(() => activeMeshSizes(data.meshSizes), [data.meshSizes])

  const sales = useMemo(
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

  const invoiceNo = useMemo(() => nextInvoiceNo(data.sales, new Date().getFullYear()), [data.sales])

  const todaySales = useMemo(() => sales.filter((s) => s.date === todayISO()), [sales])
  const totalAmount = useMemo(() => sales.reduce((sum, s) => sum + s.totalAmount, 0), [sales])
  const totalDue = useMemo(() => sales.reduce((sum, s) => sum + s.amountDue, 0), [sales])

  const addSale = useCallback(
    (values: SaleSubmit) => {
      const stamp = now()
      const saleId = uid()

      const sale: Sale = {
        id: saleId,
        invoiceNo,
        date: values.date,
        customerId: values.customerId,
        truckNo: values.truckNo?.trim() || undefined,
        notes: values.notes?.trim() || undefined,
        paidAtSale: values.paidAtSale ?? 0,
        createdAt: stamp,
      }

      const items: SaleItem[] = values.items.map((item) => ({
        id: uid(),
        saleId,
        productId: item.productId,
        meshSizeId: item.meshSizeId || undefined,
        weightTon: item.weightTon,
        ratePerTon: item.ratePerTon,
      }))

      const totalAmount = items.reduce((sum, item) => sum + item.weightTon * item.ratePerTon, 0)

      const ledgerRows = buildSaleTransactions({
        sale,
        totalAmount,
        paymentReference: `${invoiceNo}-PD`,
      })

      updateMany({
        sales: [sale, ...data.sales],
        saleItems: [...data.saleItems, ...items],
        customerTransactions: [...ledgerRows, ...data.customerTransactions],
      })

      toast.success(`${invoiceNo} recorded`, {
        description: `Total ${formatCurrency(totalAmount)}${sale.paidAtSale > 0 ? ` · Paid ${formatCurrency(sale.paidAtSale)}` : ''}`,
      })
    },
    [data.sales, data.saleItems, data.customerTransactions, invoiceNo, updateMany],
  )

  const deleteSale = useCallback(
    (saleId: string) => {
      updateMany({
        sales: data.sales.filter((s) => s.id !== saleId),
        saleItems: data.saleItems.filter((i) => i.saleId !== saleId),
        customerTransactions: data.customerTransactions.filter((t) => t.referenceSaleId !== saleId),
      })
      toast.success('Invoice deleted', { description: 'Its ledger entries were removed with it.' })
    },
    [data.sales, data.saleItems, data.customerTransactions, updateMany],
  )

  const printInvoice = useCallback(
    (sale: SaleSummary) => {
      print({
        title: `Invoice ${sale.invoiceNo}`,
        subtitle: `${sale.customerName}${sale.truckNo ? ` · Truck ${sale.truckNo}` : ''}`,
        meta: [
          { label: 'Date', value: formatDate(sale.date) },
          { label: 'Paid', value: formatCurrency(sale.amountPaid) },
          { label: 'Due', value: formatCurrency(sale.amountDue) },
        ],
        columns: [
          { key: 'product', label: 'Product' },
          { key: 'mesh', label: 'Mesh' },
          { key: 'weight', label: 'Weight (Ton)', align: 'right' },
          { key: 'rate', label: 'Rate / Ton', align: 'right' },
          { key: 'amount', label: 'Amount', align: 'right' },
        ],
        rows: sale.items.map((item) => ({
          product: item.productName,
          mesh: item.meshSizeName ?? '—',
          weight: String(item.weightTon),
          rate: formatCurrency(item.ratePerTon),
          amount: formatCurrency(item.amount),
        })),
        totals: { product: 'Total', amount: formatCurrency(sale.totalAmount) },
        footnote: sale.notes,
      })
    },
    [print],
  )

  if (loading) return <PageSkeleton />

  if (data.customers.length === 0) {
    return (
      <div>
        <PageHeader title="Sales" />
        <Section>
          <EmptyState
            icon={Users}
            size="lg"
            title="No customers set up"
            description="Add your first customer before recording a sale."
            action={
              <Button asChild>
                <Link to="/customers">Add a customer</Link>
              </Button>
            }
          />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Sales" description="Who bought what, at what rate, and on which truck." />

      <StatGrid columns={3} className="mb-4">
        <StatCard label="Today's sales" icon={Receipt} accent="primary" value={<Money value={todaySales.reduce((s, r) => s + r.totalAmount, 0)} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{todaySales.length} invoices</span>} />
        <StatCard label="Total sales" icon={Receipt} accent="brass" value={<Money value={totalAmount} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{sales.length} invoices</span>} />
        <StatCard label="Total outstanding due" icon={Receipt} accent={totalDue > 0 ? 'primary' : 'success'} value={<Money value={totalDue} size="2xl" weight="bold" tone={totalDue > 0 ? 'negative' : 'positive'} />} />
      </StatGrid>

      <div className="mb-4">
        <SaleForm customers={data.customers} products={products} meshSizes={meshSizes} nextInvoiceNo={invoiceNo} onSubmit={addSale} />
      </div>

      <SalesTable sales={sales} onDelete={deleteSale} onPrint={printInvoice} />
    </div>
  )
}
