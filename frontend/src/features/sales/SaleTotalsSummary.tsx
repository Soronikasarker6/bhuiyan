import { Money } from '@/components/Money'
import { formatCurrency } from '@/utils/format'

/**
 * The invoice total / paid at sale / due box at the foot of both sale forms
 * (finished product and raw material), so the two read identically.
 *
 * `customerAdvance` is credit the customer already holds; when there is some,
 * the box says how much of what is left this invoice it will cover — the same
 * allocation the server applies once the sale is saved.
 */
export function SaleTotalsSummary({
  total,
  paidAtSale,
  customerAdvance = 0,
}: {
  total: number
  paidAtSale: number
  customerAdvance?: number
}) {
  const due = Math.max(0, total - paidAtSale)
  const coveredByAdvance = Math.min(due, Math.max(0, customerAdvance))

  return (
    <div className="mt-4 space-y-1.5 rounded-lg border border-border bg-secondary/40 p-3.5">
      <div className="flex items-center justify-between text-[0.8125rem]">
        <span className="text-muted-foreground">Invoice total</span>
        <Money value={total} weight="bold" />
      </div>
      <div className="flex items-center justify-between text-[0.8125rem]">
        <span className="text-muted-foreground">Paid at sale</span>
        <Money value={paidAtSale} tone="positive" />
      </div>
      <div className="flex items-center justify-between border-t border-border pt-1.5 text-[0.8125rem] font-semibold">
        <span>Due</span>
        <Money value={due} tone={due > 0 ? 'negative' : 'positive'} weight="bold" />
      </div>
      {coveredByAdvance > 0 && (
        <p className="text-2xs text-muted-foreground">
          The customer holds {formatCurrency(customerAdvance)} in advance — {formatCurrency(coveredByAdvance)} of this due will be
          settled from it, leaving {formatCurrency(due - coveredByAdvance)} to collect.
        </p>
      )}
    </div>
  )
}
