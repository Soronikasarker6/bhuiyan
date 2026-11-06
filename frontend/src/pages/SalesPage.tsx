import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Receipt, Scale, Users, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageSkeleton } from '@/components/PageSkeleton'
import { SaleForm, type SaleFormValues, type SaleSubmit } from '@/features/sales/SaleForm'
import { RawMaterialSaleForm, type RawMaterialSaleValues } from '@/features/sales/RawMaterialSaleForm'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SalesTable } from '@/features/sales/SalesTable'
import { EditSaleDialog } from '@/features/sales/EditSaleDialog'
import { usePrint, printPayloadToCsv, type PrintPayload } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import { usePageHeader } from '@/hooks/usePageHeader'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import type { SaleSummary, SaleType } from '@/types'
import { activeProducts, activeMeshSizes } from '@/utils/products'
import {
  buildSaleSummaries,
  filterSaleSummaries,
  isRawMaterialSale,
  isReversedSale,
  nextInvoiceNo,
  standingSales,
  rawMaterialSaleMovements,
  optionalKg,
  saleBilledNetKg,
  SALE_TYPE_LABEL,
} from '@/utils/sales'
import { customerDisplayLabel, customerTotals, transactionsForCustomer } from '@/utils/customerLedger'
import { currentRawStockTon, cycleStatusForDate } from '@/utils/rawMaterial'
import { kgToTons } from '@/utils/imports'
import { bagKgOf } from '@/utils/products'
import { availableBags as availableBagsFor } from '@/utils/productionStock'
import { downloadTextFile } from '@/utils/download'
import { defaultCashAccountId } from '@/utils/ledger'
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
 * Two kinds of sale share this page, the customer ledger and the cash rails:
 *
 * - **Finished product** — bagged, mesh-wise stock out of production. One
 *   invoice can carry several products or mesh sizes as line items, which is
 *   why a sale is a header plus items rather than a flat row.
 * - **Raw material** — raw limestone sold straight from the yard by
 *   net weight (entered at billing). Deducted from raw stock, never from bags, and
 *   never recorded as production.
 */
export default function SalesPage() {
  const {
    data,
    loading,
    createSale: persistSale,
    updateSale: persistUpdateSale,
    deleteSale: persistDeleteSale,
    reverseSale: persistReverseSale,
  } = useAppData()
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
  const [saleTypeFilter, setSaleTypeFilter] = useState<SaleType | typeof ALL>(ALL)

  const filteredSales = useMemo(
    () =>
      filterSaleSummaries(sales, {
        from: from || undefined,
        to: to || undefined,
        customerId: customerFilter === ALL ? undefined : customerFilter,
        saleType: saleTypeFilter === ALL ? undefined : saleTypeFilter,
      }),
    [sales, from, to, customerFilter, saleTypeFilter],
  )

  /** Which kind of sale the create form records. */
  const [newSaleType, setNewSaleType] = useState<SaleType>('finished_product')

  const thisYear = new Date().getFullYear()
  const thisMonth = new Date().getMonth()
  const datePresets = [
    { label: 'Today', from: todayISO(), to: todayISO() },
    { label: 'This week', from: firstDayOfWeek(), to: todayISO() },
    { label: 'This month', from: firstDayOfMonth(thisYear, thisMonth), to: todayISO() },
  ]

  /**
   * The five figures the register must show, all responding to the date/customer filter above (§13).
   * Reversed sales stay listed (marked Reversed) but are never counted.
   */
  const countedSales = useMemo(() => standingSales(filteredSales), [filteredSales])
  const totalAmount = useMemo(() => countedSales.reduce((sum, s) => sum + s.totalAmount, 0), [countedSales])
  const totalTonSold = useMemo(() => countedSales.reduce((sum, s) => sum + s.totalWeightTon, 0), [countedSales])
  const totalPaid = useMemo(() => countedSales.reduce((sum, s) => sum + s.amountPaid, 0), [countedSales])
  const totalDue = useMemo(() => countedSales.reduce((sum, s) => sum + s.amountDue, 0), [countedSales])

  /** The same function the Production & Stock page's cards use — a sale can never be accepted against a different number than the stock it's checking. */
  const availableBags = useCallback(
    (productId: string, meshSizeId: string) =>
      availableBagsFor(productId, meshSizeId, data.productionEntries, data.saleItems, data.sales),
    [data.productionEntries, data.saleItems, data.sales],
  )

  // ------------------------------------------------------------ raw material sales
  /**
   * Current raw stock for one material — the same `currentRawStockTon` the
   * Raw Material page's cards use. `excludeSaleId` lets an edit count the
   * sale's own tons as available again (they are being replaced, not added to).
   */
  const rawStockFor = useCallback(
    (productId: string, excludeSaleId?: string) =>
      currentRawStockTon(
        productId,
        data.rawMaterialImports,
        data.wastageEntries,
        data.productionEntries,
        (meshId) => bagKgOf(data.meshSizes, meshId),
        undefined,
        rawMaterialSaleMovements(data.sales, data.saleItems).filter((m) => m.saleId !== excludeSaleId),
      ),
    [data.rawMaterialImports, data.wastageEntries, data.productionEntries, data.meshSizes, data.sales, data.saleItems],
  )

  const customerAdvance = useCallback(
    (customerId: string) => customerTotals(transactionsForCustomer(data.customerTransactions, customerId)).availableAdvance,
    [data.customerTransactions],
  )

  const toRawSaleInput = (values: RawMaterialSaleValues) => {
    const paidAtSale = values.paidAtSale ?? 0
    return {
      saleType: 'raw_material' as const,
      date: values.date,
      customerId: values.customerId,
      truckNo: values.truckNo?.trim() || undefined,
      notes: values.notes?.trim() || undefined,
      paidAtSale,
      accountId: paidAtSale > 0 ? values.accountId : undefined,
      items: [],
      rawMaterial: {
        productId: values.productId,
        netWeightKg: Number(values.netWeightKg),
        ratePerTon: Number(values.ratePerTon),
        grossWeightKg: optionalKg(values.grossWeightKg),
        tareWeightKg: optionalKg(values.tareWeightKg),
      },
    }
  }

  const addRawSale = useCallback(
    async (values: RawMaterialSaleValues) => {
      try {
        const { invoiceNo: recordedInvoiceNo } = await persistSale(toRawSaleInput(values))
        const netTon = kgToTons(Number(values.netWeightKg))
        toast.success(`${recordedInvoiceNo} recorded`, {
          description: `${formatTons(netTon)} Ton deducted from raw stock.`,
        })
      } catch (error) {
        toast.error('Could not record the raw material sale', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    },
    [persistSale],
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

  // ------------------------------------------------------------ edit
  const [editing, setEditing] = useState<SaleSummary | null>(null)

  /** While editing, the invoice's own bags count as available — they are being replaced, not added to. */
  const editAvailableBags = useCallback(
    (productId: string, meshSizeId: string) =>
      availableBagsFor(
        productId,
        meshSizeId,
        data.productionEntries,
        data.saleItems.filter((i) => i.saleId !== editing?.id),
        data.sales,
      ),
    [data.productionEntries, data.saleItems, data.sales, editing],
  )

  const editInitialValues = useMemo<SaleFormValues | null>(() => {
    if (!editing || isRawMaterialSale(editing)) return null
    const cashRow = data.transactions.find((t) => t.referenceSaleId === editing.id)
    return {
      date: editing.date,
      customerId: editing.customerId,
      truckNo: editing.truckNo ?? '',
      notes: editing.notes ?? '',
      paidAtSale: editing.paidAtSale > 0 ? editing.paidAtSale : ('' as unknown as number),
      accountId: cashRow?.accountId ?? defaultCashAccountId(data.accounts) ?? data.accounts[0]?.id ?? '',
      items: editing.items.map((item) => ({
        productId: item.productId,
        meshSizeId: item.meshSizeId ?? '',
        bags: item.bags,
        ratePerTon: item.ratePerTon ?? 0,
        actualWeightTon: item.weightTon,
      })),
    }
  }, [editing, data.transactions, data.accounts])

  const saveEdit = useCallback(
    async (values: SaleSubmit) => {
      if (!editing) return
      const paidAtSale = values.paidAtSale ?? 0
      try {
        await persistUpdateSale(editing.id, {
          date: values.date,
          customerId: values.customerId,
          truckNo: values.truckNo?.trim() || undefined,
          notes: values.notes?.trim() || undefined,
          paidAtSale,
          accountId: paidAtSale > 0 ? values.accountId : undefined,
          items: values.items.map((item) => ({
            productId: item.productId,
            meshSizeId: item.meshSizeId,
            bags: item.bags,
            ratePerTon: item.ratePerTon,
            actualWeightTon: item.actualWeightTon,
          })),
        })
        toast.success(`${editing.invoiceNo} updated`)
        setEditing(null)
      } catch (error) {
        toast.error('Could not update the invoice', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    },
    [editing, persistUpdateSale],
  )

  const editRawInitialValues = useMemo<RawMaterialSaleValues | null>(() => {
    if (!editing || !isRawMaterialSale(editing)) return null
    const cashRow = data.transactions.find((t) => t.referenceSaleId === editing.id)
    const line = editing.items[0]
    return {
      date: editing.date,
      customerId: editing.customerId,
      productId: line?.productId ?? '',
      truckNo: editing.truckNo ?? '',
      grossWeightKg: editing.grossWeightKg ?? ('' as unknown as number),
      tareWeightKg: editing.tareWeightKg ?? ('' as unknown as number),
      // The net weight it was billed on — the line's stored billable ton, in kg.
      netWeightKg: saleBilledNetKg(editing) ?? ('' as unknown as number),
      ratePerTon: line?.ratePerTon ?? ('' as unknown as number),
      paidAtSale: editing.paidAtSale > 0 ? editing.paidAtSale : ('' as unknown as number),
      accountId: cashRow?.accountId ?? defaultCashAccountId(data.accounts) ?? data.accounts[0]?.id ?? '',
      notes: editing.notes ?? '',
    }
  }, [editing, data.transactions, data.accounts])

  const editRawStockFor = useCallback((productId: string) => rawStockFor(productId, editing?.id), [rawStockFor, editing])

  const saveRawEdit = useCallback(
    async (values: RawMaterialSaleValues) => {
      if (!editing) return
      try {
        await persistUpdateSale(editing.id, toRawSaleInput(values))
        toast.success(`${editing.invoiceNo} updated`, { description: 'Raw stock re-calculated for the new weight.' })
        setEditing(null)
      } catch (error) {
        toast.error('Could not update the sale', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    },
    [editing, persistUpdateSale],
  )

  /**
   * Why a sale can no longer be edited or deleted — mirrors
   * SalesService::assertCorrectable(). A raw material sale dated inside a
   * closed shipment cycle is corrected by an Admin reversal instead.
   */
  const lockReason = useCallback(
    (sale: SaleSummary) => {
      if (isReversedSale(sale)) return 'Reversed — kept as history'
      if (!isRawMaterialSale(sale)) return undefined
      const productId = sale.items[0]?.productId
      if (productId && cycleStatusForDate(productId, sale.date, data.shipmentCycles) === 'closed') {
        return 'In a closed shipment cycle — an Admin can reverse it'
      }
      return undefined
    },
    [data.shipmentCycles],
  )

  const reverseSale = useCallback(
    async (sale: SaleSummary, input: { reason: string; date: string }) => {
      try {
        await persistReverseSale(sale.id, input)
        toast.success(`${sale.invoiceNo} reversed`, {
          description: 'The receivable was cancelled and the tons returned to raw stock.',
        })
      } catch (error) {
        toast.error('Could not reverse the sale', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    },
    [persistReverseSale],
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
    (sale: SaleSummary): PrintPayload => {
      const customer = data.customers.find((c) => c.id === sale.customerId)

      return {
        title: `Invoice ${sale.invoiceNo}`,
        subtitle: customer ? customerDisplayLabel(customer) : sale.customerName,
        meta: [
          { label: 'Date', value: formatDate(sale.date) },
          ...(sale.truckNo ? [{ label: 'Truck No.', value: sale.truckNo }] : []),
        ],
        // Rate/Ton and Amount are confidential business information and
        // never appear on the customer-facing invoice, even when an Admin
        // prints it — this is a dispatch record, not a priced bill.
        ...(isRawMaterialSale(sale)
          ? {
              columns: [
                { key: 'material', label: 'Raw Material' },
                { key: 'netKg', label: 'Net (KG)', align: 'right' as const },
                { key: 'netTon', label: 'Net (Ton)', align: 'right' as const },
              ],
              rows: sale.items.map((item) => ({
                material: item.productName,
                netKg: formatNumber(saleBilledNetKg(sale)),
                netTon: formatTons(item.weightTon),
              })),
            }
          : {
        columns: [
          { key: 'product', label: 'Product' },
          { key: 'mesh', label: 'Mesh' },
          { key: 'bags', label: 'Bags', align: 'right' },
          { key: 'weight', label: 'Weight (Ton)', align: 'right' },
        ],
        rows: sale.items.map((item) => ({
          product: item.productName,
          mesh: item.meshSizeName,
          bags: formatNumber(item.bags),
          weight: formatTons(item.weightTon),
        })),
            }),
        footnote: sale.notes,
      }
    },
    [data.customers],
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

  usePageHeader({
    title: 'Sales',
    description: data.customers.length > 0 ? 'Who bought what, at what rate, and on which truck.' : undefined,
  })

  if (loading) return <PageSkeleton />

  if (data.customers.length === 0) {
    return (
      <div>
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

      <Section title="Date, customer & type filter" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                {data.customers.map((c) => <SelectItem key={c.id} value={c.id}>{customerDisplayLabel(c)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Sale type</label>
            <Select value={saleTypeFilter} onValueChange={(v) => setSaleTypeFilter(v as SaleType | typeof ALL)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All sales</SelectItem>
                <SelectItem value="finished_product">{SALE_TYPE_LABEL.finished_product} sales</SelectItem>
                <SelectItem value="raw_material">{SALE_TYPE_LABEL.raw_material} sales</SelectItem>
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
        <Tabs value={newSaleType} onValueChange={(v) => setNewSaleType(v as SaleType)} className="mb-4">
          <TabsList className="mb-3">
            <TabsTrigger value="finished_product">{SALE_TYPE_LABEL.finished_product} sale</TabsTrigger>
            <TabsTrigger value="raw_material">{SALE_TYPE_LABEL.raw_material} sale</TabsTrigger>
          </TabsList>
          <TabsContent value="finished_product">
            <SaleForm
              customers={data.customers}
              products={products}
              meshSizes={meshSizes}
              accounts={data.accounts}
              nextInvoiceNo={invoiceNo}
              availableBags={availableBags}
              onSubmit={addSale}
            />
          </TabsContent>
          <TabsContent value="raw_material">
            <RawMaterialSaleForm
              customers={data.customers}
              products={products}
              accounts={data.accounts}
              nextInvoiceNo={invoiceNo}
              availableRawTon={rawStockFor}
              customerAdvance={customerAdvance}
              onSubmit={addRawSale}
            />
          </TabsContent>
        </Tabs>
      )}

      <SalesTable
        sales={filteredSales}
        onDelete={deleteSale}
        onEdit={setEditing}
        onExportCsv={exportInvoiceCsv}
        onExportPdf={printInvoice}
        lockReason={lockReason}
        onReverse={reverseSale}
      />

      <EditSaleDialog
        sale={editing}
        initialValues={editInitialValues}
        customers={data.customers}
        products={products}
        meshSizes={meshSizes}
        accounts={data.accounts}
        availableBags={editAvailableBags}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={saveEdit}
        rawInitialValues={editRawInitialValues}
        availableRawTon={editRawStockFor}
        customerAdvance={customerAdvance}
        onSubmitRaw={saveRawEdit}
      />
    </div>
  )
}
