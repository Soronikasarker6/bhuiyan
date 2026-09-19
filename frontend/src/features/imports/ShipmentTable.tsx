import { useState } from 'react'
import { Download, Lock, LockOpen, Search, Ship } from 'lucide-react'
import type { ShipmentCycleRow } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/SortableHead'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useSortableSearch } from '@/hooks/useSortableSearch'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { formatDate, formatDateTime, formatTons } from '@/utils/format'
import { cn } from '@/utils/cn'
import { DEFAULT_TABLE_PAGE_SIZE as PAGE_SIZE } from '@/constants/table'

/**
 * A ton figure with its two decimals always shown (§12) — `Num` rounds to
 * whole numbers, which is right for bags but would quietly throw away the
 * exact weighbridge decimals (10,000.20, 2,500.50 …) this shipment ledger
 * exists to preserve.
 */
function Ton({ value, tone = 'neutral', bold = false }: { value: number; tone?: 'neutral' | 'positive' | 'negative'; bold?: boolean }) {
  const toneClass = tone === 'positive' ? 'text-success-700' : tone === 'negative' ? 'text-primary-700' : 'text-foreground'
  return (
    <span className={cn('font-mono tabular text-[0.8125rem]', bold ? 'font-bold' : 'font-medium', toneClass)}>
      {formatTons(value)}
    </span>
  )
}

/**
 * The shipment history (§1–§8) — one row per raw material's inventory
 * *cycle*, never one per import. Every import received while a cycle is
 * open (see `RawMaterialImport.shipmentId`) folds into its "Total Received"
 * here; closing freezes opening/received/consumed/wastage/closing
 * permanently (`ConfirmDialog` below asks first, the same way a cash month
 * is closed in `ClosingPage`) and hands the closing balance forward as the
 * *next* cycle of the same material's opening balance. Reopening removes
 * the freeze — an explicit, confirmed action, never an accidental edit.
 */
export function ShipmentTable({
  rows,
  onClose,
  onReopen,
  onDownload,
}: {
  rows: ShipmentCycleRow[]
  onClose: (row: ShipmentCycleRow) => void | Promise<void>
  onReopen: (row: ShipmentCycleRow) => void | Promise<void>
  /** The full import history behind one cycle, as a printable/downloadable document (§9). */
  onDownload: (row: ShipmentCycleRow) => void
}) {
  const canEdit = usePermission(PERMISSIONS.RAW_MATERIAL_EDIT)
  const [page, setPage] = useState(0)
  const [closing, setClosing] = useState<ShipmentCycleRow | null>(null)
  const [reopening, setReopening] = useState<ShipmentCycleRow | null>(null)

  const { search, setSearch, sortKey, direction, toggleSort, rows: sorted } = useSortableSearch({
    rows,
    searchText: (r) => `${r.productName} ${r.id}`,
    sorters: {
      date: (a, b) => (a.openedOn === b.openedOn ? 0 : a.openedOn < b.openedOn ? -1 : 1),
      product: (a, b) => a.productName.localeCompare(b.productName),
      received: (a, b) => a.receivedTon - b.receivedTon,
      opening: (a, b) => a.openingTon - b.openingTon,
      consumed: (a, b) => a.consumedTon - b.consumedTon,
      wastage: (a, b) => a.wastageTon - b.wastageTon,
      closing: (a, b) => a.closingTon - b.closingTon,
    },
    defaultSortKey: 'date',
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <Section
      title="Shipment history"
      description={`${rows.length} shipment cycle${rows.length === 1 ? '' : 's'} · every import while one is open counts toward it`}
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search shipment, material…"
            className="h-8 w-52 pl-8 text-xs"
          />
        </div>
      }
      noPadding
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={Ship}
          size="sm"
          title="No shipments recorded yet"
          description="Record a raw material import above to start its inventory cycle here."
        />
      ) : sorted.length === 0 ? (
        <EmptyState icon={Search} size="sm" title="No matches" description="Try a different search." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shipment ID</TableHead>
                <SortableHead label="Raw Material" sortKey="product" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableHead label="Opened / Received Date" sortKey="date" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableHead label="Total Received (Ton)" sortKey="received" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <SortableHead label="Opening (Ton)" sortKey="opening" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <SortableHead label="Consumed (Ton)" sortKey="consumed" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <SortableHead label="Wastage (Ton)" sortKey="wastage" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <SortableHead label="Closing / Current Balance (Ton)" sortKey="closing" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap font-mono text-2xs text-muted-foreground">#{row.id}</TableCell>
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.openedOn)}</TableCell>
                  <TableCell numeric>
                    <Ton value={row.receivedTon} tone="positive" />
                  </TableCell>
                  <TableCell numeric>
                    <Ton value={row.openingTon} />
                  </TableCell>
                  <TableCell numeric>
                    <Ton value={row.consumedTon} tone={row.consumedTon > 0 ? 'negative' : 'neutral'} />
                  </TableCell>
                  <TableCell numeric>
                    <Ton value={row.wastageTon} tone={row.wastageTon > 0 ? 'negative' : 'neutral'} />
                  </TableCell>
                  <TableCell numeric>
                    <Ton value={row.closingTon} tone={row.closingTon < 0 ? 'negative' : 'neutral'} bold />
                  </TableCell>
                  <TableCell>
                    {row.status === 'closed' ? (
                      <Badge variant="success" title={row.closedAt ? `Closed ${formatDateTime(row.closedAt)}` : undefined}>
                        <Lock className="h-2.5 w-2.5" aria-hidden />
                        Closed
                      </Badge>
                    ) : (
                      <Badge variant="outline">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => onDownload(row)}>
                        <Download />
                        Download
                      </Button>
                      {canEdit &&
                        (row.status === 'closed' ? (
                          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => setReopening(row)}>
                            <LockOpen />
                            Reopen
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => setClosing(row)}>
                            <Lock />
                            Close
                          </Button>
                        ))}
                    </div>
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
                <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => !open && setClosing(null)}
        title={closing ? `Close Shipment #${closing.id}?` : ''}
        description="Closing this shipment will finalize this inventory cycle. Future imports of this raw material will create a new shipment cycle, with a new id — never added to this one again."
        confirmLabel="Close Shipment"
        variant="default"
        onConfirm={async () => {
          if (closing) await onClose(closing)
        }}
      >
        {closing && (
          <dl className="rounded-lg border border-border bg-secondary/50 px-3 py-2.5 text-xs">
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-muted-foreground">{closing.productName}</dt>
              <dd className="font-mono tabular font-medium">Shipment #{closing.id}</dd>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-muted-foreground">Opening + Received − Consumed − Wastage</dt>
              <dd className="font-mono tabular font-medium">
                {closing.openingTon.toFixed(2)} + {closing.receivedTon.toFixed(2)} − {closing.consumedTon.toFixed(2)} − {closing.wastageTon.toFixed(2)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <dt className="text-muted-foreground">Current balance</dt>
              <dd>
                <Ton value={closing.closingTon} tone={closing.closingTon < 0 ? 'negative' : 'neutral'} bold />
              </dd>
            </div>
          </dl>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={reopening !== null}
        onOpenChange={(open) => !open && setReopening(null)}
        title={reopening ? `Reopen Shipment #${reopening.id}?` : ''}
        description="Its balance will be recomputed live again from the production and wastage logs, and the next shipment's opening balance will move with it. Use this only to correct a mistake."
        confirmLabel="Reopen shipment"
        onConfirm={async () => {
          if (reopening) await onReopen(reopening)
        }}
      />
    </Section>
  )
}
