import { NavLink } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { navigation } from '@/router/navigation'
import { Button } from '@/components/ui/button'

/**
 * The sidebar.
 *
 * Deep maroon, because this is the one piece of chrome that is always on
 * screen and it should read as the company's system rather than as a generic
 * admin template. Each item carries a one-line hint: staff who use this
 * occasionally should not have to remember what "Closing" means.
 */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
      {navigation.map((item) => (
        <div key={item.path}>
          {item.group && (
            <p className="mb-1 mt-3.5 px-3 text-2xs font-semibold uppercase tracking-wider text-sidebar-muted/70 first:mt-0">
              {item.group}
            </p>
          )}
          <NavLink
            to={item.path}
            end={item.path === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400',
                isActive
                  ? 'bg-sidebar-accent text-white shadow-sm'
                  : 'text-sidebar-foreground/85 hover:bg-white/[0.06] hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    'mt-0.5 h-[1.05rem] w-[1.05rem] shrink-0 transition-colors',
                    isActive ? 'text-brass-300' : 'text-sidebar-muted group-hover:text-brass-200',
                  )}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-[0.8125rem] font-medium leading-tight">
                    {item.label}
                  </span>
                  <span
                    className={cn(
                      'mt-0.5 block truncate text-2xs leading-tight',
                      isActive ? 'text-white/60' : 'text-sidebar-muted/70',
                    )}
                  >
                    {item.hint}
                  </span>
                </span>
              </>
            )}
          </NavLink>
        </div>
      ))}
    </nav>
  )
}

function Wordmark() {
  return (
    <div className="flex items-center gap-3 border-b border-sidebar-border px-5 py-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-brass-500/40 bg-brass-500/15 font-display text-base text-brass-200">
        BI
      </span>
      <span className="min-w-0">
        <span className="block truncate font-display text-[0.9375rem] leading-tight tracking-wide text-white">
          BHUIYAN INDUSTRY
        </span>
        <span className="block text-2xs uppercase tracking-[0.14em] text-brass-300/80">
          Accounts &amp; Production
        </span>
      </span>
    </div>
  )
}

function SidebarFooter() {
  return (
    <div className="border-t border-sidebar-border px-5 py-3.5">
      <p className="text-2xs font-medium uppercase tracking-wider text-sidebar-muted">
        BHUIYAN INDUSTRY
      </p>
      <p className="mt-0.5 text-2xs text-sidebar-muted/60">Internal Management System</p>
    </div>
  )
}

/** Fixed rail, desktop only. */
export function Sidebar() {
  return (
    <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col bg-sidebar lg:flex">
      <Wordmark />
      <SidebarNav />
      <SidebarFooter />
    </aside>
  )
}

/** Slide-out drawer, mobile and tablet. */
export function MobileSidebar({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <div
      className={cn(
        'no-print fixed inset-0 z-50 lg:hidden',
        open ? 'pointer-events-auto' : 'pointer-events-none',
      )}
      aria-hidden={!open}
    >
      <div
        className={cn(
          'absolute inset-0 bg-primary-950/50 backdrop-blur-[2px] transition-opacity duration-200',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
      />

      <div
        className={cn(
          'absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-sidebar shadow-pop',
          'transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div className="relative">
          <Wordmark />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="absolute right-3 top-4 text-sidebar-muted hover:bg-white/10 hover:text-white"
            aria-label="Close navigation"
          >
            <X />
          </Button>
        </div>

        <SidebarNav onNavigate={onClose} />
        <SidebarFooter />
      </div>
    </div>
  )
}
