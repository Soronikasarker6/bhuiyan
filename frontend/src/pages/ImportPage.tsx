import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Factory, Package, Scale, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageSkeleton } from '@/components/PageSkeleton'
import { ExportMenu } from '@/components/ExportMenu'
import { EditImportDialog } from '@/features/imports/EditImportDialog'
import { ImportEntryForm, type ImportSubmit } from '@/features/imports/ImportEntryForm'
import { ImportTable } from '@/features/imports/ImportTable'
import type { ShipmentInput } from '@/services/api/shipmentService'
import { WastageForm, type WastageSubmit } from '@/features/imports/WastageForm'
import { WastageTable } from '@/features/imports/WastageTable'
import { RawMaterialStockSummary } from '@/features/imports/RawMaterialStockSummary'
import { ShipmentTable } from '@/features/imports/ShipmentTable'
import { usePrint, printPayloadToCsv, type PrintPayload } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import { usePageHeader } from '@/hooks/usePageHeader'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import type { ImportRow, RawMaterialImport, ShipmentCycle, ShipmentCycleRow, WastageEntry } from '@/types'
import { activeProducts, bagKgOf } from '@/utils/products'
import { buildImportRows, importTotals, kgToTons, netWeightKg, todaysImports } from '@/utils/imports'
import {
  allRawMaterialStock,
  allRawStockSummaries,
  allShipmentCycles,
  buildWastageRows,
  cycleStatusForDate,
} from '@/utils/rawMaterial'
import { downloadTextFile } from '@/utils/download'
import { formatDate, formatNumber, formatTons, todayISO } from '@/utils/format'
import { now, uid } from '@/utils/id'

const ALL = '__all__'

/**
 * Raw Material Import — how much limestone arrived, from which ship, on
 * which truck.
 *
 * This is upstream of Production & Stock: it never asks which mesh a bag was
 * packed into, only how much raw material was received at the yard. The
 * bagging of that material into mesh sizes happens on the Production & Stock
 * page. Every limestone type shares this one "Any Category" register (§1) —
 * the product filter below is how it is narrowed to one type at a time.
 */
export default function ImportPage() {
  const { data, loading, update, updateMany, updateRawMaterialImport } = useAppData()
  const { print } = usePrint()
  const canCreate = usePermission(PERMISSIONS.RAW_MATERIAL_CREATE)
  const [productFilter, setProductFilter] = useState(ALL)
  const [activeTab, setActiveTab] = useState('imports')
  const [editingImport, setEditingImport] = useState<ImportRow | null>(null)
  // §6 — an optional reporting window over the register and the stock figures.
  // Empty by default, so the page opens on the all-time position.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const products = useMemo(() => activeProducts(data.products), [data.products])

  const inWindow = useCallback(
    (date: string) => (!from || date >= from) && (!to || date <= to),
    [from, to],
  )

  const allRows = useMemo(
    () => buildImportRows(data.rawMaterialImports, data.products),
    [data.rawMaterialImports, data.products],
  )
  const rows = useMemo(
    () => allRows.filter((r) => (productFilter === ALL || r.productId === productFilter) && inWindow(r.date)),
    [allRows, productFilter, inWindow],
  )

  const totals = useMemo(() => importTotals(data.rawMaterialImports), [data.rawMaterialImports])
  const todayTotals = useMemo(
    () => importTotals(todaysImports(data.rawMaterialImports, todayISO())),
    [data.rawMaterialImports],
  )

  // §1/§5 — Total Imported − Production − Wastage = Current Raw Stock, per
  // limestone type, honouring the type and date-range filters above.
  const rawStock = useMemo(
    () =>
      allRawStockSummaries(
        products.filter((p) => productFilter === ALL || p.id === productFilter),
        data.rawMaterialImports,
        data.wastageEntries,
        data.productionEntries,
        (meshId) => bagKgOf(data.meshSizes, meshId),
        from || undefined,
        to || undefined,
      ),
    [products, productFilter, data.rawMaterialImports, data.wastageEntries, data.productionEntries, data.meshSizes, from, to],
  )

  // The live, all-time position — what the entry forms must validate against,
  // regardless of whatever window the report above is currently showing.
  const liveStock = useMemo(
    () =>
      allRawMaterialStock(
        data.products,
        data.shipmentCycles,
        data.rawMaterialImports,
        data.wastageEntries,
        data.productionEntries,
        (meshId) => bagKgOf(data.meshSizes, meshId),
      ),
    [data.products, data.shipmentCycles, data.rawMaterialImports, data.wastageEntries, data.productionEntries, data.meshSizes],
  )

  // §2/§3 — one row per shipment cycle, never one per import.
  const allCycles = useMemo(
    () =>
      allShipmentCycles(
        data.products,
        data.shipmentCycles,
        data.rawMaterialImports,
        data.wastageEntries,
        data.productionEntries,
        (meshId) => bagKgOf(data.meshSizes, meshId),
      ),
    [data.products, data.shipmentCycles, data.rawMaterialImports, data.wastageEntries, data.productionEntries, data.meshSizes],
  )
  const shipmentRows = useMemo(
    () => allCycles.filter((c) => (productFilter === ALL || c.productId === productFilter) && inWindow(c.openedOn)),
    [allCycles, productFilter, inWindow],
  )

  const closeShipment = useCallback(
    async (row: ShipmentCycleRow) => {
      const cycle = data.shipmentCycles.find((c) => c.id === row.id)
      if (!cycle || cycle.status === 'closed') return

      const updated: ShipmentCycle = {
        ...cycle,
        status: 'closed',
        closing: {
          openingTon: row.openingTon,
          receivedTon: row.receivedTon,
          consumedTon: row.consumedTon,
          wastageTon: row.wastageTon,
          closingTon: row.closingTon,
          closedAt: now(),
        },
      }

      const ok = await update(
        'shipmentCycles',
        data.shipmentCycles.map((c) => (c.id === cycle.id ? updated : c)),
      )
      if (ok) {
        toast.success('Shipment closed', {
          description: `Closing balance ${formatTons(row.closingTon)} Ton carries forward as the next ${row.productName} shipment's opening balance.`,
        })
      }
    },
    [data.shipmentCycles, update],
  )

  const reopenShipment = useCallback(
    async (row: ShipmentCycleRow) => {
      const cycle = data.shipmentCycles.find((c) => c.id === row.id)
      if (!cycle) return

      const { closing: _closing, ...rest } = cycle
      const updated: ShipmentCycle = { ...rest, status: 'open' }

      const ok = await update(
        'shipmentCycles',
        data.shipmentCycles.map((c) => (c.id === cycle.id ? updated : c)),
      )
      if (ok) toast.success('Shipment reopened', { description: 'Its balance is live again, and later imports of this material will join it again.' })
    },
    [data.shipmentCycles, update],
  )

  const pricesForProduct = useCallback(
    (productId: string) => {
      const seen = new Set<number>()
      const prices: number[] = []
      for (const entry of data.rawMaterialImports) {
        if (entry.productId !== productId) continue
        const price = Number(entry.pricePerTon) || 0
        if (price > 0 && !seen.has(price)) {
          seen.add(price)
          prices.push(price)
        }
      }
      return prices
    },
    [data.rawMaterialImports],
  )

  // §14–§16 — reusable Ship Name / Truck No. values, derived straight from
  // import history (never a fixed master list) — same idea as the Price
  // per Ton dropdown above, just not scoped to one product: a ship or
  // truck isn't tied to one limestone type. Newest use first.
  const distinctValues = useCallback(
    (field: 'shipName' | 'truckNo') => {
      const seen = new Set<string>()
      const values: string[] = []
      for (const entry of [...data.rawMaterialImports].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))) {
        const value = entry[field]?.trim()
        if (value && !seen.has(value)) {
          seen.add(value)
          values.push(value)
        }
      }
      return values
    },
    [data.rawMaterialImports],
  )
  const shipNames = useMemo(() => distinctValues('shipName'), [distinctValues])
  const truckNos = useMemo(() => distinctValues('truckNo'), [distinctValues])

  const wastageRows = useMemo(
    () =>
      buildWastageRows(data.wastageEntries, data.products).filter(
        (r) => (productFilter === ALL || r.productId === productFilter) && inWindow(r.date),
      ),
    [data.wastageEntries, data.products, productFilter, inWindow],
  )

  const addEntry = useCallback(
    async (values: ImportSubmit) => {
      // §2/§4 — join the product's current open cycle if one exists; only
      // start a new one when there isn't (first-ever import, or the last
      // one was closed). Mirrors InventoryService::receiveStock() exactly —
      // on the API build this optimistic id/cycle is discarded the moment
      // `refresh()` pulls back what the backend actually decided.
      const openCycle = data.shipmentCycles.find((c) => c.productId === values.productId && c.status === 'open')
      const cycle: ShipmentCycle = openCycle ?? {
        id: uid(),
        productId: values.productId,
        openedOn: values.date,
        status: 'open',
      }

      const entry: RawMaterialImport = {
        id: uid(),
        shipmentId: cycle.id,
        date: values.date,
        productId: values.productId,
        shipName: values.shipName?.trim() || undefined,
        serialNo: values.serialNo?.trim() || undefined,
        truckNo: values.truckNo?.trim() || undefined,
        grossWeightKg: values.grossWeightKg,
        tareWeightKg: values.tareWeightKg,
        pricePerTon: values.pricePerTon || undefined,
        notes: values.notes?.trim() || undefined,
        createdAt: now(),
      }

      const ok = openCycle
        ? await update('rawMaterialImports', [entry, ...data.rawMaterialImports])
        : await updateMany({
            shipmentCycles: [cycle, ...data.shipmentCycles],
            rawMaterialImports: [entry, ...data.rawMaterialImports],
          })

      if (ok) {
        const net = values.grossWeightKg - values.tareWeightKg
        toast.success('Import recorded', {
          description: `Net weight ${formatNumber(net)} kg (${formatTons(net / 1000)} Ton)`,
        })
      }
    },
    [data.rawMaterialImports, data.shipmentCycles, update, updateMany],
  )

  const editEntry = useCallback(
    async (values: ShipmentInput) => {
      if (!editingImport) return

      try {
        await updateRawMaterialImport(editingImport.id, values)
        toast.success('Import updated', {
          description: `Net weight ${formatNumber(values.grossWeightKg - values.tareWeightKg)} kg (${formatTons((values.grossWeightKg - values.tareWeightKg) / 1000)} Ton)`,
        })
        setEditingImport(null)
      } catch (error) {
        toast.error('Could not update the import entry', {
          description: error instanceof Error ? error.message : undefined,
        })
      }
    },
    [editingImport, updateRawMaterialImport],
  )

  const deleteEntry = useCallback(
    async (id: string) => {
      const entry = data.rawMaterialImports.find((i) => i.id === id)
      const cycle = entry && data.shipmentCycles.find((c) => c.id === entry.shipmentId)
      if (cycle?.status === 'closed') {
        toast.error('This shipment is closed', { description: 'Reopen it in Shipment History first if it needs to be removed.' })
        return
      }

      const ok = await update(
        'rawMaterialImports',
        data.rawMaterialImports.filter((entry) => entry.id !== id),
      )
      if (ok) toast.success('Entry deleted')
    },
    [data.rawMaterialImports, data.shipmentCycles, update],
  )

  // §10 — a wastage entry cannot take a material's current raw stock negative,
  // and cannot be dated inside a cycle that has already been closed. Checked
  // against the live all-time position, never the filtered report window.
  const wastageAvailableTon = useCallback(
    (productId: string) => liveStock.find((s) => s.productId === productId)?.currentRawStockTon ?? 0,
    [liveStock],
  )
  const wastageCycleClosed = useCallback(
    (productId: string, date: string) => cycleStatusForDate(productId, date, data.shipmentCycles) === 'closed',
    [data.shipmentCycles],
  )

  const addWastage = useCallback(
    async (values: WastageSubmit) => {
      const entry: WastageEntry = {
        id: uid(),
        date: values.date,
        productId: values.productId,
        quantityKg: values.quantityKg,
        reason: values.reason?.trim() || undefined,
        createdAt: now(),
      }

      const ok = await update('wastageEntries', [entry, ...data.wastageEntries])
      if (ok) toast.success('Wastage recorded', { description: `${formatNumber(values.quantityKg)} kg deducted from available stock` })
    },
    [data.wastageEntries, update],
  )

  const deleteWastage = useCallback(
    async (id: string) => {
      const ok = await update('wastageEntries', data.wastageEntries.filter((entry) => entry.id !== id))
      if (ok) toast.success('Entry deleted')
    },
    [data.wastageEntries, update],
  )

  const buildRegisterPayload = useCallback(
    (): PrintPayload => ({
      title: 'Raw Material Import Register',
      subtitle: `${rows.length} entries`,
      meta: [
        { label: 'Total gross weight', value: `${formatNumber(totals.grossWeightKg)} kg` },
        { label: 'Total tare weight', value: `${formatNumber(totals.tareWeightKg)} kg` },
        { label: 'Total net weight', value: `${formatNumber(totals.netWeightKg)} kg (${formatTons(totals.netWeightTon)} Ton)` },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'product', label: 'Product' },
        { key: 'ship', label: 'Ship' },
        { key: 'serial', label: 'Ser' },
        { key: 'truck', label: 'Truck No.' },
        { key: 'gross', label: 'Gross (kg)', align: 'right' },
        { key: 'tare', label: 'Tare (kg)', align: 'right' },
        { key: 'net', label: 'Net (kg)', align: 'right' },
        { key: 'ton', label: 'Ton', align: 'right' },
      ],
      rows: [...rows].reverse().map((r) => ({
        date: formatDate(r.date),
        product: r.productName,
        ship: r.shipName ?? '',
        serial: r.serialNo ?? '',
        truck: r.truckNo ?? '',
        gross: formatNumber(r.grossWeightKg),
        tare: formatNumber(r.tareWeightKg),
        net: formatNumber(r.netWeightKg),
        ton: formatTons(r.netWeightTon),
      })),
      totals: {
        date: 'Total',
        gross: formatNumber(totals.grossWeightKg),
        tare: formatNumber(totals.tareWeightKg),
        net: formatNumber(totals.netWeightKg),
        ton: formatTons(totals.netWeightTon),
      },
    }),
    [rows, totals],
  )

  const printRegister = useCallback(() => print(buildRegisterPayload()), [buildRegisterPayload, print])

  // §9 — the one cycle's complete import history, on demand. The summary
  // row a visitor sees in Shipment History is one line; this is every
  // weighbridge receipt that fed it, plus the same cycle totals, so nothing
  // about how "Total Received" was reached is ever hidden.
  const downloadShipmentHistory = useCallback(
    (row: ShipmentCycleRow) => {
      const cycleImports = [...data.rawMaterialImports]
        .filter((i) => i.shipmentId === row.id)
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))
      const cycleTotals = importTotals(cycleImports)

      print({
        title: `Shipment History · ${row.productName}`,
        subtitle: `Shipment #${row.id} — ${row.status === 'closed' ? 'Closed' : 'Open'}`,
        meta: [
          { label: 'Opening', value: `${formatTons(row.openingTon)} Ton` },
          { label: 'Total received', value: `${formatTons(row.receivedTon)} Ton` },
          { label: 'Consumed (production)', value: `${formatTons(row.consumedTon)} Ton` },
          { label: 'Wastage', value: `${formatTons(row.wastageTon)} Ton` },
          { label: row.status === 'closed' ? 'Closing balance' : 'Current balance', value: `${formatTons(row.closingTon)} Ton` },
        ],
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'ship', label: 'Ship' },
          { key: 'truck', label: 'Truck' },
          { key: 'gross', label: 'Gross (kg)', align: 'right' },
          { key: 'tare', label: 'Tare (kg)', align: 'right' },
          { key: 'net', label: 'Net (kg)', align: 'right' },
          { key: 'ton', label: 'Ton', align: 'right' },
        ],
        rows: cycleImports.map((i) => ({
          date: formatDate(i.date),
          ship: i.shipName ?? '',
          truck: i.truckNo ?? '',
          gross: formatNumber(i.grossWeightKg),
          tare: formatNumber(i.tareWeightKg),
          net: formatNumber(netWeightKg(i.grossWeightKg, i.tareWeightKg)),
          ton: formatTons(kgToTons(netWeightKg(i.grossWeightKg, i.tareWeightKg))),
        })),
        totals: {
          date: 'Total Imported',
          net: formatNumber(cycleTotals.netWeightKg),
          ton: formatTons(cycleTotals.netWeightTon),
        },
      })
    },
    [data.rawMaterialImports, print],
  )

  const exportRegisterCsv = useCallback(() => {
    downloadTextFile(`import-register-${todayISO()}.csv`, printPayloadToCsv(buildRegisterPayload()), 'text/csv;charset=utf-8;')
    toast.success('Register exported', { description: 'Saved as CSV.' })
  }, [buildRegisterPayload])

  usePageHeader({
    title: 'Raw Material Import',
    description: data.products.length > 0
      ? 'Limestone received from a ship, weighed gross and tare — net weight is worked out for you.'
      : undefined,
    actions: data.products.length > 0 && (
      <ExportMenu onCsv={exportRegisterCsv} onPdf={printRegister} disabled={rows.length === 0} />
    ),
  })

  if (loading) return <PageSkeleton />

  if (data.products.length === 0) {
    return (
      <div>
        <Section>
          <EmptyState
            icon={Package}
            size="lg"
            title="No products set up"
            description="Add your first stone type before recording an import."
            action={
              <Button asChild>
                <Link to="/products">Add a product</Link>
              </Button>
            }
          />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <StatGrid columns={3} className="mb-4">
        <StatCard
          label="Today's import"
          icon={Factory}
          accent="primary"
          value={<Num value={todayTotals.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />}
        />
        <StatCard
          label="Total imported (all-time)"
          icon={Scale}
          accent="brass"
          value={<Num value={totals.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />}
          footer={<span className="text-2xs text-muted-foreground">{totals.entryCount} entries · a history total, not current stock</span>}
        />
        <StatCard
          label="Total wastage"
          icon={TriangleAlert}
          accent="brass"
          value={<Num value={data.wastageEntries.reduce((s, w) => s + w.quantityKg, 0) / 1000} suffix="Ton" size="2xl" className="font-bold" />}
          footer={<span className="text-2xs text-muted-foreground">{data.wastageEntries.length} entries</span>}
        />
      </StatGrid>

      {/* §1/§7 — one card per limestone type, each its own shipment cycle.
          Never combined into a single blended figure. */}
      <Section
        title="Raw Material Stock"
        description="Total imported, less what went into production and what was lost — per limestone type."
        className="mb-4"
        actions={
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Period
            </span>
            <DateRangePicker
              id="rawstock-range"
              aria-label="Raw material reporting period"
              from={from}
              to={to}
              max={todayISO()}
              onChange={(nextFrom, nextTo) => {
                setFrom(nextFrom)
                setTo(nextTo)
              }}
              className="w-full sm:w-64"
            />
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom('')
                  setTo('')
                }}
              >
                Clear
              </Button>
            )}
          </div>
        }
      >
        <RawMaterialStockSummary rows={rawStock} />
        <p className="mt-2.5 text-2xs text-muted-foreground">
          {from || to
            ? 'Movements within the selected period, opening the window at whatever was already on hand.'
            : 'Everything ever received, less everything that has left the yard — what is physically there right now.'}
        </p>
      </Section>

      {rawStock.some((s) => s.averageCostPerTon) && (
        <Section title="Average raw material cost" description="Weighted by net tons, over every priced import." className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rawStock.filter((s) => s.averageCostPerTon).map((s) => (
              <div key={s.productId} className="rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{s.productName}</p>
                <Money value={s.averageCostPerTon ?? 0} size="lg" weight="bold" className="mt-1" />
                <span className="ml-1 text-2xs text-muted-foreground">
                  / Ton avg. · {formatTons(s.currentRawStockTon)} Ton in stock
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="imports">Imports</TabsTrigger>
            <TabsTrigger value="wastage">Wastage</TabsTrigger>
            <TabsTrigger value="history">Shipment History</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Type</span>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="imports" className="space-y-4">
          {canCreate && (
            <ImportEntryForm
              products={products}
              pricesForProduct={pricesForProduct}
              shipNames={shipNames}
              truckNos={truckNos}
              onSubmit={addEntry}
            />
          )}
          <ImportTable
            rows={rows}
            cycleStatusOf={(shipmentId) => data.shipmentCycles.find((c) => c.id === shipmentId)?.status}
            onDelete={deleteEntry}
            onEdit={setEditingImport}
          />
        </TabsContent>

        <TabsContent value="wastage" className="space-y-4">
          {canCreate && (
            <WastageForm
              products={products}
              availableTon={wastageAvailableTon}
              cycleClosed={wastageCycleClosed}
              onSubmit={addWastage}
            />
          )}
          <WastageTable rows={wastageRows} onDelete={deleteWastage} />
        </TabsContent>

        <TabsContent value="history">
          <ShipmentTable
            rows={shipmentRows}
            onClose={closeShipment}
            onReopen={reopenShipment}
            onDownload={downloadShipmentHistory}
          />
        </TabsContent>
      </Tabs>

      <EditImportDialog
        row={editingImport}
        products={products}
        shipNames={shipNames}
        truckNos={truckNos}
        onOpenChange={(open) => !open && setEditingImport(null)}
        onSubmit={editEntry}
      />
    </div>
  )
}
