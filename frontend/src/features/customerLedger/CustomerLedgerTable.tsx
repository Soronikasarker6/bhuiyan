import type { CustomerLedgerRow } from '@/types'
import { EmptyState } from '@/components/EmptyState'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BookText, Pencil, Trash2 } from 'lucide-react'
import { formatDate } from '@/utils/format'

type Row = CustomerLedgerRow & { customerName?: string }

/**
 * A customer's ledger, rendered as a simple bank statement (§5):
 *
 *     Date | Description | In | Out | Balance
 *
 * A sale is money going Out (the customer owes more) — shown red with a 🔴
 * Due dot. A payment is money coming In — shown green with a 🟢 Paid dot,
 * except when it pushes the balance below zero, in which case the dot reads
 * Advance instead. `balance = running(debit − credit)`, computed in
 * `utils/customerLedger.ts` and passed in already resolved — this component
 * only draws it.
 *
 * `onEdit`/`onDelete` are opt-in — only Cash In (§9), the one place a row
 * here can actually be changed after the fact, passes them; a plain read of
 * the ledger (`CustomerLedgerPage`) renders every row exactly as before,
 * with no actions column at all. Offered only on `payment` rows: a `sale`
 * row is the invoice itself and is edited/deleted from Sales, not here.
 */
export function CustomerLedgerTable({
  rows,
  showCustomer = false,
  onEdit,
  onDelete,
}: {
  rows: Array<Row>
  showCustomer?: boolean
  onEdit?: (row: Row) => void
  onDelete?: (row: Row) => void
}) {
  const showActions = Boolean(onEdit || onDelete)

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={BookText}
        size="sm"
        title="No transactions yet"
        description="Sales and payments will appear here as they are recorded."
      />
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          {showCustomer && <TableHead>Customer</TableHead>}
          <TableHead>Description</TableHead>
          <TableHead numeric>In</TableHead>
          <TableHead numeric>Out</TableHead>
          <TableHead numeric>Balance</TableHead>
          {showActions && <TableHead className="w-16" aria-label="Actions" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isCredit = row.credit > 0
          const label = isCredit ? (row.balance < 0 ? 'Advance' : 'Paid') : 'Due'
          const dot = isCredit ? (row.balance < 0 ? 'bg-brass-500' : 'bg-success-500') : 'bg-destructive'
          // A "paid at sale" row is part of that invoice's own bookkeeping
          // (see `referenceSaleId`) — editing or deleting it here, outside
          // the Sale it belongs to, would desync the invoice's own paid-at-
          // sale amount from what the ledger says was received. Only a
          // standalone Cash In can be changed from this screen.
          const canModifyRow = row.type === 'payment' && !row.referenceSaleId

          return (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.date)}</TableCell>
              {showCustomer && <TableCell className="font-medium">{row.customerName}</TableCell>}
              <TableCell className="max-w-[18rem] truncate">
                <span className="inline-flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
                  {row.description}
                  <span className="text-2xs font-medium text-muted-foreground">· {label}</span>
                </span>
              </TableCell>
              <TableCell numeric>{row.credit > 0 ? <Money value={row.credit} size="sm" tone="positive" /> : '—'}</TableCell>
              <TableCell numeric>{row.debit > 0 ? <Money value={row.debit} size="sm" tone="negative" /> : '—'}</TableCell>
              <TableCell numeric>
                <Money value={row.balance} size="sm" weight="semibold" />
              </TableCell>
              {showActions && (
                <TableCell>
                  {canModifyRow && (
                    <div className="flex items-center justify-end gap-1">
                      {onEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() => onEdit(row)}
                          aria-label={`Edit the payment from ${formatDate(row.date)}`}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => onDelete(row)}
                          aria-label={`Delete the payment from ${formatDate(row.date)}`}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  )}
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
