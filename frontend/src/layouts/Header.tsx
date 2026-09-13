import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  CircleUser,
  CloudOff,
  LogOut,
  Menu,
  PackageX,
  TriangleAlert,
} from 'lucide-react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { cn } from '@/utils/cn'
import { useAppData } from '@/hooks/useAppData'
import { useAuth } from '@/hooks/useAuth'
import { usePageHeaderContent } from '@/hooks/usePageHeader'
import { formatDateLong, todayISO } from '@/utils/format'
import { allMeshStock } from '@/utils/productionStock'

/**
 * Who's signed in, and how to sign out — real in the backend-connected build,
 * static in the offline single-file build, which has no login to speak of.
 * Isolated in its own component so `useAuth()` (which needs an `AuthProvider`
 * ancestor that only the online build renders) is never called at all when
 * `__OFFLINE__` is true.
 */
function useAccountIdentity(): { name: string; subtitle: string; onLogOut: (() => void) | null } {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- __OFFLINE__ is a build-time constant
  return __OFFLINE__ ? useOfflineIdentity() : useOnlineIdentity()
}

function useOfflineIdentity() {
  return { name: 'Office Admin', subtitle: 'BHUIYAN INDUSTRY', onLogOut: null }
}

function useOnlineIdentity() {
  const { user, logout } = useAuth()
  return { name: user?.name ?? 'Signed in', subtitle: user?.email ?? 'BHUIYAN INDUSTRY', onLogOut: logout }
}

/**
 * The header.
 *
 * The one piece of chrome every page shares, so it carries both what's true
 * of the whole application (today's date, anything that needs attention, who
 * is signed in — hard right) and, on the left, whatever the *current* page
 * published as its own name and actions via `usePageHeader` — a "View
 * reports" link, an export menu, a month picker, each page's own choice.
 * Nothing here knows what any page is called; it only ever renders the last
 * thing handed to it.
 */
export function Header({ onOpenNav }: { onOpenNav: () => void }) {
  const { data, persistent } = useAppData()
  const identity = useAccountIdentity()
  const { title, description, actions } = usePageHeaderContent()
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [confirmLogOut, setConfirmLogOut] = useState(false)

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

        {title && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium leading-tight text-foreground/80">{title}</p>
            {description && (
              <p className="mt-0.5 hidden max-w-md truncate text-xs leading-tight text-muted-foreground sm:block">
                {description}
              </p>
            )}
          </div>
        )}

        {/* With no title published yet (a page still loading its own header content), holds the rest of the bar against the right edge the same as before. */}
        {!title && <div className="flex-1" />}

        {actions && <div className="hidden shrink-0 items-center gap-2 sm:flex">{actions}</div>}

        <p className="hidden shrink-0 text-right text-xs leading-tight text-muted-foreground md:block">
          <span className="block font-medium text-foreground/80">
            {formatDateLong(todayISO())}
          </span>
          <span className="block text-2xs">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long' })}
          </span>
        </p>

        <NotificationBell alerts={alerts} />

        <DropdownMenu.Root open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Account menu"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-700 text-xs font-semibold text-white ring-2 ring-white">
                {initialsOf(identity.name)}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-xs font-medium leading-tight">{identity.name}</span>
                <span className="block text-2xs leading-tight text-muted-foreground">
                  {identity.subtitle}
                </span>
              </span>
              <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden />
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className="z-50 w-56 rounded-lg border border-border bg-popover p-1 shadow-pop animate-in fade-in-0 zoom-in-95"
            >
              <div className="px-2.5 py-2">
                <p className="text-[0.8125rem] font-medium">{identity.name}</p>
                <p className="text-2xs text-muted-foreground">{identity.onLogOut ? identity.subtitle : 'Full access'}</p>
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
              {identity.onLogOut && (
                <DropdownMenu.Item
                  asChild
                  onSelect={(e) => {
                    e.preventDefault()
                    setAccountMenuOpen(false)
                    setConfirmLogOut(true)
                  }}
                >
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] outline-none focus:bg-accent"
                  >
                    <LogOut className="h-3.5 w-3.5" aria-hidden />
                    Log out
                  </button>
                </DropdownMenu.Item>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <div className="flex items-center gap-2 px-2.5 py-1.5 text-2xs text-muted-foreground">
                {persistent ? (
                  <>
                    <span className="h-1.5 w-1.5 rounded-full bg-success-600" aria-hidden />
                    {identity.onLogOut ? 'Saving to the server' : 'Saving to this browser'}
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

        {identity.onLogOut && (
          <ConfirmDialog
            open={confirmLogOut}
            onOpenChange={setConfirmLogOut}
            title="Log out?"
            description="You'll need to sign in again to continue working."
            confirmLabel="Log out"
            variant="default"
            onConfirm={identity.onLogOut}
          />
        )}
      </div>
    </header>
  )
}

/** "Office Admin" → "OA". Falls back to the first letter for a single-word name. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'BI'
  const first = parts[0]![0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : ''
  return (first + last).toUpperCase()
}

function NotificationBell({
  alerts,
}: {
  alerts: Array<{ id: string; title: string; detail: string; tone: 'warn' | 'info' }>
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {/*
          A plain button rather than the house `Button`: at icon size that one
          is 26px square, and the count badge — which only appears once there
          is something to count — covered the bell itself. 36px leaves room for
          the badge to sit on the corner instead of on top of the glyph.
        */}
        <button
          type="button"
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/70 transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={alerts.length > 0 ? `Notifications (${alerts.length})` : 'Notifications'}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {alerts.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary-700 px-1 text-[0.5625rem] font-bold text-white ring-2 ring-background">
              {alerts.length}
            </span>
          )}
        </button>
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
