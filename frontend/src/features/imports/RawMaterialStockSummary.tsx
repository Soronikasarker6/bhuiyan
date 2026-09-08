import { Boxes } from 'lucide-react'
import type { RawMaterialStock } from '@/types'
import { formatTons } from '@/utils/format'
import { cn } from '@/utils/cn'

/**
 * Available Raw Material (§1/§7) — one card per limestone type, never one
 * blended total.
 *
 * Each card is that material's *current* shipment cycle only: the latest
 * shipment's opening balance, what it received, what has been used against
 * it so far, and the closing balance that results — the same four figures
 * §2's worked example walks through, never the lifetime sum of every
 * shipment this material has ever received.
 */
export function RawMaterialStockSummary({ rows }: { rows: RawMaterialStock[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <MaterialCard key={row.productId} row={row} />
      ))}
    </div>
  )
}

function MaterialCard({ row }: { row: RawMaterialStock }) {
  const negative = row.availableTon < 0

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-display text-[0.9375rem] leading-tight">{row.productName}</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {row.shipmentCount === 0
              ? 'No shipments yet'
              : `${row.shipmentCount} shipment${row.shipmentCount === 1 ? '' : 's'} · ${row.openShipmentCount} open`}
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

      <div className="mt-2.5">
        {/* §12 — the exact closing balance, decimals and all; never rounded to a whole ton. */}
        <span className={cn('font-mono tabular text-2xl font-bold tracking-tight', negative ? 'text-primary-700' : 'text-foreground')}>
          {formatTons(row.availableTon)}
        </span>
        <span className="ml-1.5 font-sans text-sm font-medium text-muted-foreground">Ton</span>
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Available</p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-3 text-2xs">
        <Row label="Opening" value={row.openingTon} />
        <Row label="Received" value={row.receivedTon} tone="positive" />
        <Row label="Used" value={row.consumedTon} tone="negative" />
        <Row label="Closing" value={row.closingTon} strong />
      </dl>
    </div>
  )
}

function Row({
  label,
  value,
  tone = 'neutral',
  strong = false,
}: {
  label: string
  value: number
  tone?: 'neutral' | 'positive' | 'negative'
  strong?: boolean
}) {
  const toneClass =
    tone === 'positive' ? 'text-success-700' : tone === 'negative' ? 'text-primary-700' : 'text-foreground'

  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono tabular', strong ? 'font-bold' : 'font-medium', strong ? 'text-foreground' : toneClass)}>
        {formatTons(value)}
      </dd>
    </div>
  )
}
