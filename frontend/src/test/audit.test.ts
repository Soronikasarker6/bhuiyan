import { describe, expect, it } from 'vitest'
import { actionLabel, actionTone, fieldLabel, isMoneyField } from '@/constants/audit'
import { PERMISSIONS, PERMISSION_GROUPS } from '@/constants/permissions'
import { navigation, navigationSegments } from '@/router/navigation'

/**
 * The audit trail's frontend surface.
 *
 * None of this is what *enforces* Admin-only access — every audit endpoint
 * refuses a non-admin server-side, which is covered by the backend's
 * AuditAuthorizationTest. What these guard is the frontend half of the same
 * rule: that the menu entry is gated on the one Admin-only permission and
 * nothing weaker, so a future edit cannot quietly widen it to, say,
 * SETTINGS_VIEW (which a Manager could be granted).
 */

describe('Audit History navigation', () => {
  const auditItem = navigation.find((item) => item.path === '/settings/audit-history')

  it('exists, under Settings, in the System section', () => {
    expect(auditItem).toBeDefined()

    const system = navigationSegments.find((s) => s.type === 'group' && s.name === 'System')
    expect(system?.type).toBe('group')

    const labels = system && system.type === 'group' ? system.items.map((i) => i.label) : []
    expect(labels).toEqual(['Settings', 'Audit History'])
  })

  it('is gated on AUDIT_VIEW alone — never on a permission a Manager can hold', () => {
    expect(auditItem?.permission).toBe(PERMISSIONS.AUDIT_VIEW)

    // An array would mean "any of these", which is exactly how a weaker
    // permission would sneak in.
    expect(Array.isArray(auditItem?.permission)).toBe(false)
  })

  it('is the only nav item that asks for AUDIT_VIEW', () => {
    const asking = navigation.filter((item) =>
      (Array.isArray(item.permission) ? item.permission : [item.permission]).includes(PERMISSIONS.AUDIT_VIEW),
    )
    expect(asking.map((i) => i.path)).toEqual(['/settings/audit-history'])
  })

  it('offers AUDIT_VIEW in the role editor, so an admin can see who holds it', () => {
    const all = PERMISSION_GROUPS.flatMap((group) => group.permissions)
    expect(all).toContain(PERMISSIONS.AUDIT_VIEW)
    expect(all).toContain(PERMISSIONS.LEDGER_EDIT)
  })
})

describe('audit labels', () => {
  it('names the actions the brief asks for', () => {
    expect(actionLabel('CREATE')).toBe('Created')
    expect(actionLabel('UPDATE')).toBe('Updated')
    expect(actionLabel('VOID')).toBe('Voided')
    expect(actionLabel('PERMISSION_CHANGE')).toBe('Permission change')
  })

  it('falls back to a readable form for an action it has not been taught', () => {
    expect(actionLabel('SOME_NEW_ACTION')).toBe('Some new action')
  })

  it('marks destructive actions as destructive', () => {
    expect(actionTone('VOID')).toBe('destructive')
    expect(actionTone('DELETE')).toBe('destructive')
    expect(actionTone('CREATE')).toBe('success')
    expect(actionTone('ANYTHING_ELSE')).toBe('outline')
  })

  it('names fields the way the screens they came from do', () => {
    expect(fieldLabel('category_name')).toBe('Category')
    expect(fieldLabel('total_weight_ton')).toBe('Billable TON')
    expect(fieldLabel('rate_per_ton')).toBe('Rate / TON')
    expect(fieldLabel('unmapped_field')).toBe('Unmapped field')
  })

  it('knows which fields are money, so ৳7,000 never prints as 7000', () => {
    expect(isMoneyField('amount')).toBe(true)
    expect(isMoneyField('credit')).toBe(true)
    expect(isMoneyField('rate_per_ton')).toBe(true)
    // A bag count is a number too, which is why this is a list and not a guess.
    expect(isMoneyField('bags')).toBe(false)
  })
})
