import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Receipt, Search, Trash2 } from 'lucide-react'
import type { SaleSummary } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { ExportMenu } from '@/components/ExportMenu'
import { Money } from '@/components/Money'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/SortableHead'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useSortableSearch } from '@/hooks/useSortableSearch'
import { usePermission } from '@/hooks/useAuth'
import { PERMISSIONS } from '@/constants/permissions'
import { formatCurrency, formatDate, formatTons } from '@/utils/format'
import { itemsBagsTotal } from '@/utils/sales'
import { SALE_STATUS_LABEL, SALE_STATUS_VARIANT } from '@/constants/saleStatus'

/** A single-item invoice can show that item's own figure directly; a multi-item one can't collapse to one value. */
function itemFieldOrMultiple(sale: SaleSummary, field: 'productName' | 'meshSizeName'): string {
  if (sale.items.length === 0) return '—'
  if (sale.items.length === 1) return sale.items[0][field]
  return 'Multiple'
}

const PAGE_SIZE = 20

export function SalesTable({
  sales,
  onDelete,
  onExportCsv,
  onExportPdf,
}: {
  sales: SaleSummary[]
  onDelete: (saleId: string) => void
  onExportCsv: (sale: SaleSummary) => void
  onExportPdf: (sale: SaleSummary) => void
}) {
  const canDelete = usePermission(PERMISSIONS.SALES_DELETE)
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SaleSummary | null>(null)

  const { search, setSearch, sortKey, direction, toggleSort, rows: sorted } = useSortableSearch({
    rows: sales,
    searchText: (s) =>
      `${s.invoiceNo} ${s.customerName} ${s.truckNo ?? ''} ${s.items.map((i) => `${i.productName} ${i.meshSizeName}`).join(' ')}`,
    sorters: {
      date: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
      invoice: (a, b) => a.invoiceNo.localeCompare(b.invoiceNo),
      customer: (a, b) => a.customerName.localeCompare(b.customerName),
      ton: (a, b) => a.totalWeightTon - b.totalWeightTon,
      total: (a, b) => a.totalAmount - b.totalAmount,
      paid: (a, b) => a.amountPaid - b.amountPaid,
      due: (a, b) => a.amountDue - b.amountDue,
    },
    defaultSortKey: 'date',
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  return (
    <Section
      title="Sales register"
      description={`${sales.length} invoices`}
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search invoice, customer, truck…"
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>
      }
      noPadding
    >
      {sales.length === 0 ? (
        <EmptyState icon={Receipt} size="sm" title="No sales recorded yet" description="Record the first invoice above." />
      ) : sorted.length === 0 ? (
        <EmptyState icon={Search} size="sm" title="No matches" description="Try a different search." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <SortableHead label="Invoice" sortKey="invoice" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableHead label="Date" sortKey="date" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <SortableHead label="Customer" sortKey="customer" activeKey={sortKey} direction={direction} onSort={toggleSort} />
                <TableHead>Truck</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Mesh / Size</TableHead>
                <TableHead numeric>Qty (Bags)</TableHead>
                <SortableHead label="Billable TON" sortKey="ton" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <TableHead numeric>Rate / Ton</TableHead>
                <SortableHead label="Total" sortKey="total" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <SortableHead label="Paid" sortKey="paid" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <SortableHead label="Due" sortKey="due" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageRows.map((sale) => {
                const isOpen = expanded === sale.id
                return (
                  <Fragment key={sale.id}>
                    <TableRow className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : sale.id)}>
                      <TableCell>
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs font-medium">{sale.invoiceNo}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(sale.date)}</TableCell>
                      <TableCell className="max-w-[10rem] truncate font-medium">{sale.customerName}</TableCell>
                      <TableCell className="font-mono text-2xs text-muted-foreground">{sale.truckNo || '—'}</TableCell>
                      <TableCell className="max-w-[8rem] truncate">{itemFieldOrMultiple(sale, 'productName')}</TableCell>
                      <TableCell className="max-w-[8rem] truncate text-muted-foreground">{itemFieldOrMultiple(sale, 'meshSizeName')}</TableCell>
                      <TableCell numeric>{itemsBagsTotal(sale.items)}</TableCell>
                      <TableCell numeric className="font-medium">{formatTons(sale.totalWeightTon)}</TableCell>
                      <TableCell numeric className="text-muted-foreground">
                        {sale.items.length === 1 ? formatCurrency(sale.items[0].ratePerTon) : 'Multiple'}
                      </TableCell>
                      <TableCell numeric>
                        <Money value={sale.totalAmount} size="sm" weight="semibold" />
                      </TableCell>
                      <TableCell numeric>
                        <Money value={sale.amountPaid} size="sm" tone={sale.amountPaid > 0 ? 'positive' : 'muted'} />
                      </TableCell>
                      <TableCell numeric>
                        <Money value={sale.amountDue} size="sm" tone={sale.amountDue > 0 ? 'negative' : 'positive'} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={SALE_STATUS_VARIANT[sale.status]}>{SALE_STATUS_LABEL[sale.status]}</Badge>
                      </TableCell>
                      <TableCell numeric onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <ExportMenu
                            iconOnly
                            label="Export invoice"
                            onCsv={() => onExportCsv(sale)}
                            onPdf={() => onExportPdf(sale)}
                          />
                          {canDelete && (
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => setPendingDelete(sale)}
                              aria-label="Delete invoice"
                            >
                              <Trash2 />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                        <TableCell colSpan={15} className="p-0">
                          <div className="p-3">
                            <Table containerClassName="rounded-lg border border-border bg-card">
                              <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                  <TableHead>Product</TableHead>
                                  <TableHead>Mesh</TableHead>
                                  <TableHead numeric>Bags</TableHead>
                                  <TableHead numeric>Weight (Ton)</TableHead>
                                  <TableHead numeric>Rate / Ton</TableHead>
                                  <TableHead numeric>Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sale.items.map((item) => (
                                  <TableRow key={item.id} className="hover:bg-transparent">
                                    <TableCell className="font-medium">{item.productName}</TableCell>
                                    <TableCell className="text-muted-foreground">{item.meshSizeName}</TableCell>
                                    <TableCell numeric>{item.bags}</TableCell>
                                    <TableCell numeric>{item.weightTon.toFixed(2)}</TableCell>
                                    <TableCell numeric>{formatCurrency(item.ratePerTon)}</TableCell>
                                    <TableCell numeric className="font-medium">{formatCurrency(item.amount)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            {sale.notes && <p className="mt-2 text-xs text-muted-foreground">Note: {sale.notes}</p>}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
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
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete ${pendingDelete.invoiceNo}?` : ''}
        description="This removes the invoice, its items, and every linked ledger entry (its sale debit and any payments recorded against it) from the customer's account. This cannot be undone."
        confirmLabel="Delete invoice"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id)
          setPendingDelete(null)
        }}
      />
    </Section>
  )
}
