import type { CustomerLedgerRow } from '@/types'
import { EmptyState } from '@/components/EmptyState'
import { Money } from '@/components/Money'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BookText } from 'lucide-react'
import { formatDate } from '@/utils/format'

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
 */
export function CustomerLedgerTable({
  rows,
  showCustomer = false,
}: {
  rows: Array<CustomerLedgerRow & { customerName?: string }>
  showCustomer?: boolean
}) {
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isCredit = row.credit > 0
          const label = isCredit ? (row.balance < 0 ? 'Advance' : 'Paid') : 'Due'
          const dot = isCredit ? (row.balance < 0 ? 'bg-brass-500' : 'bg-success-500') : 'bg-destructive'

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
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
