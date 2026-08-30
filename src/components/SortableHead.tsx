import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import type { SortDirection } from '@/hooks/useSortableSearch'
import { cn } from '@/utils/cn'

/** A `TableHead` that sorts its column on click, with a visible indicator. */
export function SortableHead({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  numeric,
  className,
}: {
  label: string
  sortKey: string
  activeKey: string
  direction: SortDirection
  onSort: (key: string) => void
  numeric?: boolean
  className?: string
}) {
  const active = sortKey === activeKey
  const Icon = active ? (direction === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown

  return (
    <TableHead numeric={numeric} className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-foreground',
          numeric && 'flex-row-reverse',
          active && 'text-foreground',
        )}
      >
        {label}
        <Icon className={cn('h-3 w-3', active ? 'opacity-100' : 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  )
}
