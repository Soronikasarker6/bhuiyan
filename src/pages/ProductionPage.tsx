import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes, Factory, Package, Receipt, Scale, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { TabContainer } from '@ui5/webcomponents-react/TabContainer'
import { Tab } from '@ui5/webcomponents-react/Tab'
import type { TabContainerPropTypes } from '@ui5/webcomponents-react/TabContainer'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/PageSkeleton'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ProductionEntryForm, type ProductionSubmit } from '@/features/production/ProductionEntryForm'
import { MeshStockSummary } from '@/features/production/MeshStockSummary'
import { ProductionStockTable, type StockLedgerDisplayRow } from '@/features/production/ProductionStockTable'
import { useAppData } from '@/hooks/useAppData'
import type { ProductionEntry } from '@/types'
import { activeProducts, activeMeshSizes, meshSizeNameOf } from '@/utils/products'
import {
  buildStockLedger,
  meshStockSummary,
  productionRowsForProduct,
  todaysProductionBags,
  todaysSoldBags,
  totalProductionBags,
  totalStockBags,
  totalStockTon,
} from '@/utils/productionStock'
import { formatDate, formatNumber, todayISO } from '@/utils/format'
import { now, uid } from '@/utils/id'

/**
 * Production & Stock — how much of each limestone is bagged, mesh by mesh,
 * and how much is left.
 *
 * Deliberately separate from Raw Material Import (how much arrived) and from
 * Sales (who bought what) — this page only answers "what's in the yard right
 * now", and the only thing it reads from Sales is a read-only count of bags
 * sold, never an amount or a customer.
 */
export default function ProductionPage() {
  const { data, loading, update } = useAppData()

  const products = useMemo(() => activeProducts(data.products), [data.products])
  const meshSizes = useMemo(() => activeMeshSizes(data.meshSizes), [data.meshSizes])

  const [activeProductId, setActiveProductId] = useState(products[0]?.id ?? '')
  const selectedProductId = products.some((p) => p.id === activeProductId) ? activeProductId : products[0]?.id ?? ''
  const [pendingDelete, setPendingDelete] = useState<ProductionEntry | null>(null)

  const today = todayISO()

  const meshStock = useMemo(
    () =>
      selectedProductId
        ? meshStockSummary(selectedProductId, data.meshSizes, data.productionEntries, data.saleItems, data.sales)
        : [],
    [selectedProductId, data.meshSizes, data.productionEntries, data.saleItems, data.sales],
  )

  const ledgerRows: StockLedgerDisplayRow[] = useMemo(() => {
    if (!selectedProductId) return []

    const rows: StockLedgerDisplayRow[] = []
    for (const mesh of meshSizes) {
      const { rows: meshRows } = buildStockLedger(selectedProductId, mesh.id, data.productionEntries, data.saleItems, data.sales)
      for (const row of meshRows) {
        rows.push({ ...row, meshName: mesh.name, bagKg: mesh.bagKg })
      }
    }
    return rows.sort((a, b) => (a.date === b.date ? a.meshName.localeCompare(b.meshName) : a.date < b.date ? 1 : -1))
  }, [selectedProductId, meshSizes, data.productionEntries, data.saleItems, data.sales])

  const todayBags = todaysProductionBags(data.productionEntries, today, selectedProductId)
  const totalBags = totalProductionBags(data.productionEntries, selectedProductId)
  const todaySold = todaysSoldBags(data.saleItems, data.sales, today, selectedProductId)
  const stockBags = totalStockBags(meshStock)
  const stockTon = totalStockTon(meshStock)

  const rawEntries = useMemo(
    () => (selectedProductId ? productionRowsForProduct(selectedProductId, data.productionEntries) : []),
    [selectedProductId, data.productionEntries],
  )

  const addEntry = useCallback(
    (values: ProductionSubmit) => {
      const entry: ProductionEntry = {
        id: uid(),
        date: values.date,
        productId: values.productId,
        meshId: values.meshId,
        bags: values.bags,
        notes: values.notes?.trim() || undefined,
        createdAt: now(),
      }

      update('productionEntries', [entry, ...data.productionEntries])
      toast.success('Production recorded', { description: `${formatNumber(values.bags)} bags` })
    },
    [data.productionEntries, update],
  )

  const deleteEntry = useCallback(
    (id: string) => {
      update('productionEntries', data.productionEntries.filter((entry) => entry.id !== id))
      toast.success('Entry deleted', { description: 'Stock has been recalculated.' })
    },
    [data.productionEntries, update],
  )

  if (loading) return <PageSkeleton />

  if (data.products.length === 0) {
    return (
      <div>
        <PageHeader title="Production & Stock" />
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

  if (meshSizes.length === 0) {
    return (
      <div>
        <PageHeader title="Production & Stock" />
        <Section>
          <EmptyState
            icon={Scale}
            size="lg"
            title="No mesh sizes set up"
            description="Add the mesh sizes your yard bags into before recording production."
            action={
              <Button asChild>
                <Link to="/products">Add a mesh size</Link>
              </Button>
            }
          />
        </Section>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Production & Stock" description="Today's bagging, mesh by mesh, and what's left in the yard." />

      {/* A product selector, not N independent panels — every stat below is
          already keyed off `selectedProductId`, so each `Tab` only needs to
          hold a label; UI5's TabContainer keeps every tab's content mounted
          at once (unlike Radix's Tabs), so per-product content would
          otherwise render identically in every tab. */}
      <TabContainer
        contentBackgroundDesign="Transparent"
        headerBackgroundDesign="Transparent"
        className="mb-4"
        onTabSelect={((e) => {
          const product = products[e.detail.tabIndex]
          if (product) setActiveProductId(product.id)
        }) as TabContainerPropTypes['onTabSelect']}
      >
        {products.map((product) => (
          <Tab key={product.id} text={product.name} selected={product.id === selectedProductId} />
        ))}
      </TabContainer>

      <StatGrid className="mb-4">
        <StatCard label="Today's production" icon={Factory} accent="primary" value={<Num value={todayBags} suffix="Bag" size="2xl" className="font-bold" />} />
        <StatCard label="Total production" icon={Boxes} accent="brass" value={<Num value={totalBags} suffix="Bag" size="2xl" className="font-bold" />} />
        <StatCard label="Today's sales" icon={Receipt} accent="success" value={<Num value={todaySold} suffix="Bag" size="2xl" className="font-bold" />} />
        <StatCard
          label="Current stock"
          icon={Scale}
          accent={stockBags <= 0 ? 'primary' : 'success'}
          value={<Num value={stockBags} suffix="Bag" size="2xl" className="font-bold" tone={stockBags <= 0 ? 'negative' : 'neutral'} />}
          footer={<span className="text-2xs text-muted-foreground">{formatNumber(stockTon)} Ton total</span>}
        />
      </StatGrid>

      <div className="mb-4">
        <MeshStockSummary rows={meshStock} />
      </div>

      <div className="mb-4">
        <ProductionEntryForm products={products} meshSizes={meshSizes} onSubmit={addEntry} />
      </div>

      <div className="mb-4">
        <Section title="Production entries" description={`${rawEntries.length} entries for this product`} noPadding>
          {rawEntries.length === 0 ? (
            <EmptyState icon={Boxes} size="sm" title="No entries yet" description="Record today's bagging above to see it here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mesh</TableHead>
                  <TableHead numeric>Bags</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rawEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(entry.date)}</TableCell>
                    <TableCell className="font-medium">{meshSizeNameOf(data.meshSizes, entry.meshId)}</TableCell>
                    <TableCell numeric>{formatNumber(entry.bags)}</TableCell>
                    <TableCell className="max-w-[16rem] truncate text-muted-foreground">{entry.notes || '—'}</TableCell>
                    <TableCell numeric>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingDelete(entry)}
                        aria-label="Delete entry"
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>

      <ProductionStockTable rows={ledgerRows} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this production entry?"
        description="This removes it from the register and reduces available stock. This cannot be undone."
        confirmLabel="Delete entry"
        onConfirm={() => {
          if (pendingDelete) deleteEntry(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
