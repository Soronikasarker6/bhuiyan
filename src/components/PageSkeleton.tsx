import { Skeleton } from '@/components/ui/misc'
import { StatCardSkeleton, StatGrid } from '@/components/StatCard'

/** The shape of a page while its module loads. */
export function PageSkeleton() {
  return (
    <div>
      <div className="mb-5">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="mt-2 h-3.5 w-80" />
      </div>

      <StatGrid className="mb-5">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </StatGrid>

      <TableSkeleton />
    </div>
  )
}

export function TableSkeleton({ rows = 6, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-card">
      {title && (
        <div className="border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-40" />
        </div>
      )}
      <div className="divide-y divide-border/70">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-3.5 w-20 shrink-0" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="hidden h-3.5 w-24 shrink-0 sm:block" />
            <Skeleton className="h-3.5 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </div>
  )
}
