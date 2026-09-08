import type { MeshStock } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Scale } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber, formatTons } from '@/utils/format'

/** The §9 stock breakdown for one product: Mesh → Bag Weight → Stock. */
export function MeshStockSummary({ rows }: { rows: MeshStock[] }) {
  return (
    <Section title="Mesh-wise stock" description="Where this product's stock stands right now, mesh by mesh" noPadding>
      {rows.length === 0 ? (
        <EmptyState icon={Scale} size="sm" title="No mesh sizes configured" description="Add a mesh size in Products & Mesh Sizes." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mesh</TableHead>
              <TableHead numeric>Bag Weight</TableHead>
              <TableHead numeric>Stock (Bag)</TableHead>
              <TableHead numeric>Stock (KG)</TableHead>
              <TableHead numeric>Stock (Ton)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.meshId}>
                <TableCell className="font-medium">{row.meshName}</TableCell>
                <TableCell numeric className="text-muted-foreground">
                  {row.bagKg} kg
                </TableCell>
                <TableCell numeric className={row.stockBags <= 0 ? 'text-destructive' : 'font-semibold text-success-700'}>
                  {formatNumber(row.stockBags)}
                </TableCell>
                <TableCell numeric className="text-muted-foreground">
                  {formatNumber(row.stockKg)}
                </TableCell>
                <TableCell numeric className="text-muted-foreground">
                  {formatTons(row.stockTon)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  )
}
