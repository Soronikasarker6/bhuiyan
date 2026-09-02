import { useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Bell,
  ChevronRight,
  CircleUser,
  CloudOff,
  Menu,
  PackageX,
  TriangleAlert,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { cn } from '@/utils/cn'
import { activePath, navigation } from './navigation'
import { useAppData } from '@/hooks/useAppData'
import { formatDateLong, todayISO } from '@/utils/format'
import { allMeshStock } from '@/utils/productionStock'

/**
 * The header.
 *
 * Carries the things that are true of the whole application rather than of one
 * screen: where you are, what today is, anything that needs attention, and who
 * is signed in.
 */
export function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const location = useLocation()
  const { data, persistent } = useAppData()

  const current = activePath(location.pathname)
  const item = navigation.find((n) => n.path === current) ?? navigation[0]!

  /**
   * Notifications are derived, not stored.
   *
   * Everything worth interrupting someone about is a fact about the current
   * data — a grade that has run out, a month that has not been closed. Storing
   * a notification would mean it could go stale and lie.
   */
  const alerts = useMemo(() => {
    const list: Array<{ id: string; title: string; detail: string; tone: 'warn' | 'info' }> = []

    const stock = allMeshStock(data.products, data.meshSizes, data.productionEntries, data.saleItems, data.sales)
    const hasActivity = (row: (typeof stock)[number]) =>
      data.productionEntries.some((e) => e.productId === row.productId && e.meshId === row.meshId)
    const empty = stock.filter((s) => s.stockBags <= 0 && hasActivity(s))
    if (empty.length > 0) {
      list.push({
        id: 'out-of-stock',
        title: `${empty.length} grade${empty.length > 1 ? 's' : ''} out of stock`,
        detail: empty.map((s) => `${s.productName} — ${s.meshName}`).join(', '),
        tone: 'warn',
      })
    }

    if (!persistent) {
      list.push({
        id: 'no-storage',
        title: 'Entries are not being saved',
        detail: 'This browser is blocking storage. Reloading will lose today’s work.',
        tone: 'warn',
      })
    }

    const closedMonths = new Set(data.ledgerClosings.map((c) => c.monthKey))
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const lastKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`

    if (data.transactions.length > 0 && !closedMonths.has(lastKey)) {
      list.push({
        id: 'unclosed',
        title: 'Last month is not closed',
        detail: 'Close it in Monthly Closing to freeze the cash & bank balances.',
        tone: 'info',
      })
    }

    return list
  }, [data, persistent])

  return (
    <header className="no-print sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onOpenNav}
          aria-label="Open navigation"
        >
          <Menu />
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <Link to="/" className="transition-colors hover:text-foreground">
              BHUIYAN INDUSTRY
            </Link>
            <ChevronRight className="h-3 w-3" aria-hidden />
            <span className="truncate text-foreground/70">{item.label}</span>
          </div>
          <h2 className="truncate text-sm font-semibold leading-tight">{item.label}</h2>
        </div>

        <p className="hidden text-right text-xs leading-tight text-muted-foreground md:block">
          <span className="block font-medium text-foreground/80">
            {formatDateLong(todayISO())}
          </span>
          <span className="block text-2xs">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long' })}
          </span>
        </p>

        <NotificationBell alerts={alerts} />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Account menu"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-700 text-xs font-semibold text-white">
                BI
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-xs font-medium leading-tight">Office Admin</span>
                <span className="block text-2xs leading-tight text-muted-foreground">
                  BHUIYAN INDUSTRY
                </span>
              </span>
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 w-56 rounded-lg border border-border bg-popover p-1 shadow-pop animate-in fade-in-0 zoom-in-95"
            >
              <div className="px-2.5 py-2">
                <p className="text-[0.8125rem] font-medium">Office Admin</p>
                <p className="text-2xs text-muted-foreground">Full access</p>
              </div>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild>
                <Link
                  to="/settings"
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[0.8125rem] outline-none focus:bg-accent"
                >
                  <CircleUser className="h-3.5 w-3.5" aria-hidden />
                  Settings
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-2xs text-muted-foreground">
                {persistent ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-success-600" aria-hidden />
                    Saving to this browser
                  </>
                ) : (
                  <>
                    <CloudOff className="h-3 w-3 text-primary-700" aria-hidden />
                    Not saving — private window
                  </>
                )}
              </div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  )
}

function NotificationBell({
  alerts,
}: {
  alerts: Array<{ id: string; title: string; detail: string; tone: 'warn' | 'info' }>
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {alerts.length > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary-700 px-1 text-[0.5625rem] font-bold text-white">
              {alerts.length}
            </span>
          )}
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 rounded-lg border border-border bg-popover p-1 shadow-pop animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center justify-between px-2.5 py-2">
            <p className="text-[0.8125rem] font-semibold">Needs attention</p>
            <Badge variant={alerts.length ? 'primary' : 'success'}>
              {alerts.length || 'All clear'}
            </Badge>
          </div>

          <DropdownMenu.Separator className="h-px bg-border" />

          {alerts.length === 0 ? (
            <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">
              Nothing needs attention right now.
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex gap-2.5 px-2.5 py-2">
                  <span
                    className={cn(
                      'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md',
                      alert.tone === 'warn'
                        ? 'bg-primary-50 text-primary-700'
                        : 'bg-brass-50 text-brass-600',
                    )}
                  >
                    {alert.tone === 'warn' ? (
                      <PackageX className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium leading-tight">{alert.title}</span>
                    <span className="mt-0.5 block text-2xs leading-relaxed text-muted-foreground">
                      {alert.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
