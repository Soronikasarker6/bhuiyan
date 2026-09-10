import {
  BarChart3,
  BookText,
  Boxes,
  Factory,
  LayoutDashboard,
  Lock,
  Package,
  Receipt,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PERMISSIONS } from '@/constants/permissions'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Shown under the label in the sidebar — what the screen is actually for. */
  hint: string
  /** A short uppercase section label shown above the first item of a new group. */
  group?: string
  /** Hidden from the sidebar (and blocked at the route) without this — see Sidebar.tsx and AppRouter.tsx. */
  permission: string | string[]
}

/**
 * The sidebar, as data.
 *
 * Grouped the way the work happens: see where you stand, record what the
 * yard produced and sold, manage who you sold it to and what they owe,
 * track the company's own cash position, keep the product list current,
 * then report on all of it.
 */
export const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
    hint: 'Production, sales and balances at a glance',
    permission: PERMISSIONS.DASHBOARD_VIEW,
  },
  {
    label: 'Raw Material Import',
    path: '/import',
    icon: Factory,
    hint: 'Gross, tare and net weight by product',
    group: 'Operations',
    permission: PERMISSIONS.RAW_MATERIAL_VIEW,
  },
  {
    label: 'Production & Stock',
    path: '/production',
    icon: Boxes,
    hint: 'Mesh-wise bagging and stock in hand',
    permission: PERMISSIONS.PRODUCTION_VIEW,
  },
  {
    label: 'Sales',
    path: '/sales',
    icon: Receipt,
    hint: 'Invoices, customers, trucks and rates',
    permission: PERMISSIONS.SALES_VIEW,
  },
  {
    label: 'Customers',
    path: '/customers',
    icon: Users,
    hint: 'Every customer and their balance',
    group: 'Customers',
    permission: PERMISSIONS.CUSTOMERS_VIEW,
  },
  {
    label: 'Customer Ledger',
    path: '/customer-ledger',
    icon: BookText,
    hint: 'Every sale and payment, running balance included',
    permission: PERMISSIONS.CUSTOMER_LEDGER_VIEW,
  },
  {
    label: 'Cash In',
    path: '/payments',
    icon: Wallet,
    hint: 'Customer payments, on account',
    permission: PERMISSIONS.CASH_IN_VIEW,
  },
  {
    label: 'Profit & Loss',
    path: '/pnl',
    icon: TrendingUp,
    hint: 'Sales, cost of goods sold and net profit by month',
    group: 'Company Finance',
    permission: PERMISSIONS.PROFIT_VIEW,
  },
  {
    label: 'Cash & Bank Ledger',
    path: '/ledger',
    icon: Wallet,
    hint: 'Receipts, payments and transfers',
    permission: PERMISSIONS.LEDGER_VIEW,
  },
  {
    label: 'Monthly Closing',
    path: '/closing',
    icon: Lock,
    hint: 'Freeze a month’s cash & bank balances',
    permission: PERMISSIONS.CLOSING_VIEW,
  },
  {
    label: 'Products & Mesh Sizes',
    path: '/products',
    icon: Package,
    hint: 'Stone types and configurable sale attributes',
    group: 'Inventory',
    permission: PERMISSIONS.RAW_MATERIAL_VIEW,
  },
  {
    label: 'Reports',
    path: '/reports',
    icon: BarChart3,
    hint: 'Production, sales and customer reports',
    group: 'Reports',
    permission: PERMISSIONS.REPORTS_VIEW,
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    hint: 'Accounts, categories and data',
    group: 'System',
    permission: [PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.USERS_VIEW, PERMISSIONS.ROLES_VIEW],
  },
]

/** Page titles for the header, keyed by path. Customer detail resolves specially. */
export const pageTitles: Record<string, string> = navigation.reduce(
  (titles, item) => ({ ...titles, [item.path]: item.label }),
  {},
)

/** Longest-prefix match, so /customers/anything still highlights Customers. */
export function activePath(pathname: string): string {
  const matches = navigation
    .map((item) => item.path)
    .filter((path) => pathname === path || (path !== '/' && pathname.startsWith(`${path}/`)))
    .sort((a, b) => b.length - a.length)

  return matches[0] ?? '/'
}

/**
 * The sidebar as sections, derived from `navigation` rather than duplicated.
 *
 * `NavItem.group` only ever marks the *first* item of a new section — every
 * item after it belongs to that same section until another `group` label
 * appears (see the data above: "Operations" covers Raw Material Import,
 * Production & Stock and Sales; a lone item with no `group` at all, like
 * Dashboard, stays standalone). This walks that convention once so
 * `Sidebar.tsx` never has to re-derive it, and computing it here — not per
 * render — means it's also trivial to unit test on its own.
 */
export type NavSegment =
  | { type: 'item'; item: NavItem }
  | { type: 'group'; name: string; items: NavItem[] }

export function buildNavigationSegments(items: NavItem[]): NavSegment[] {
  const segments: NavSegment[] = []

  for (const item of items) {
    if (item.group) {
      segments.push({ type: 'group', name: item.group, items: [item] })
      continue
    }

    const last = segments[segments.length - 1]
    if (last?.type === 'group') {
      last.items.push(item)
    } else {
      segments.push({ type: 'item', item })
    }
  }

  return segments
}

export const navigationSegments: NavSegment[] = buildNavigationSegments(navigation)

/** Which group (if any) the given path currently falls under — used to open that group by default. */
export function groupContaining(pathname: string): string | null {
  const current = activePath(pathname)
  const segment = navigationSegments.find(
    (s) => s.type === 'group' && s.items.some((item) => item.path === current),
  )
  return segment?.type === 'group' ? segment.name : null
}
