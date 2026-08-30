import {
  BarChart3,
  BookText,
  Factory,
  LayoutDashboard,
  Lock,
  Package,
  PiggyBank,
  Receipt,
  Settings,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Shown under the label in the sidebar — what the screen is actually for. */
  hint: string
  /** A short uppercase section label shown above the first item of a new group. */
  group?: string
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
  },
  {
    label: 'Production',
    path: '/production',
    icon: Factory,
    hint: 'Gross, tare and net weight by product',
    group: 'Operations',
  },
  {
    label: 'Sales',
    path: '/sales',
    icon: Receipt,
    hint: 'Invoices, customers, trucks and rates',
  },
  {
    label: 'Customers',
    path: '/customers',
    icon: Users,
    hint: 'Every customer and their balance',
    group: 'Customers',
  },
  {
    label: 'Customer Ledger',
    path: '/customer-ledger',
    icon: BookText,
    hint: 'Every sale, payment and advance, in order',
  },
  {
    label: 'Advances',
    path: '/advances',
    icon: PiggyBank,
    hint: 'Money received ahead of a sale',
  },
  {
    label: 'Payments',
    path: '/payments',
    icon: Wallet,
    hint: 'Collections against due invoices',
  },
  {
    label: 'Monthly P&L',
    path: '/pnl',
    icon: TrendingUp,
    hint: 'Company profit and loss by month',
    group: 'Company Finance',
  },
  {
    label: 'Cash & Bank Ledger',
    path: '/ledger',
    icon: Wallet,
    hint: 'Receipts, payments and transfers',
  },
  {
    label: 'Monthly Closing',
    path: '/closing',
    icon: Lock,
    hint: 'Freeze a month’s cash & bank balances',
  },
  {
    label: 'Products & Mesh Sizes',
    path: '/products',
    icon: Package,
    hint: 'Stone types and configurable sale attributes',
    group: 'Inventory',
  },
  {
    label: 'Reports',
    path: '/reports',
    icon: BarChart3,
    hint: 'Production, sales and customer reports',
    group: 'Reports',
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    hint: 'Accounts, categories and data',
    group: 'System',
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
