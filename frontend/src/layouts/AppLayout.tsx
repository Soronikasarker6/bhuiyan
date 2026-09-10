import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MessageStrip } from '@ui5/webcomponents-react/MessageStrip'
import { MobileSidebar, Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAppData } from '@/hooks/useAppData'
import { groupContaining } from '@/router/navigation'
import { cn } from '@/utils/cn'

const SIDEBAR_COLLAPSED_KEY = 'bhuiyan.sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * The frame every screen sits in.
 *
 * A fixed 264px rail on desktop (76px collapsed to icons only), a slide-out
 * drawer below `lg`. Content is capped at a readable width and the whole
 * shell disappears when printing — reports print from their own layout, not
 * as a screenshot of the app.
 *
 * Sidebar-collapsed and which nav groups are expanded are two independent
 * pieces of state, both owned here — the one ancestor the desktop rail and
 * the mobile drawer already share — so collapsing the rail never resets
 * which groups are open, and both surfaces stay in sync with each other.
 */
export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const { data } = useAppData()
  const location = useLocation()

  // Nothing is "selected" until a group's route is actually visited, so
  // groups start collapsed everywhere except whichever one the current page
  // already belongs to — never persisted, so a fresh visit to the dashboard
  // always starts with every group closed, exactly as specified.
  const [openGroups, setOpenGroups] = useState<string[]>(() => {
    const active = groupContaining(location.pathname)
    return active ? [active] : []
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // A browser blocking storage just means the preference isn't remembered next visit.
    }
  }, [collapsed])

  // Navigating to a page some other way than clicking through an already-open
  // group (a link elsewhere, the back button, a pasted URL) still opens that
  // group — it only ever adds, never closes a group the user opened by hand.
  useEffect(() => {
    const active = groupContaining(location.pathname)
    if (active) {
      setOpenGroups((current) => (current.includes(active) ? current : [...current, active]))
    }
  }, [location.pathname])

  // Demo data is labelled rather than hidden. Somebody evaluating the system
  // should know which figures are real, and the banner disappears the moment
  // it is cleared in Settings.
  const showingSample =
    data.seeded && data.productionEntries.some((entry) => entry.id.startsWith('prod-'))

  return (
    <div className="min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        openGroups={openGroups}
        onOpenGroupsChange={setOpenGroups}
      />
      <MobileSidebar
        open={navOpen}
        onClose={() => setNavOpen(false)}
        openGroups={openGroups}
        onOpenGroupsChange={setOpenGroups}
      />

      <div
        className={cn(
          'transition-[padding-left] duration-200 ease-in-out',
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]',
        )}
      >
        <Header onOpenNav={() => setNavOpen(true)} />

        {showingSample && (
          <MessageStrip design="Critical" hideCloseButton className="no-print">
            <strong className="font-medium">Sample data.</strong> These are demonstration figures. Clear
            them from <strong className="font-medium">Settings → Data</strong> before entering real
            records.
          </MessageStrip>
        )}

        <main
          key={location.pathname}
          className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6 sm:py-6"
        >
          <Outlet />
        </main>
      </div>
    </div>
  )
}
