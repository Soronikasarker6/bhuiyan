import { describe, expect, it } from 'vitest'
import { LayoutDashboard } from 'lucide-react'
import type { NavItem } from '@/router/navigation'
import { buildNavigationSegments, groupContaining, navigation, navigationSegments } from '@/router/navigation'

/**
 * The sidebar's grouping convention (§ Sidebar.tsx): a `group` label marks
 * only the *first* item of a new section — every item after it, until the
 * next `group` label, belongs to that same section. `buildNavigationSegments`
 * is what both the desktop rail and the mobile drawer rely on to render that
 * correctly instead of re-deriving it themselves.
 */

const item = (label: string, group?: string): NavItem => ({
  label,
  path: `/${label.toLowerCase()}`,
  icon: LayoutDashboard,
  hint: '',
  group,
  permission: 'ANY',
})

describe('buildNavigationSegments', () => {
  it('keeps a leading ungrouped item standalone', () => {
    const segments = buildNavigationSegments([item('Dashboard')])
    expect(segments).toEqual([{ type: 'item', item: item('Dashboard') }])
  })

  it('folds every item after a group label into that group, until the next label', () => {
    const segments = buildNavigationSegments([
      item('Dashboard'),
      item('Import', 'Operations'),
      item('Production'),
      item('Sales'),
      item('Customers', 'Customers'),
    ])

    expect(segments).toEqual([
      { type: 'item', item: item('Dashboard') },
      {
        type: 'group',
        name: 'Operations',
        items: [item('Import', 'Operations'), item('Production'), item('Sales')],
      },
      { type: 'group', name: 'Customers', items: [item('Customers', 'Customers')] },
    ])
  })

  it('treats a group label with no ungrouped item first the same way', () => {
    const segments = buildNavigationSegments([item('Import', 'Operations'), item('Production')])
    expect(segments).toHaveLength(1)
    expect(segments[0]).toMatchObject({ type: 'group', name: 'Operations' })
  })
})

describe('navigationSegments (this app\'s real sidebar data)', () => {
  it('groups Operations as exactly Raw Material Import, Production & Stock and Sales', () => {
    const operations = navigationSegments.find((s) => s.type === 'group' && s.name === 'Operations')
    expect(operations?.type).toBe('group')
    expect(operations && operations.type === 'group' ? operations.items.map((i) => i.label) : []).toEqual([
      'Raw Material Import',
      'Production & Stock',
      'Sales',
    ])
  })

  it('keeps Dashboard standalone, not part of any group', () => {
    const dashboard = navigationSegments.find((s) => s.type === 'item' && s.item.path === '/')
    expect(dashboard).toBeDefined()
  })

  it('accounts for every nav item exactly once', () => {
    const flattened = navigationSegments.flatMap((s) => (s.type === 'item' ? [s.item] : s.items))
    expect(flattened).toHaveLength(navigation.length)
  })
})

describe('groupContaining', () => {
  it('finds the group a route belongs to', () => {
    expect(groupContaining('/sales')).toBe('Operations')
    expect(groupContaining('/customers/abc123')).toBe('Customers')
  })

  it('returns null for a standalone route', () => {
    expect(groupContaining('/')).toBeNull()
  })
})
