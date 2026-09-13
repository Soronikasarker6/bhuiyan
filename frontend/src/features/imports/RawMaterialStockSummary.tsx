import { Boxes } from 'lucide-react'
import type { RawStockSummary } from '@/types'
import { formatTons } from '@/utils/format'
import { cn } from '@/utils/cn'

/**
 * Raw Material Stock (§1/§5) — one card per limestone type, never one blended
 * total.
 *
 * The card answers the one question the yard actually asks: *right now, how
 * many tons of this limestone do I physically have?* So Current Raw Stock is
 * the headline, and the three figures it comes from are listed underneath in
 * the order they subtract, with a rule above the result:
 *
 *     Total Imported
 *   − Production
 *   − Wastage
 *   ─────────────────
 *   = Current Raw Stock
 *
 * Wastage is listed separately from Production because they are two *different*
 * ways material leaves the yard — bagged into finished stock, versus lost — and
 * each ton belongs to exactly one of them. Neither is a share of the other, so
 * both are subtracted and nothing is counted twice (see `utils/rawMaterial.ts`).
 *
 * Over a date range the cards also show the opening stock carried in, so the
 * column still adds up rather than appearing to lose everything that came
 * before the window.
 */
export function RawMaterialStockSummary({ rows }: { rows: RawStockSummary[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <MaterialCard key={row.productId} row={row} />
      ))}
    </div>
  )
}

function MaterialCard({ row }: { row: RawStockSummary }) {
  const negative = row.currentRawStockTon < 0
  const hasOpening = row.openingTon !== 0

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[0.9375rem] leading-tight">{row.productName}</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {row.shipmentCount === 0
              ? 'No shipments yet'
              : `${row.shipmentCount} shipment${row.shipmentCount === 1 ? '' : 's'}`}
          </p>
        </div>
        <span
          className={cn(
            'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
            negative ? 'bg-primary-50 text-primary-700' : 'bg-success-100 text-success-700',
          )}
        >
          <Boxes className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>

      {/* The number the business owner is actually here for. */}
      <div className="mt-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Current raw stock</p>
        <div className="mt-0.5">
          {/* §7 — the exact tonnage, decimals and all; never rounded to a whole ton. */}
          <span
            className={cn(
              'font-mono tabular text-[1.75rem] font-bold leading-none tracking-tight',
              negative ? 'text-primary-700' : 'text-foreground',
            )}
          >
            {formatTons(row.currentRawStockTon)}
          </span>
          <span className="ml-1.5 font-sans text-sm font-medium text-muted-foreground">Ton</span>
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-2xs">
        {hasOpening && <Row label="Opening" value={row.openingTon} />}
        <Row label="Total imported" value={row.importedTon} tone="positive" />
        <Row label="Production" value={row.productionTon} tone="negative" />
        <Row label="Wastage" value={row.wastageTon} tone="negative" />
        <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
          <dt className="font-semibold text-foreground">Current raw stock</dt>
          <dd className="font-mono tabular font-bold text-foreground">{formatTons(row.currentRawStockTon)}</dd>
        </div>
      </dl>
    </div>
  )
}

function Row({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: number
  tone?: 'neutral' | 'positive' | 'negative'
}) {
  const toneClass =
    tone === 'positive' ? 'text-success-700' : tone === 'negative' ? 'text-primary-700' : 'text-foreground'

  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono tabular font-medium', toneClass)}>
        {/* A minus in front of what was taken out, so the column reads as the subtraction it is. */}
        {tone === 'negative' && value > 0 ? '−' : ''}
        {formatTons(value)}
      </dd>
    </div>
  )
}
