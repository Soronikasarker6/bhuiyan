import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MobileSidebar, Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAppData } from '@/hooks/useAppData'
import { Badge } from '@/components/ui/misc'
import { FlaskConical } from 'lucide-react'

/**
 * The frame every screen sits in.
 *
 * A fixed 264px rail on desktop, a slide-out drawer below `lg`. Content is
 * capped at a readable width and the whole shell disappears when printing —
 * reports print from their own layout, not as a screenshot of the app.
 */
export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const { data } = useAppData()
  const location = useLocation()

  // Demo data is labelled rather than hidden. Somebody evaluating the system
  // should know which figures are real, and the banner disappears the moment
  // it is cleared in Settings.
  const showingSample =
    data.seeded && data.productionEntries.some((entry) => entry.id.startsWith('prod-'))

  return (
    <div className="min-h-screen">
      <Sidebar />
      <MobileSidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className="lg:pl-[264px]">
        <Header onOpenNav={() => setNavOpen(true)} />

        {showingSample && (
          <div className="no-print border-b border-brass-200 bg-brass-50/70">
            <div className="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-1.5 sm:px-6">
              <Badge variant="brass" className="shrink-0">
                <FlaskConical className="h-3 w-3" aria-hidden />
                Sample data
              </Badge>
              <p className="text-2xs leading-tight text-brass-800">
                These are demonstration figures. Clear them from{' '}
                <span className="font-medium">Settings → Data</span> before entering real records.
              </p>
            </div>
          </div>
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
