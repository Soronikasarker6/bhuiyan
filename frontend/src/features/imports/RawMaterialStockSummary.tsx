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
 * the headline, and the figures it comes from are listed underneath in the
 * order they apply, with a rule above the result:
 *
 *     Opening Stock
 *   + Imported
 *   − Used in Production
 *   − Direct Raw Material Sales
 *   − Wastage
 *   ─────────────────
 *   = Closing Stock (Current Raw Stock)
 *
 * Finished-goods sales never appear here: those bags already left raw stock
 * when they were produced, and come off finished (bag) stock when sold.
 *
 * Production and direct sales are separate lines: a ton bagged by production
 * is never also a raw sale, so each outflow is counted once.
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
export function RawMaterialStockSummary({ rows, ranged = false }: { rows: RawStockSummary[]; ranged?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[...rows].sort((a, b) => b.productName.localeCompare(a.productName, undefined, { sensitivity: 'base' })).map((row) => (
        <MaterialCard key={row.productId} row={row} ranged={ranged} />
      ))}
    </div>
  )
}

/** `ranged` — a date window is applied, so the shipment count covers only that window. */
function MaterialCard({ row, ranged }: { row: RawStockSummary; ranged: boolean }) {
  const negative = row.currentRawStockTon < 0

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[0.9375rem] leading-tight">{row.productName}</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {row.shipmentCount === 0
              ? ranged ? 'No shipments in this period' : 'No shipments yet'
              : `${row.shipmentCount} shipment${row.shipmentCount === 1 ? '' : 's'}${ranged ? ' in this period' : ''}`}
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
        {/* Each movement on its own line, in the order it applies. Finished-bag
            sales never appear here — they come off bag stock, not raw stock. */}
        <Row label="Opening stock" value={row.openingTon} />
        <Row label="Imported" value={row.importedTon} tone="positive" />
        <Row label="Used in production" value={row.productionTon} tone="negative" />
        <Row label="Direct raw material sales" value={row.rawSaleTon} tone="negative" />
        <Row label="Wastage" value={row.wastageTon} tone="negative" />
        <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
          <dt className="font-semibold text-foreground">Closing stock</dt>
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
  indent = false,
}: {
  label: string
  value: number
  tone?: 'neutral' | 'positive' | 'negative'
  /** A breakdown line under the row above — already counted there, so not subtracted again. */
  indent?: boolean
}) {
  const toneClass =
    tone === 'positive' ? 'text-success-700' : tone === 'negative' ? 'text-primary-700' : 'text-foreground'

  return (
    <div className={cn('flex items-center justify-between gap-2', indent && 'pl-3 opacity-80')}>
      <dt className="text-muted-foreground">{indent ? `↳ ${label}` : label}</dt>
      <dd className={cn('font-mono tabular', indent ? 'font-normal' : 'font-medium', toneClass)}>
        {/* A minus in front of what was taken out, so the column reads as the subtraction it is. */}
        {tone === 'negative' && value > 0 ? '−' : ''}
        {formatTons(value)}
      </dd>
    </div>
  )
}
