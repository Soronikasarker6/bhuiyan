import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Factory, Package, Printer, Scale, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { TabContainer } from '@ui5/webcomponents-react/TabContainer'
import { Tab } from '@ui5/webcomponents-react/Tab'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageSkeleton } from '@/components/PageSkeleton'
import { ImportEntryForm, type ImportSubmit } from '@/features/imports/ImportEntryForm'
import { ImportTable } from '@/features/imports/ImportTable'
import { WastageForm, type WastageSubmit } from '@/features/imports/WastageForm'
import { WastageTable } from '@/features/imports/WastageTable'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { RawMaterialImport, WastageEntry } from '@/types'
import { activeProducts, bagKgOf } from '@/utils/products'
import { buildImportRows, importTotals, todaysImports } from '@/utils/imports'
import { allRawMaterialStock, buildWastageRows } from '@/utils/rawMaterial'
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
  const { data, loading, update } = useAppData()
  const { print } = usePrint()
  const [productFilter, setProductFilter] = useState(ALL)

  const products = useMemo(() => activeProducts(data.products), [data.products])

  const allRows = useMemo(
    () => buildImportRows(data.rawMaterialImports, data.products),
    [data.rawMaterialImports, data.products],
  )
  const rows = useMemo(
    () => allRows.filter((r) => productFilter === ALL || r.productId === productFilter),
    [allRows, productFilter],
  )

  const totals = useMemo(() => importTotals(data.rawMaterialImports), [data.rawMaterialImports])
  const todayTotals = useMemo(
    () => importTotals(todaysImports(data.rawMaterialImports, todayISO())),
    [data.rawMaterialImports],
  )

  const rawStock = useMemo(
    () =>
      allRawMaterialStock(
        data.products,
        data.rawMaterialImports,
        data.wastageEntries,
        data.productionEntries,
        (meshId) => bagKgOf(data.meshSizes, meshId),
      ),
    [data.products, data.rawMaterialImports, data.wastageEntries, data.productionEntries, data.meshSizes],
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

  const wastageRows = useMemo(
    () =>
      buildWastageRows(data.wastageEntries, data.products).filter(
        (r) => productFilter === ALL || r.productId === productFilter,
      ),
    [data.wastageEntries, data.products, productFilter],
  )

  const addEntry = useCallback(
    (values: ImportSubmit) => {
      const entry: RawMaterialImport = {
        id: uid(),
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

      update('rawMaterialImports', [entry, ...data.rawMaterialImports])

      const net = values.grossWeightKg - values.tareWeightKg
      toast.success('Import recorded', {
        description: `Net weight ${formatNumber(net)} kg (${formatTons(net / 1000)} Ton)`,
      })
    },
    [data.rawMaterialImports, update],
  )

  const deleteEntry = useCallback(
    (id: string) => {
      update(
        'rawMaterialImports',
        data.rawMaterialImports.filter((entry) => entry.id !== id),
      )
      toast.success('Entry deleted')
    },
    [data.rawMaterialImports, update],
  )

  const addWastage = useCallback(
    (values: WastageSubmit) => {
      const entry: WastageEntry = {
        id: uid(),
        date: values.date,
        productId: values.productId,
        quantityKg: values.quantityKg,
        reason: values.reason?.trim() || undefined,
        createdAt: now(),
      }

      update('wastageEntries', [entry, ...data.wastageEntries])
      toast.success('Wastage recorded', { description: `${formatNumber(values.quantityKg)} kg deducted from available stock` })
    },
    [data.wastageEntries, update],
  )

  const deleteWastage = useCallback(
    (id: string) => {
      update('wastageEntries', data.wastageEntries.filter((entry) => entry.id !== id))
      toast.success('Entry deleted')
    },
    [data.wastageEntries, update],
  )

  const printRegister = useCallback(() => {
    print({
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
    })
  }, [rows, totals, print])

  if (loading) return <PageSkeleton />

  if (data.products.length === 0) {
    return (
      <div>
        <PageHeader title="Raw Material Import" />
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
      <PageHeader
        title="Raw Material Import"
        description="Limestone received from a ship, weighed gross and tare — net weight is worked out for you."
        actions={
          <Button variant="outline" size="sm" onClick={printRegister} disabled={rows.length === 0}>
            <Printer />
            Print register
          </Button>
        }
      />

      <StatGrid columns={4} className="mb-4">
        <StatCard
          label="Today's import"
          icon={Factory}
          accent="primary"
          value={<Num value={todayTotals.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />}
        />
        <StatCard
          label="Total imported"
          icon={Scale}
          accent="brass"
          value={<Num value={totals.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />}
          footer={<span className="text-2xs text-muted-foreground">{totals.entryCount} entries</span>}
        />
        <StatCard
          label="Available raw material"
          icon={Scale}
          accent="primary"
          value={<Num value={rawStock.reduce((s, r) => s + r.availableTon, 0)} suffix="Ton" size="2xl" className="font-bold" />}
          footer={<span className="text-2xs text-muted-foreground">Imported − Wastage − Bagged</span>}
        />
        <StatCard
          label="Total wastage"
          icon={TriangleAlert}
          accent="brass"
          value={<Num value={data.wastageEntries.reduce((s, w) => s + w.quantityKg, 0) / 1000} suffix="Ton" size="2xl" className="font-bold" />}
          footer={<span className="text-2xs text-muted-foreground">{data.wastageEntries.length} entries</span>}
        />
      </StatGrid>

      {rawStock.some((s) => s.averageCostPerTon) && (
        <Section title="Average raw material cost" description="Weighted by net tons, over every priced import." className="mb-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rawStock.filter((s) => s.averageCostPerTon).map((s) => (
              <div key={s.productId} className="rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5">
                <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{s.productName}</p>
                <Money value={s.averageCostPerTon ?? 0} size="lg" weight="bold" className="mt-1" />
                <span className="ml-1 text-2xs text-muted-foreground">/ Ton avg. · {formatTons(s.availableTon)} available</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      <div className="mb-4 max-w-xs">
        <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Filter by limestone type</label>
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <TabContainer contentBackgroundDesign="Transparent" headerBackgroundDesign="Transparent">
        <Tab text="Imports">
          <div className="pt-4">
            <div className="mb-4">
              <ImportEntryForm products={products} pricesForProduct={pricesForProduct} onSubmit={addEntry} />
            </div>
            <ImportTable rows={rows} onDelete={deleteEntry} />
          </div>
        </Tab>

        <Tab text="Wastage">
          <div className="pt-4">
            <div className="mb-4">
              <WastageForm products={products} onSubmit={addWastage} />
            </div>
            <WastageTable rows={wastageRows} onDelete={deleteWastage} />
          </div>
        </Tab>
      </TabContainer>
    </div>
  )
}
