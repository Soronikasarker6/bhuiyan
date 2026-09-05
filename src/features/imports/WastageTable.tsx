import { useState } from 'react'
import { Search, Trash2, TriangleAlert } from 'lucide-react'
import type { WastageRow } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/SortableHead'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useSortableSearch } from '@/hooks/useSortableSearch'
import { formatDate, formatNumber, formatTons } from '@/utils/format'

export function WastageTable({
  rows,
  onDelete,
}: {
  rows: WastageRow[]
  onDelete: (id: string) => void
}) {
  const [pendingDelete, setPendingDelete] = useState<WastageRow | null>(null)

  const { search, setSearch, sortKey, direction, toggleSort, rows: sorted } = useSortableSearch({
    rows,
    searchText: (r) => `${r.productName} ${r.reason ?? ''}`,
    sorters: {
      date: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
      product: (a, b) => a.productName.localeCompare(b.productName),
      quantity: (a, b) => a.quantityKg - b.quantityKg,
    },
    defaultSortKey: 'date',
  })

  const totalKg = rows.reduce((s, r) => s + r.quantityKg, 0)

  return (
    <Section
      title="Wastage register"
      description={`${rows.length} entries · deducted from raw material stock`}
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, reason…"
            className="h-8 w-52 pl-8 text-xs"
          />
        </div>
      }
      noPadding
    >
      {rows.length === 0 ? (
        <EmptyState icon={TriangleAlert} size="sm" title="No wastage recorded" description="Anything lost before it became a bag goes here." />
      ) : sorted.length === 0 ? (
        <EmptyState icon={Search} size="sm" title="No matches" description="Try a different search." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Date" sortKey="date" activeKey={sortKey} direction={direction} onSort={toggleSort} />
              <SortableHead label="Product" sortKey="product" activeKey={sortKey} direction={direction} onSort={toggleSort} />
              <SortableHead label="Quantity (kg)" sortKey="quantity" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
              <TableHead numeric>Ton</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.date)}</TableCell>
                <TableCell className="font-medium">{row.productName}</TableCell>
                <TableCell numeric className="font-semibold text-destructive">{formatNumber(row.quantityKg)}</TableCell>
                <TableCell numeric className="font-mono tabular text-muted-foreground">{formatTons(row.quantityTon)}</TableCell>
                <TableCell className="max-w-[16rem] truncate text-muted-foreground">{row.reason || '—'}</TableCell>
                <TableCell numeric>
                  <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setPendingDelete(row)} aria-label="Delete entry">
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={2} className="text-2xs font-semibold uppercase tracking-wider">Total ({rows.length})</TableCell>
              <TableCell numeric className="font-mono tabular font-bold text-destructive">{formatNumber(totalKg)}</TableCell>
              <TableCell numeric className="font-mono tabular font-bold">{formatTons(totalKg / 1000)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this wastage entry?"
        description="This removes it from the register and adds the quantity back to available stock. This cannot be undone."
        confirmLabel="Delete entry"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </Section>
  )
}
