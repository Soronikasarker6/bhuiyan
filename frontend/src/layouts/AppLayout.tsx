import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { MessageStrip } from '@ui5/webcomponents-react/MessageStrip'
import { MobileSidebar, Sidebar } from './Sidebar'
import { Header } from './Header'
import { useAppData } from '@/hooks/useAppData'

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
