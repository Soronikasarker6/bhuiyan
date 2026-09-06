import type { CustomerLedgerStatementRow } from '@/utils/customerLedger'
import { EmptyState } from '@/components/EmptyState'
import { Money } from '@/components/Money'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BookText } from 'lucide-react'
import { formatBags, formatDate, formatNumber, formatTons } from '@/utils/format'

/**
 * A customer's ledger as a bill-book statement — one row per sale line
 * item, not per invoice, so a two-product invoice shows as two rows both
 * carrying its number:
 *
 *     Date | Invoice | Details | Bag(Count, Per Kg) | Ton | Price | Total | Credit
 *
 * Payments are interleaved chronologically as their own row: `Invoice`
 * reads "CASH/BANK", `Details` reads "PAYMENT", and only `Credit` is
 * filled in. `Total`/`Credit` foot the Total and Credit columns; the
 * highlighted strip below is the one running balance from
 * `customerTotals` — Due when the customer owes, Advance when they are
 * paid ahead — handed in already resolved.
 */
export function CustomerLedgerStatement({
  rows,
  totalDue,
  availableAdvance,
}: {
  rows: CustomerLedgerStatementRow[]
  totalDue: number
  availableAdvance: number
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

  const totalAmount = rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)
  const totalCredit = rows.reduce((sum, r) => sum + (r.credit ?? 0), 0)
  const isDue = totalDue > 0
  const dueOrAdvance = isDue ? totalDue : availableAdvance

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead rowSpan={2} className="align-bottom">Date</TableHead>
            <TableHead rowSpan={2} className="align-bottom">Invoice</TableHead>
            <TableHead rowSpan={2} className="align-bottom">Details</TableHead>
            <TableHead colSpan={2} className="text-center">Bag</TableHead>
            <TableHead rowSpan={2} numeric className="align-bottom">Ton</TableHead>
            <TableHead rowSpan={2} numeric className="align-bottom">Price</TableHead>
            <TableHead rowSpan={2} numeric className="align-bottom">Total</TableHead>
            <TableHead rowSpan={2} numeric className="align-bottom">Credit</TableHead>
          </TableRow>
          <TableRow>
            <TableHead numeric>Count</TableHead>
            <TableHead numeric>Per Kg</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.date)}</TableCell>
              <TableCell className="whitespace-nowrap font-mono text-xs font-medium">{row.invoice}</TableCell>
              <TableCell className="max-w-[16rem] truncate">{row.detail}</TableCell>
              <TableCell numeric>{row.bags != null ? formatBags(row.bags) : '—'}</TableCell>
              <TableCell numeric>{row.bagKg != null ? formatNumber(row.bagKg) : '—'}</TableCell>
              <TableCell numeric>{row.weightTon != null ? formatTons(row.weightTon) : '—'}</TableCell>
              <TableCell numeric>{row.ratePerTon != null ? formatNumber(row.ratePerTon) : '—'}</TableCell>
              <TableCell numeric>{row.amount != null ? <Money value={row.amount} size="sm" /> : '—'}</TableCell>
              <TableCell numeric>
                {row.credit != null ? <Money value={row.credit} size="sm" tone="positive" /> : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={7}>Total</TableCell>
            <TableCell numeric>
              <Money value={totalAmount} size="sm" weight="bold" />
            </TableCell>
            <TableCell numeric>
              <Money value={totalCredit} size="sm" weight="bold" tone="positive" />
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>

      <div className="mt-3 flex justify-end">
        <div className="inline-flex overflow-hidden rounded-lg border border-success-200">
          <div className="bg-success-100 px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-success-800">
            Total {isDue ? 'Due' : 'Advance'}
          </div>
          <div className="border-l border-success-200 bg-success-100 px-4 py-2">
            <Money value={dueOrAdvance} size="sm" weight="bold" className="text-success-800" />
          </div>
        </div>
      </div>
    </div>
  )
}
