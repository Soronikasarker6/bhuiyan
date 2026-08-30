import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/**
 * What a screen shows before there is anything on it.
 *
 * Never a blank rectangle. An empty state says what the screen is for, why it
 * is empty, and offers the one action that fixes it — which for a new system
 * is the difference between a user starting and a user closing the tab.
 *
 * When a whole module is empty, one page-level empty state is shown instead
 * of a dozen empty cards.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = 'default',
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
  size?: 'sm' | 'default' | 'lg'
}) {
  const padding = {
    sm: 'py-8',
    default: 'py-14',
    lg: 'py-20',
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 text-center',
        padding[size],
        className,
      )}
    >
      {Icon && (
        <span className="mb-4 grid h-12 w-12 place-items-center rounded-full border border-brass-200 bg-brass-50 text-brass-600">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}

      <h3 className="font-display text-lg text-foreground">{title}</h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}

      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
