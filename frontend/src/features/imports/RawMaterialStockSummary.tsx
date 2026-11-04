import { Boxes } from 'lucide-react'
import type { RawStockSummary } from '@/types'
import { formatTons } from '@/utils/format'
import { cn } from '@/utils/cn'

/**
 * Raw Material Stock (§1/§5) — one card per limestone type, never one blended
 * total.
 *
 * The headline is the Raw Product Balance — how much of this material is
 * still unsold, whether loose in the yard or already bagged:
 *
 *     Opening balance
 *   + Imported
 *   − Finished product sold   (each invoice line's final billable TON)
 *   − Direct raw material sales (net TON)
 *   − Wastage
 *   ─────────────────
 *   = Current Raw Product Balance
 *
 * Production is not a line here: bagging converts raw material into finished
 * bags, it sells nothing. Each sale and each wastage entry is subtracted once.
 *
 * Underneath, set apart, is the physical figure — loose raw material in the
 * yard (imported − used in production − direct raw sales − wastage). That one
 * is what production, raw sale and wastage entries are checked against, since
 * nothing can be bagged or sold loose that is not physically there.
 *
 * Over a date range the opening figures carry in what was on hand the day
 * before, so both columns still add up.
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
  const negative = row.rawProductBalanceTon < 0

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
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Current Raw Product Balance</p>
        <div className="mt-0.5">
          {/* §7 — the exact tonnage, decimals and all; never rounded to a whole ton. */}
          <span
            className={cn(
              'font-mono tabular text-[1.75rem] font-bold leading-none tracking-tight',
              negative ? 'text-primary-700' : 'text-foreground',
            )}
          >
            {formatTons(row.rawProductBalanceTon)}
          </span>
          <span className="ml-1.5 font-sans text-sm font-medium text-muted-foreground">Ton</span>
          <p className="mt-1 text-2xs text-muted-foreground">Unsold — raw material remaining in yard plus unsold finished bags</p>
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-2xs">
        {/* Each sale and loss on its own line, in the order it applies.
            Production is not one of them — it converts, it does not sell. */}
        <Row label="Opening balance" value={row.openingBalanceTon} />
        <Row label="Imported" value={row.importedTon} tone="positive" />
        <Row label="Finished product sold (billable)" value={row.finishedSaleTon} tone="negative" />
        <Row label="Direct raw material sales" value={row.rawSaleTon} tone="negative" />
        <Row label="Wastage" value={row.wastageTon} tone="negative" />
        <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
          <dt className="font-semibold text-foreground">Current Raw Product Balance</dt>
          <dd className="font-mono tabular font-bold text-foreground">{formatTons(row.rawProductBalanceTon)}</dd>
        </div>
      </dl>

      {/* Where the balance physically is right now. Loose stock is also what
          production, raw sale and wastage entries are checked against. */}
      <dl className="mt-3 space-y-1.5 rounded-lg bg-secondary/50 px-3 py-2.5 text-2xs">
        <Row label="Raw Material Remaining in Yard" value={row.currentRawStockTon} />
        <Row label="Unsold finished goods (raw material equivalent)" value={row.unsoldFinishedTon} />
        {/* Only when an invoice's Actual TON was edited away from bags × bag weight. */}
        {row.billingAdjustmentTon > 1e-9 && (
          <Row label="Billing adjustment (billed above bag weight)" value={row.billingAdjustmentTon} tone="negative" />
        )}
        {row.billingAdjustmentTon < -1e-9 && (
          <Row label="Billing adjustment (billed below bag weight)" value={-row.billingAdjustmentTon} tone="positive" />
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-1.5">
          <dt className="font-semibold text-foreground">Current Raw Product Balance</dt>
          <dd className="font-mono tabular font-semibold text-foreground">{formatTons(row.rawProductBalanceTon)}</dd>
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
