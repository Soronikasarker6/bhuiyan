import type { CustomerLedgerRow, CustomerTxnType } from '@/types'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/ui/misc'
import { Money } from '@/components/Money'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BookText } from 'lucide-react'
import { formatDate } from '@/utils/format'

const TYPE_LABEL: Record<CustomerTxnType, string> = {
  sale: 'Sale',
  payment: 'Payment',
  advance: 'Advance',
  advance_adjustment: 'Advance Adjustment',
  refund: 'Refund',
  opening_balance: 'Opening Balance',
  other: 'Other',
}

const TYPE_VARIANT: Record<CustomerTxnType, 'primary' | 'success' | 'brass' | 'outline'> = {
  sale: 'primary',
  payment: 'success',
  advance: 'brass',
  advance_adjustment: 'brass',
  refund: 'outline',
  opening_balance: 'outline',
  other: 'outline',
}

/**
 * A customer's ledger, rendered.
 *
 * `balance = running(debit − credit)`, computed in `utils/customerLedger.ts`
 * and passed in already resolved — this component only draws it. Used both
 * on one customer's detail page and, filtered, on the company-wide Customer
 * Ledger page, so the two never draw the same data two different ways.
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
        description="Sales, payments and advances will appear here as they are recorded."
      />
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Reference</TableHead>
          {showCustomer && <TableHead>Customer</TableHead>}
          <TableHead>Type</TableHead>
          <TableHead>Description</TableHead>
          <TableHead numeric>Debit</TableHead>
          <TableHead numeric>Credit</TableHead>
          <TableHead numeric>Balance</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.date)}</TableCell>
            <TableCell className="font-mono text-xs">{row.reference}</TableCell>
            {showCustomer && <TableCell className="font-medium">{row.customerName}</TableCell>}
            <TableCell>
              <Badge variant={TYPE_VARIANT[row.type]}>{TYPE_LABEL[row.type]}</Badge>
            </TableCell>
            <TableCell className="max-w-[16rem] truncate text-muted-foreground">{row.description}</TableCell>
            <TableCell numeric>{row.debit > 0 ? <Money value={row.debit} size="sm" tone="negative" /> : '—'}</TableCell>
            <TableCell numeric>{row.credit > 0 ? <Money value={row.credit} size="sm" tone="positive" /> : '—'}</TableCell>
            <TableCell numeric>
              <Money value={row.balance} size="sm" weight="semibold" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
