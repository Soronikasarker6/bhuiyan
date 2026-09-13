import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'
import { Skeleton } from '@/components/ui/misc'

/**
 * The headline figure.
 *
 * One number, large, with the label above it and its context below. The number
 * is the largest thing on the card because the question a manager opens this
 * system to answer — how much did we sell, how much have we got — should be
 * answered from across the room.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  footer,
  accent = 'neutral',
  /**
   * Opt-in card background, for the Dashboard's stone/slate mood board only
   * (see `styles/quarry-theme.css`) — omitted, this renders exactly as it
   * always has, so every other page's `StatCard` is unaffected.
   */
  theme = 'default',
  /**
   * A small, quiet glyph in the opposite corner from the icon — the mood-board
   * themes only. Purely decorative; always hidden from assistive technology.
   */
  cornerIcon: CornerIcon,
  /** Absolutely-positioned decoration behind the card's content, e.g. a sparkline. */
  decoration,
  className,
}: {
  label: string
  value: ReactNode
  icon?: LucideIcon
  footer?: ReactNode
  accent?: 'neutral' | 'primary' | 'success' | 'brass'
  theme?: 'default' | 'stone' | 'slate'
  cornerIcon?: LucideIcon
  decoration?: ReactNode
  className?: string
}) {
  const accents = {
    neutral: 'text-muted-foreground bg-secondary',
    primary: 'text-primary-700 bg-primary-50',
    success: 'text-success-700 bg-success-100',
    brass: 'text-brass-700 bg-brass-50',
  }

  const isDark = theme === 'slate'
  const isThemed = theme !== 'default'
  const surface =
    theme === 'default' ? 'border-border bg-card' : theme === 'stone' ? 'dash-card-stone' : 'dash-card-slate'

  /*
   * The mood-board themes lead with the icon and set the label beside it; the
   * default card keeps the label-left/icon-right arrangement it has always
   * had, because it is the one every other page renders.
   */
  const iconChip = Icon && (
    <span
      className={cn(
        'grid shrink-0 place-items-center rounded-lg',
        isThemed ? 'h-9 w-9 rounded-full' : 'h-7 w-7',
        isDark ? 'bg-white/10 text-cream-50 ring-1 ring-white/15' : accents[accent],
      )}
    >
      <Icon className={cn(isThemed ? 'h-4 w-4' : 'h-3.5 w-3.5')} aria-hidden />
    </span>
  )

  const labelText = (
    <p
      className={cn(
        'text-2xs font-semibold uppercase tracking-wider',
        isDark ? 'text-white/70' : 'text-muted-foreground',
      )}
    >
      {label}
    </p>
  )

  return (
    <div
      className={cn(
        'rounded-xl p-4 shadow-card transition-shadow hover:shadow-raised',
        isThemed && 'relative overflow-hidden',
        surface,
        className,
      )}
    >
      {decoration}

      <div className="relative z-10">
        <div className="flex items-center justify-between gap-3">
          {isThemed ? (
            <>
              <div className="flex min-w-0 items-center gap-2.5">
                {iconChip}
                {labelText}
              </div>
              {CornerIcon && (
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-lg',
                    isDark ? 'bg-white/[0.07] text-white/60' : 'bg-white/70 text-muted-foreground',
                  )}
                >
                  <CornerIcon className="h-3.5 w-3.5" aria-hidden />
                </span>
              )}
            </>
          ) : (
            <>
              {labelText}
              {iconChip}
            </>
          )}
        </div>

        <div className={cn(isThemed ? 'mt-3' : 'mt-2.5')}>{value}</div>

        {footer && <div className="mt-2 flex items-center gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-start justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-7 rounded-lg" />
      </div>
      <Skeleton className="mt-3 h-8 w-36" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  )
}

/** A row of stat cards that stacks cleanly on a phone. */
export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5
  className?: string
}) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 xl:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  }

  return <div className={cn('grid grid-cols-1 gap-3', cols[columns], className)}>{children}</div>
}
