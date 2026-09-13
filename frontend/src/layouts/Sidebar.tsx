import { NavLink, useLocation } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/utils/cn'
import { activePath, navigationSegments, type NavItem } from '@/router/navigation'
import { usePermission } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/misc'

/**
 * The sidebar.
 *
 * A dark quarry face (`stone-rail`, in `styles/stone-shell.css`), because this
 * is the one piece of chrome that is always on screen and it should read as
 * the company's own system rather than as a generic admin template. Each item
 * carries a one-line hint: staff who use this occasionally should not have to
 * remember what "Closing" means.
 *
 * An item without its required permission is not just hidden — it's removed
 * from the list entirely, matching "what the user can see" from AppRouter's
 * matching per-route `RequirePermission` guard.
 *
 * Two independent pieces of UI state, both owned by `AppLayout` (the one
 * ancestor both the desktop rail and the mobile drawer share) so they never
 * drift out of sync between the two:
 *   - `collapsed` — the desktop rail only, icon-only vs. full width.
 *   - `openGroups` — which accordion sections are expanded; shared by both,
 *     built on Radix's own `Accordion` (already used elsewhere in the app)
 *     rather than a hand-rolled collapsible.
 */
function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const link = (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      onClick={onNavigate}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass-400',
          collapsed && 'justify-center px-0 py-2.5',
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
              'h-[1.05rem] w-[1.05rem] shrink-0 transition-colors',
              !collapsed && 'mt-0.5',
              isActive ? 'text-brass-300' : 'text-sidebar-muted group-hover:text-brass-200',
            )}
            aria-hidden
          />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-medium leading-tight">{item.label}</span>
              <span
                className={cn(
                  'mt-0.5 block truncate text-2xs leading-tight',
                  isActive ? 'text-white/60' : 'text-sidebar-muted/70',
                )}
              >
                {item.hint}
              </span>
            </span>
          )}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

export function SidebarNav({
  onNavigate,
  collapsed = false,
  openGroups,
  onOpenGroupsChange,
}: {
  onNavigate?: () => void
  /** Icon-only rail — desktop only; the mobile drawer never collapses. */
  collapsed?: boolean
  openGroups: string[]
  onOpenGroupsChange: (value: string[]) => void
}) {
  const location = useLocation()
  const active = activePath(location.pathname)

  // Every item's permission(s) checked via .map (never .some/early-exit), so
  // the number of hook calls this component makes is fixed across renders
  // regardless of which permissions happen to be true — what the rules of
  // hooks actually require, since `navigation` itself never changes shape.
  const allowedByPath = new Map(
    navigationSegments
      .flatMap((segment) => (segment.type === 'item' ? [segment.item] : segment.items))
      .map((item) => {
        const required = Array.isArray(item.permission) ? item.permission : [item.permission]
        const ok = required.map((name) => usePermission(name)).some(Boolean) // eslint-disable-line react-hooks/rules-of-hooks
        return [item.path, ok] as const
      }),
  )

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4" aria-label="Main">
      <Accordion type="multiple" value={openGroups} onValueChange={onOpenGroupsChange}>
        {navigationSegments.map((segment) => {
          if (segment.type === 'item') {
            if (!allowedByPath.get(segment.item.path)) return null
            return <NavItemLink key={segment.item.path} item={segment.item} collapsed={collapsed} onNavigate={onNavigate} />
          }

          const visibleItems = segment.items.filter((item) => allowedByPath.get(item.path))
          if (visibleItems.length === 0) return null

          // Collapsed rail: no room for a group header, so the section
          // flattens to a plain icon stack — grouping is a labelling aid,
          // and there are no labels to group once only icons remain.
          if (collapsed) {
            return visibleItems.map((item) => (
              <NavItemLink key={item.path} item={item} collapsed onNavigate={onNavigate} />
            ))
          }

          const isGroupActive = visibleItems.some((item) => item.path === active)

          return (
            <AccordionItem
              key={segment.name}
              value={segment.name}
              className="border-0 bg-transparent shadow-none data-[state=open]:shadow-none"
            >
              <AccordionTrigger
                className={cn(
                  'rounded-lg px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider hover:bg-white/[0.06]',
                  isGroupActive ? 'text-brass-300' : 'text-sidebar-muted/70',
                )}
              >
                {segment.name}
              </AccordionTrigger>
              <AccordionContent className="space-y-0.5 border-0 px-0 py-1">
                {visibleItems.map((item) => (
                  <NavItemLink key={item.path} item={item} collapsed={false} onNavigate={onNavigate} />
                ))}
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </nav>
  )
}

/**
 * The house mark: three stacked stones, narrowing upward. Drawn rather than
 * set as the letters "BI" because the rail now carries quarry imagery and a
 * two-letter monogram in the middle of it reads as a placeholder.
 */
function StoneStack() {
  return (
    /* Offset left and right rather than stacked on one axis — three centred
       ellipses narrowing upward read as a head and shoulders at this size. */
    <svg viewBox="0 0 24 24" className="h-[1.15rem] w-[1.15rem]" aria-hidden focusable="false">
      <ellipse cx="12" cy="19" rx="8.5" ry="2.7" fill="currentColor" opacity="0.95" />
      <ellipse cx="10.4" cy="13.6" rx="6.2" ry="2.4" fill="currentColor" opacity="0.72" />
      <ellipse cx="13.4" cy="8.4" rx="4.3" ry="2.1" fill="currentColor" opacity="0.5" />
      <ellipse cx="11.2" cy="4.2" rx="2.4" ry="1.5" fill="currentColor" opacity="0.32" />
    </svg>
  )
}

function Wordmark({
  collapsed,
  onToggleCollapsed,
}: {
  /** Only the desktop rail can collapse — the mobile drawer renders a static, non-interactive wordmark, unchanged. */
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const badge = (
    <span className="stone-mark grid h-9 w-9 shrink-0 place-items-center rounded-xl">
      <StoneStack />
    </span>
  )

  if (!onToggleCollapsed) {
    return (
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-4">
        {badge}
        <span className="min-w-0">
          <span className="block truncate font-display text-[0.9375rem] leading-tight tracking-wide text-white">
            BHUIYAN INDUSTRY
          </span>
          <span className="block text-2xs uppercase tracking-[0.14em] text-brass-300/80">Accounts &amp; Production</span>
        </span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggleCollapsed}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-expanded={!collapsed}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      className={cn(
        'group/wordmark relative flex w-full items-center gap-3 border-b border-white/[0.07] px-5 py-4 text-left transition-colors',
        'hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brass-400',
        collapsed && 'justify-center px-0',
      )}
    >
      {badge}
      {!collapsed && (
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[0.9375rem] leading-tight tracking-wide text-white">
            BHUIYAN INDUSTRY
          </span>
          <span className="block text-2xs uppercase tracking-[0.14em] text-brass-300/80">Accounts &amp; Production</span>
        </span>
      )}
      {!collapsed && (
        <ChevronLeft
          className="h-3.5 w-3.5 shrink-0 text-sidebar-muted opacity-0 transition-opacity group-hover/wordmark:opacity-100"
          aria-hidden
        />
      )}
      {collapsed && (
        <ChevronRight
          className="absolute right-1.5 h-3 w-3 shrink-0 text-sidebar-muted opacity-0 transition-opacity group-hover/wordmark:opacity-100"
          aria-hidden
        />
      )}
    </button>
  )
}

function SidebarFooter({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) return <div className="py-3" />

  return (
    <div className="px-5 pb-5 pt-4">
      <p className="stone-motto font-display text-[0.9375rem] leading-snug text-white/90">
        BHUIYAN INDUSTRY
      </p>
      <p className="mt-2.5 text-2xs tracking-wide text-sidebar-muted/70">
        Internal Management System
      </p>
    </div>
  )
}

/** Fixed rail, desktop only — the one that actually collapses to icons. */
export function Sidebar({
  collapsed,
  onToggleCollapsed,
  openGroups,
  onOpenGroupsChange,
}: {
  collapsed: boolean
  onToggleCollapsed: () => void
  openGroups: string[]
  onOpenGroupsChange: (value: string[]) => void
}) {
  return (
    <aside
      className={cn(
        'no-print stone-rail fixed inset-y-0 left-0 z-30 hidden flex-col transition-[width] duration-200 ease-in-out lg:flex',
        collapsed ? 'w-[76px]' : 'w-[264px]',
      )}
    >
      <Wordmark collapsed={collapsed} onToggleCollapsed={onToggleCollapsed} />
      <SidebarNav collapsed={collapsed} openGroups={openGroups} onOpenGroupsChange={onOpenGroupsChange} />
      <SidebarFooter collapsed={collapsed} />
    </aside>
  )
}

/** Slide-out drawer, mobile and tablet — always full width, never collapses. */
export function MobileSidebar({
  open,
  onClose,
  openGroups,
  onOpenGroupsChange,
}: {
  open: boolean
  onClose: () => void
  openGroups: string[]
  onOpenGroupsChange: (value: string[]) => void
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
          'stone-rail absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col shadow-pop',
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

        <SidebarNav onNavigate={onClose} openGroups={openGroups} onOpenGroupsChange={onOpenGroupsChange} />
        <SidebarFooter />
      </div>
    </div>
  )
}
