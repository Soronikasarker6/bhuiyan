import { useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Factory, Package, Printer, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProductionEntryForm, type ProductionSubmit } from '@/features/production/ProductionEntryForm'
import { ProductionTable } from '@/features/production/ProductionTable'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { ProductionEntry } from '@/types'
import { activeProducts } from '@/utils/products'
import { buildProductionRows, productionTotals, todaysProduction } from '@/utils/production'
import { productStock, totalStock } from '@/utils/stock'
import { formatDate, formatNumber, formatTons, todayISO } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Production — how much stone we made.
 *
 * Deliberately separate from Sales: this page never asks who a load was sold
 * to or at what rate. It answers one question — gross weight in, tare weight
 * out, net weight recorded — and the available-stock table below it is the
 * only place this page and Sales meet, and only as a read-only total.
 */
export default function ProductionPage() {
  const { data, loading, update } = useAppData()
  const { print } = usePrint()

  const products = useMemo(() => activeProducts(data.products), [data.products])

  const rows = useMemo(
    () => buildProductionRows(data.productionEntries, data.products),
    [data.productionEntries, data.products],
  )

  const totals = useMemo(() => productionTotals(data.productionEntries), [data.productionEntries])
  const todayTotals = useMemo(
    () => productionTotals(todaysProduction(data.productionEntries, todayISO())),
    [data.productionEntries],
  )

  const stock = useMemo(
    () => productStock(data.products, data.productionEntries, data.saleItems),
    [data.products, data.productionEntries, data.saleItems],
  )
  const stockTotals = useMemo(() => totalStock(stock), [stock])

  const addEntry = useCallback(
    (values: ProductionSubmit) => {
      const entry: ProductionEntry = {
        id: uid(),
        date: values.date,
        productId: values.productId,
        grossWeightKg: values.grossWeightKg,
        tareWeightKg: values.tareWeightKg,
        notes: values.notes?.trim() || undefined,
        createdAt: now(),
      }

      update('productionEntries', [entry, ...data.productionEntries])

      const net = values.grossWeightKg - values.tareWeightKg
      toast.success('Production recorded', {
        description: `Net weight ${formatNumber(net)} kg (${formatTons(net / 1000)} Ton)`,
      })
    },
    [data.productionEntries, update],
  )

  const deleteEntry = useCallback(
    (id: string) => {
      update(
        'productionEntries',
        data.productionEntries.filter((entry) => entry.id !== id),
      )
      toast.success('Entry deleted', { description: 'Available stock has been recalculated.' })
    },
    [data.productionEntries, update],
  )

  const printRegister = useCallback(() => {
    print({
      title: 'Production Register',
      subtitle: `${rows.length} entries`,
      meta: [
        { label: 'Total gross weight', value: `${formatNumber(totals.grossWeightKg)} kg` },
        { label: 'Total tare weight', value: `${formatNumber(totals.tareWeightKg)} kg` },
        { label: 'Total net weight', value: `${formatNumber(totals.netWeightKg)} kg (${formatTons(totals.netWeightTon)} Ton)` },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'product', label: 'Product' },
        { key: 'gross', label: 'Gross (kg)', align: 'right' },
        { key: 'tare', label: 'Tare (kg)', align: 'right' },
        { key: 'net', label: 'Net (kg)', align: 'right' },
        { key: 'notes', label: 'Notes' },
      ],
      rows: [...rows].reverse().map((r) => ({
        date: formatDate(r.date),
        product: r.productName,
        gross: formatNumber(r.grossWeightKg),
        tare: formatNumber(r.tareWeightKg),
        net: formatNumber(r.netWeightKg),
        notes: r.notes ?? '',
      })),
      totals: {
        date: 'Total',
        gross: formatNumber(totals.grossWeightKg),
        tare: formatNumber(totals.tareWeightKg),
        net: formatNumber(totals.netWeightKg),
      },
    })
  }, [rows, totals, print])

  if (loading) return <PageSkeleton />

  if (data.products.length === 0) {
    return (
      <div>
        <PageHeader title="Production" />
        <Section>
          <EmptyState
            icon={Package}
            size="lg"
            title="No products set up"
            description="Add your first stone type before recording production."
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
        title="Production"
        description="Gross weight in, tare weight out — net weight is worked out for you."
        actions={
          <Button variant="outline" size="sm" onClick={printRegister} disabled={rows.length === 0}>
            <Printer />
            Print register
          </Button>
        }
      />

      <StatGrid className="mb-4">
        <StatCard
          label="Today's production"
          icon={Factory}
          accent="primary"
          value={<Num value={todayTotals.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />}
        />
        <StatCard
          label="Total production"
          icon={Scale}
          accent="brass"
          value={<Num value={totals.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />}
          footer={<span className="text-2xs text-muted-foreground">{totals.entryCount} entries</span>}
        />
        <StatCard
          label="Total sold"
          icon={Boxes}
          accent="success"
          value={<Num value={stockTotals.soldTon} suffix="Ton" size="2xl" className="font-bold" />}
        />
        <StatCard
          label="Available stock"
          icon={Boxes}
          accent={stockTotals.availableTon < 0 ? 'primary' : 'success'}
          value={
            <Num
              value={stockTotals.availableTon}
              suffix="Ton"
              size="2xl"
              className="font-bold"
              tone={stockTotals.availableTon < 0 ? 'negative' : 'neutral'}
            />
          }
        />
      </StatGrid>

      <div className="mb-4 grid gap-4 xl:grid-cols-[27rem_minmax(0,1fr)]">
        <ProductionEntryForm products={products} onSubmit={addEntry} />

        <Section title="Available stock" description="Produced minus sold, per product" noPadding>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead numeric>Produced</TableHead>
                <TableHead numeric>Sold</TableHead>
                <TableHead numeric>Available</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stock.map((s) => (
                <TableRow key={s.productId}>
                  <TableCell className="font-medium">{s.productName}</TableCell>
                  <TableCell numeric>{formatTons(s.producedTon)}</TableCell>
                  <TableCell numeric className="text-muted-foreground">
                    {formatTons(s.soldTon)}
                  </TableCell>
                  <TableCell
                    numeric
                    className={s.availableTon < 0 ? 'font-semibold text-destructive' : 'font-semibold text-success-700'}
                  >
                    {formatTons(s.availableTon)} {s.unit}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      </div>

      <ProductionTable rows={rows} onDelete={deleteEntry} />
    </div>
  )
}
