import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Factory, Package, Printer, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/PageSkeleton'
import { ImportEntryForm, type ImportSubmit } from '@/features/imports/ImportEntryForm'
import { ImportTable } from '@/features/imports/ImportTable'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { RawMaterialImport } from '@/types'
import { activeProducts } from '@/utils/products'
import { buildImportRows, importTotals, todaysImports } from '@/utils/imports'
import { formatDate, formatNumber, formatTons, todayISO } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Raw Material Import — how much limestone arrived, from which ship, on
 * which truck.
 *
 * This is upstream of Production & Stock: it never asks which mesh a bag was
 * packed into, only how much raw material was received at the yard. The
 * bagging of that material into mesh sizes happens on the Production & Stock
 * page.
 */
export default function ImportPage() {
  const { data, loading, update } = useAppData()
  const { print } = usePrint()

  const products = useMemo(() => activeProducts(data.products), [data.products])

  const rows = useMemo(
    () => buildImportRows(data.rawMaterialImports, data.products),
    [data.rawMaterialImports, data.products],
  )

  const totals = useMemo(() => importTotals(data.rawMaterialImports), [data.rawMaterialImports])
  const todayTotals = useMemo(
    () => importTotals(todaysImports(data.rawMaterialImports, todayISO())),
    [data.rawMaterialImports],
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

      <StatGrid columns={2} className="mb-4">
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
      </StatGrid>

      <div className="mb-4">
        <ImportEntryForm products={products} onSubmit={addEntry} />
      </div>

      <ImportTable rows={rows} onDelete={deleteEntry} />
    </div>
  )
}
