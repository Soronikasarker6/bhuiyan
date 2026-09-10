import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, Scale, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageSkeleton } from '@/components/PageSkeleton'
import { SaleForm, type SaleSubmit } from '@/features/sales/SaleForm'
import { SalesTable } from '@/features/sales/SalesTable'
import { usePrint, printPayloadToCsv, type PrintPayload } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import type { SaleSummary } from '@/types'
import { activeProducts, activeMeshSizes } from '@/utils/products'
import { buildSaleSummaries, filterSaleSummaries, nextInvoiceNo } from '@/utils/sales'
import { availableBags as availableBagsFor } from '@/utils/productionStock'
import { downloadTextFile } from '@/utils/download'
import {
  firstDayOfMonth,
  firstDayOfWeek,
  formatCurrency,
  formatDate,
  formatNumber,
  formatTons,
  todayISO,
} from '@/utils/format'

const ALL = '__all__'

/**
 * Sales — how much stone we sold, to whom, at what rate, and on which truck.
 *
 * Deliberately separate from Production: this page never touches gross/tare
 * weight. One invoice can carry several products or mesh sizes as line
 * items, which is why a sale is a header plus items rather than a flat row.
 */
export default function SalesPage() {
  const { data, loading, createSale: persistSale, deleteSale: persistDeleteSale } = useAppData()
  const { print } = usePrint()
  const canCreate = usePermission(PERMISSIONS.SALES_CREATE)

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

  // ------------------------------------------------------------ date/customer filter
  // Unbounded by default — the register still shows every sale until someone
  // narrows it, so nothing here changes what the page showed before filters existed.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [customerFilter, setCustomerFilter] = useState(ALL)

  const filteredSales = useMemo(
    () =>
      filterSaleSummaries(sales, {
        from: from || undefined,
        to: to || undefined,
        customerId: customerFilter === ALL ? undefined : customerFilter,
      }),
    [sales, from, to, customerFilter],
  )

  const thisYear = new Date().getFullYear()
  const thisMonth = new Date().getMonth()
  const datePresets = [
    { label: 'Today', from: todayISO(), to: todayISO() },
    { label: 'This week', from: firstDayOfWeek(), to: todayISO() },
    { label: 'This month', from: firstDayOfMonth(thisYear, thisMonth), to: todayISO() },
  ]

  /** The five figures the register must show, all responding to the date/customer filter above (§13). */
  const totalAmount = useMemo(() => filteredSales.reduce((sum, s) => sum + s.totalAmount, 0), [filteredSales])
  const totalTonSold = useMemo(() => filteredSales.reduce((sum, s) => sum + s.totalWeightTon, 0), [filteredSales])
  const totalPaid = useMemo(() => filteredSales.reduce((sum, s) => sum + s.amountPaid, 0), [filteredSales])
  const totalDue = useMemo(() => filteredSales.reduce((sum, s) => sum + s.amountDue, 0), [filteredSales])

  /** The same function the Production & Stock page's cards use — a sale can never be accepted against a different number than the stock it's checking. */
  const availableBags = useCallback(
    (productId: string, meshSizeId: string) =>
      availableBagsFor(productId, meshSizeId, data.productionEntries, data.saleItems, data.sales),
    [data.productionEntries, data.saleItems, data.sales],
  )

  const addSale = useCallback(
    async (values: SaleSubmit) => {
      // Re-checked here, not just in the form — a stale form (another tab
      // already sold the last bags) must not be able to slip an oversell
      // through. §7's rule is enforced at the one place that actually writes
      // the data, not only at the one that happens to render it. (The
      // backend re-checks this again, independently, before writing.)
      const requested = new Map<string, number>()
      for (const item of values.items) {
        const key = `${item.productId}::${item.meshSizeId}`
        const after = (requested.get(key) ?? 0) + (Number(item.bags) || 0)
        requested.set(key, after)

        if (after > availableBags(item.productId, item.meshSizeId)) {
          toast.error('Could not record the sale', {
            description: 'Stock changed since this form was opened — refresh and try again.',
          })
          return
        }
      }

      const paidAtSale = values.paidAtSale ?? 0

      try {
        const { invoiceNo: recordedInvoiceNo } = await persistSale({
          date: values.date,
          customerId: values.customerId,
          truckNo: values.truckNo?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
          paidAtSale,
          // Only meaningful once something was actually collected at sale —
          // this is what lands the amount in the Cash & Bank Ledger too.
          accountId: paidAtSale > 0 ? values.accountId : undefined,
          items: values.items.map((item) => ({
            productId: item.productId,
            meshSizeId: item.meshSizeId,
            bags: item.bags,
            ratePerTon: item.ratePerTon,
            // The weighbridge/scale figure, when it differs from the
            // calculated bag-weight arithmetic — this is what the invoice is
            // actually billed on, so it has to survive the save.
            actualWeightTon: item.actualWeightTon,
          })),
        })

        toast.success(`${recordedInvoiceNo} recorded`, {
          description: paidAtSale > 0 ? `Paid ${formatCurrency(paidAtSale)}` : undefined,
        })
      } catch (error) {
        toast.error('Could not record the sale', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    },
    [availableBags, persistSale],
  )

  const deleteSale = useCallback(
    async (saleId: string) => {
      try {
        await persistDeleteSale(saleId)
        toast.success('Invoice deleted', { description: 'Its ledger entries were removed with it.' })
      } catch (error) {
        toast.error('Could not delete the invoice', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    },
    [persistDeleteSale],
  )

  const buildInvoicePayload = useCallback(
    (sale: SaleSummary): PrintPayload => ({
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
        { key: 'bags', label: 'Bags', align: 'right' },
        { key: 'weight', label: 'Weight (Ton)', align: 'right' },
        { key: 'rate', label: 'Rate / Ton', align: 'right' },
        { key: 'amount', label: 'Amount', align: 'right' },
      ],
      rows: sale.items.map((item) => ({
        product: item.productName,
        mesh: item.meshSizeName,
        bags: formatNumber(item.bags),
        weight: formatTons(item.weightTon),
        rate: formatCurrency(item.ratePerTon),
        amount: formatCurrency(item.amount),
      })),
      totals: { product: 'Total', amount: formatCurrency(sale.totalAmount) },
      footnote: sale.notes,
    }),
    [],
  )

  const printInvoice = useCallback((sale: SaleSummary) => print(buildInvoicePayload(sale)), [buildInvoicePayload, print])

  const exportInvoiceCsv = useCallback(
    (sale: SaleSummary) => {
      const csv = printPayloadToCsv(buildInvoicePayload(sale))
      downloadTextFile(`invoice-${sale.invoiceNo}.csv`, csv, 'text/csv;charset=utf-8;')
      toast.success('Invoice exported', { description: `${sale.invoiceNo} saved as CSV.` })
    },
    [buildInvoicePayload],
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

      <StatGrid columns={5} className="mb-4">
        <StatCard label="Total sales" icon={Receipt} accent="brass" value={<Money value={totalAmount} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{filteredSales.length} invoices</span>} />
        <StatCard
          label="Total TON sold"
          icon={Scale}
          accent="primary"
          value={
            <span className="font-mono text-2xl font-bold tabular tracking-tight sm:text-[1.75rem]">
              {formatTons(totalTonSold)}
              <span className="ml-1 font-sans text-[0.85em] text-muted-foreground">Ton</span>
            </span>
          }
        />
        <StatCard label="Total paid" icon={Wallet} accent="success" value={<Money value={totalPaid} size="2xl" weight="bold" tone="positive" />} />
        <StatCard label="Total due" icon={Wallet} accent={totalDue > 0 ? 'primary' : 'success'} value={<Money value={totalDue} size="2xl" weight="bold" tone={totalDue > 0 ? 'negative' : 'positive'} />} />
        <StatCard label="Total invoices" icon={Receipt} accent="neutral" value={<Num value={filteredSales.length} size="2xl" className="font-bold" />} />
      </StatGrid>

      <Section title="Date & customer filter" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="sales-date-range" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Date range</label>
            <DateRangePicker id="sales-date-range" from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t) }} />
          </div>
          <div>
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</label>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger><SelectValue placeholder="All customers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All customers</SelectItem>
                {data.customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Quick range</label>
            <div className="flex flex-wrap gap-1.5">
              {datePresets.map((preset) => (
                <Button key={preset.label} type="button" variant="outline" size="sm" onClick={() => { setFrom(preset.from); setTo(preset.to) }}>
                  {preset.label}
                </Button>
              ))}
              {(from || to) && (
                <Button type="button" variant="ghost" size="sm" onClick={() => { setFrom(''); setTo('') }}>
                  All time
                </Button>
              )}
            </div>
          </div>
        </div>
      </Section>

      {canCreate && (
        <div className="mb-4">
          <SaleForm
            customers={data.customers}
            products={products}
            meshSizes={meshSizes}
            accounts={data.accounts}
            nextInvoiceNo={invoiceNo}
            availableBags={availableBags}
            onSubmit={addSale}
          />
        </div>
      )}

      <SalesTable sales={filteredSales} onDelete={deleteSale} onExportCsv={exportInvoiceCsv} onExportPdf={printInvoice} />
    </div>
  )
}
