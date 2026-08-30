import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Pencil, Search, Trash2, Users } from 'lucide-react'
import type { Customer, CustomerTotals } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { Money } from '@/components/Money'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SortableHead } from '@/components/SortableHead'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { useSortableSearch } from '@/hooks/useSortableSearch'
import { formatDate } from '@/utils/format'

export function CustomerTable({
  customers,
  totalsOf,
  onEdit,
  onDelete,
}: {
  customers: Customer[]
  totalsOf: (customerId: string) => CustomerTotals
  onEdit: (customer: Customer) => void
  onDelete: (customer: Customer) => void
}) {
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null)

  const { search, setSearch, sortKey, direction, toggleSort, rows: sorted } = useSortableSearch({
    rows: customers,
    searchText: (c) => `${c.name} ${c.company ?? ''} ${c.phone ?? ''}`,
    sorters: {
      name: (a, b) => a.name.localeCompare(b.name),
      due: (a, b) => totalsOf(a.id).totalDue - totalsOf(b.id).totalDue,
      advance: (a, b) => totalsOf(a.id).availableAdvance - totalsOf(b.id).availableAdvance,
    },
    defaultSortKey: 'name',
    defaultDirection: 'asc',
  })

  return (
    <Section
      title="Customers"
      description={`${customers.length} customers`}
      actions={
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, phone…"
            className="h-8 w-56 pl-8 text-xs"
          />
        </div>
      }
      noPadding
    >
      {customers.length === 0 ? (
        <EmptyState icon={Users} size="sm" title="No customers yet" description="Add your first customer above." />
      ) : sorted.length === 0 ? (
        <EmptyState icon={Search} size="sm" title="No matches" description="Try a different search." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Name" sortKey="name" activeKey={sortKey} direction={direction} onSort={toggleSort} />
              <TableHead>Phone</TableHead>
              <SortableHead label="Due" sortKey="due" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
              <SortableHead label="Advance" sortKey="advance" activeKey={sortKey} direction={direction} onSort={toggleSort} numeric />
              <TableHead>Last activity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((customer) => {
              const totals = totalsOf(customer.id)
              return (
                <TableRow key={customer.id}>
                  <TableCell>
                    <Link to={`/customers/${customer.id}`} className="font-medium text-primary-700 hover:underline">
                      {customer.name}
                    </Link>
                    {customer.company && <span className="ml-1.5 text-2xs text-muted-foreground">{customer.company}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{customer.phone || '—'}</TableCell>
                  <TableCell numeric>
                    <Money value={totals.totalDue} size="sm" tone={totals.totalDue > 0 ? 'negative' : 'neutral'} />
                  </TableCell>
                  <TableCell numeric>
                    <Money value={totals.availableAdvance} size="sm" tone={totals.availableAdvance > 0 ? 'positive' : 'neutral'} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {totals.lastTransactionDate ? formatDate(totals.lastTransactionDate) : '—'}
                  </TableCell>
                  <TableCell>
                    {!customer.active ? (
                      <Badge variant="outline">Inactive</Badge>
                    ) : totals.totalDue > 0 ? (
                      <Badge variant="destructive">Due</Badge>
                    ) : (
                      <Badge variant="success">Clear</Badge>
                    )}
                  </TableCell>
                  <TableCell numeric>
                    <div className="flex justify-end gap-1">
                      <Button size="icon-sm" variant="ghost" onClick={() => onEdit(customer)} aria-label={`Edit ${customer.name}`}>
                        <Pencil />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingDelete(customer)}
                        aria-label={`Remove ${customer.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Remove ${pendingDelete.name}?` : ''}
        description={
          pendingDelete && totalsOf(pendingDelete.id).transactionCount > 0
            ? `This customer has ${totalsOf(pendingDelete.id).transactionCount} ledger transactions. Those records are kept and will still show this customer's name, but they will no longer appear on new sales.`
            : 'This customer has no transactions yet, so nothing is lost.'
        }
        confirmLabel="Remove customer"
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </Section>
  )
}
