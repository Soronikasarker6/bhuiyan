import { useState } from 'react'
import { Search, Trash2 } from 'lucide-react'
import type { ProductionRow } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/SortableHead'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useSortableSearch } from '@/hooks/useSortableSearch'
import { formatDate, formatNumber, formatTons } from '@/utils/format'
import { Factory } from 'lucide-react'

const PAGE_SIZE = 25

export function ProductionTable({
  rows,
  onDelete,
}: {
  rows: ProductionRow[]
  onDelete: (id: string) => void
}) {
  const [page, setPage] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<ProductionRow | null>(null)

  const { search, setSearch, sortKey, direction, toggleSort, rows: sorted } = useSortableSearch({
    rows,
    searchText: (r) => `${r.productName} ${r.notes ?? ''}`,
    sorters: {
      date: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
      product: (a, b) => a.productName.localeCompare(b.productName),
      gross: (a, b) => a.grossWeightKg - b.grossWeightKg,
      tare: (a, b) => a.tareWeightKg - b.tareWeightKg,
      net: (a, b) => a.netWeightKg - b.netWeightKg,
    },
    defaultSortKey: 'date',
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <Section
      title="Production register"
      description={`${rows.length} entries · net weight is always gross − tare`}
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search product or notes…"
            className="h-8 w-48 pl-8 text-xs"
          />
        </div>
      }
      noPadding
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={Factory}
          size="sm"
          title="No production recorded yet"
          description="Record today's gross and tare weight above to see it here."
        />
      ) : sorted.length === 0 ? (
        <EmptyState icon={Search} size="sm" title="No matches" description="Try a different search." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead label="Date" sortKey="date" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableHead label="Product" sortKey="product" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableHead label="Gross (kg)" sortKey="gross" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <SortableHead label="Tare (kg)" sortKey="tare" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <SortableHead label="Net weight" sortKey="net" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <TableHead>Notes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.date)}</TableCell>
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell numeric>{formatNumber(row.grossWeightKg)}</TableCell>
                  <TableCell numeric>{formatNumber(row.tareWeightKg)}</TableCell>
                  <TableCell numeric className="font-semibold text-success-700">
                    {formatNumber(row.netWeightKg)} kg
                    <span className="ml-1.5 font-normal text-2xs text-muted-foreground">
                      ({formatTons(row.netWeightTon)}t)
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[12rem] truncate text-muted-foreground">{row.notes || '—'}</TableCell>
                  <TableCell numeric>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(row)}
                      aria-label="Delete entry"
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-2xs text-muted-foreground">
              <span>
                Page {page + 1} of {totalPages}
              </span>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this production entry?"
        description="This removes it from the register and reduces the product's available stock. This cannot be undone."
        confirmLabel="Delete entry"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </Section>
  )
}
