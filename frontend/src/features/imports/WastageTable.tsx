import { useState } from 'react'
import { Lock, Search, Trash2, TriangleAlert, Undo2 } from 'lucide-react'
import type { WastageRow } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/SortableHead'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ReverseDialog } from '@/components/ReverseDialog'
import { Badge } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { CREATED, useSortableSearch } from '@/hooks/useSortableSearch'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate, formatNumber, formatTons } from '@/utils/format'

export function WastageTable({
  rows,
  onDelete,
  lockReason = () => undefined,
  onReverse,
}: {
  rows: WastageRow[]
  onDelete: (id: string) => void | Promise<void>
  /**
   * Why an entry can no longer be deleted, if it can't — reversed, or inside
   * a closed shipment cycle. The server refuses both regardless; this only
   * keeps the button from being offered.
   */
  lockReason?: (row: WastageRow) => string | undefined
  /** Admin correction for a locked entry — see InventoryService::reverseConsumption(). */
  onReverse?: (row: WastageRow, input: { reason: string; date: string }) => Promise<void>
}) {
  const canDelete = usePermission(PERMISSIONS.RAW_MATERIAL_DELETE)
  const canReverse = usePermission(PERMISSIONS.RAW_MATERIAL_REVERSE) && onReverse !== undefined
  const [pendingDelete, setPendingDelete] = useState<WastageRow | null>(null)
  const [pendingReverse, setPendingReverse] = useState<WastageRow | null>(null)

  const { search, setSearch, sortKey, direction, toggleSort, rows: sorted } = useSortableSearch({
    rows,
    searchText: (r) => `${r.productName} ${r.reason ?? ''}`,
    sorters: {
      date: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
      product: (a, b) => a.productName.localeCompare(b.productName),
      quantity: (a, b) => a.quantityKg - b.quantityKg,
    },
    defaultSortKey: CREATED,
  })

  // Reversed entries stay listed (marked) but are not counted.
  const counted = rows.filter((r) => !r.reversedOn)
  const totalKg = counted.reduce((s, r) => s + r.quantityKg, 0)

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
                <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                  {row.reversedOn && (
                    <Badge variant="outline" className="mr-1.5" title={row.reversalReason ?? undefined}>
                      Reversed {formatDate(row.reversedOn)}
                    </Badge>
                  )}
                  {row.reason || '—'}
                </TableCell>
                <TableCell numeric>
                  <div className="flex justify-end gap-1">
                    {canReverse && !row.reversedOn && lockReason(row) && (
                      <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setPendingReverse(row)} aria-label="Reverse entry" title="Reverse entry (Admin correction)">
                        <Undo2 />
                      </Button>
                    )}
                    {lockReason(row) && (
                      <span className="grid h-6 w-6 place-items-center text-muted-foreground" title={lockReason(row)} aria-label={lockReason(row)}>
                        <Lock className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {canDelete && !lockReason(row) && (
                      <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setPendingDelete(row)} aria-label="Delete entry">
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={2} className="text-2xs font-semibold uppercase tracking-wider">Total ({counted.length})</TableCell>
              <TableCell numeric className="font-mono tabular font-bold text-destructive">{formatNumber(totalKg)}</TableCell>
              <TableCell numeric className="font-mono tabular font-bold">{formatTons(totalKg / 1000)}</TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          </TableFooter>
        </Table>
      )}

      <ReverseDialog
        open={pendingReverse !== null}
        onOpenChange={(open) => !open && setPendingReverse(null)}
        title="Reverse this wastage entry?"
        description={
          <>
            The entry stays on record, marked Reversed. On the reversal date its{' '}
            {pendingReverse ? `${formatTons(pendingReverse.quantityTon)} Ton` : ''} return to raw stock in the open shipment cycle — the
            closed cycle keeps its figures. This cannot be undone.
          </>
        }
        confirmLabel="Reverse entry"
        onReverse={async (input) => {
          if (pendingReverse && onReverse) await onReverse(pendingReverse, input)
        }}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this wastage entry?"
        description="This removes it from the register and adds the quantity back to available stock. This cannot be undone."
        confirmLabel="Delete entry"
        onConfirm={async () => {
          if (pendingDelete) await onDelete(pendingDelete.id)
        }}
      />
    </Section>
  )
}
