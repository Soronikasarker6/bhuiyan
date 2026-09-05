import { Fragment, useState } from 'react'
import { ChevronDown, ChevronRight, Printer, Receipt, Search, Trash2 } from 'lucide-react'
import type { SaleSummary } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { Money } from '@/components/Money'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/SortableHead'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { useSortableSearch } from '@/hooks/useSortableSearch'
import { formatCurrency, formatDate } from '@/utils/format'
import { SALE_STATUS_LABEL, SALE_STATUS_VARIANT } from '@/constants/saleStatus'

const PAGE_SIZE = 20

export function SalesTable({
  sales,
  onDelete,
  onPrint,
}: {
  sales: SaleSummary[]
  onDelete: (saleId: string) => void
  onPrint: (sale: SaleSummary) => void
}) {
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SaleSummary | null>(null)

  const { search, setSearch, sortKey, direction, toggleSort, rows: sorted } = useSortableSearch({
    rows: sales,
    searchText: (s) => `${s.invoiceNo} ${s.customerName} ${s.truckNo ?? ''}`,
    sorters: {
      date: (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0),
      invoice: (a, b) => a.invoiceNo.localeCompare(b.invoiceNo),
      customer: (a, b) => a.customerName.localeCompare(b.customerName),
      total: (a, b) => a.totalAmount - b.totalAmount,
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
                <SortableHead label="Total" sortKey="total" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
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
                      <TableCell numeric>
                        <Money value={sale.totalAmount} size="sm" weight="semibold" />
                      </TableCell>
                      <TableCell numeric>
                        <Money value={sale.amountDue} size="sm" tone={sale.amountDue > 0 ? 'negative' : 'positive'} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={SALE_STATUS_VARIANT[sale.status]}>{SALE_STATUS_LABEL[sale.status]}</Badge>
                      </TableCell>
                      <TableCell numeric onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button size="icon-sm" variant="ghost" onClick={() => onPrint(sale)} aria-label="Print invoice">
                            <Printer />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setPendingDelete(sale)}
                            aria-label="Delete invoice"
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>

                    {isOpen && (
                      <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                        <TableCell colSpan={9} className="p-0">
                          <div className="p-4">
                            <table className="w-full text-[0.8125rem]">
                              <thead>
                                <tr className="text-2xs uppercase tracking-wider text-muted-foreground">
                                  <th className="pb-1.5 text-left font-semibold">Product</th>
                                  <th className="pb-1.5 text-left font-semibold">Mesh</th>
                                  <th className="pb-1.5 text-right font-semibold">Bags</th>
                                  <th className="pb-1.5 text-right font-semibold">Weight (Ton)</th>
                                  <th className="pb-1.5 text-right font-semibold">Rate / Ton</th>
                                  <th className="pb-1.5 text-right font-semibold">Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {sale.items.map((item) => (
                                  <tr key={item.id} className="border-t border-border/60">
                                    <td className="py-1.5 font-medium">{item.productName}</td>
                                    <td className="py-1.5 text-muted-foreground">{item.meshSizeName}</td>
                                    <td className="py-1.5 text-right font-mono tabular">{item.bags}</td>
                                    <td className="py-1.5 text-right font-mono tabular">{item.weightTon.toFixed(2)}</td>
                                    <td className="py-1.5 text-right font-mono tabular">{formatCurrency(item.ratePerTon)}</td>
                                    <td className="py-1.5 text-right font-mono tabular font-medium">{formatCurrency(item.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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
