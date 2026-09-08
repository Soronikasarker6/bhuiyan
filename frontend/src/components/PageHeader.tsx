import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * The top of every page: what this is, and what you can do here.
 *
 * Actions sit right-aligned in the same place on every screen, so someone
 * reaching for "Add Production" finds it without looking.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-display text-2xl leading-tight tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[0.8125rem] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * A titled block within a page.
 *
 * Used instead of nesting `Card` inside `Card`, which produces a border
 * thicket that reads as clutter rather than structure.
 */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  noPadding = false,
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  noPadding?: boolean
}) {
  return (
    <section
      className={cn('rounded-xl border border-border bg-card shadow-card', className)}
    >
      {(title || actions) && (
        <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            {title && (
              <h2 className="text-[0.9375rem] font-semibold leading-tight tracking-tight">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          )}
        </header>
      )}

      <div className={cn(noPadding ? '' : 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}
