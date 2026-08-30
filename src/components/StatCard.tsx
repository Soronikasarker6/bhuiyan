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
  className,
}: {
  label: string
  value: ReactNode
  icon?: LucideIcon
  footer?: ReactNode
  accent?: 'neutral' | 'primary' | 'success' | 'brass'
  className?: string
}) {
  const accents = {
    neutral: 'text-muted-foreground bg-secondary',
    primary: 'text-primary-700 bg-primary-50',
    success: 'text-success-700 bg-success-100',
    brass: 'text-brass-700 bg-brass-50',
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-raised',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-lg', accents[accent])}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </div>

      <div className="mt-2.5">{value}</div>

      {footer && <div className="mt-2 flex items-center gap-2">{footer}</div>}
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
  columns?: 2 | 3 | 4
  className?: string
}) {
  const cols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 xl:grid-cols-4',
  }

  return <div className={cn('grid grid-cols-1 gap-3', cols[columns], className)}>{children}</div>
}
