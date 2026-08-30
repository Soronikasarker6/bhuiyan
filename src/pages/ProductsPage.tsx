import { useMemo } from 'react'
import { Package, Scale } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Num } from '@/components/Money'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { ProductManager } from '@/features/products/ProductManager'
import { MeshSizeManager } from '@/features/products/MeshSizeManager'
import { useAppData } from '@/hooks/useAppData'
import { activeProducts, activeMeshSizes } from '@/utils/products'

/**
 * Products & mesh sizes.
 *
 * Everything a production or sales form offers comes from these two lists.
 * Adding a new stone type, or a new mesh size, is a form here — never a code
 * change, which is the whole point of this page existing.
 */
export default function ProductsPage() {
  const { data, loading, update } = useAppData()

  const productUsage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of data.productionEntries) {
      counts.set(entry.productId, (counts.get(entry.productId) ?? 0) + 1)
    }
    for (const item of data.saleItems) {
      counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1)
    }
    return counts
  }, [data.productionEntries, data.saleItems])

  const meshUsage = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of data.saleItems) {
      if (!item.meshSizeId) continue
      counts.set(item.meshSizeId, (counts.get(item.meshSizeId) ?? 0) + 1)
    }
    return counts
  }, [data.saleItems])

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Products & Mesh Sizes"
        description="Configurable lists — every entry form on the site reads from these. Nothing here needs a code change to grow."
      />

      <StatGrid columns={3} className="mb-4">
        <StatCard
          label="Active products"
          icon={Package}
          accent="primary"
          value={<Num value={activeProducts(data.products).length} size="2xl" className="font-bold" />}
          footer={<span className="text-2xs text-muted-foreground">{data.products.length} total</span>}
        />
        <StatCard
          label="Active mesh sizes"
          icon={Scale}
          accent="brass"
          value={<Num value={activeMeshSizes(data.meshSizes).length} size="2xl" className="font-bold" />}
          footer={<span className="text-2xs text-muted-foreground">{data.meshSizes.length} total</span>}
        />
        <StatCard
          label="Production + sales records"
          icon={Package}
          accent="success"
          value={
            <Num
              value={data.productionEntries.length + data.saleItems.length}
              size="2xl"
              className="font-bold"
            />
          }
        />
      </StatGrid>

      <Tabs defaultValue="products">
        <TabsList className="mb-1">
          <TabsTrigger value="products">
            <Package className="h-3.5 w-3.5" />
            Products
          </TabsTrigger>
          <TabsTrigger value="mesh">
            <Scale className="h-3.5 w-3.5" />
            Mesh / Attributes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          <ProductManager
            products={data.products}
            usageOf={(id) => productUsage.get(id) ?? 0}
            onChange={(next) => update('products', next)}
          />
        </TabsContent>

        <TabsContent value="mesh">
          <MeshSizeManager
            meshSizes={data.meshSizes}
            usageOf={(id) => meshUsage.get(id) ?? 0}
            onChange={(next) => update('meshSizes', next)}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
