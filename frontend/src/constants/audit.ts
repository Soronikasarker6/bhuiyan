import type { AuditActionName } from '@/types'

/**
 * How the Audit History screen prints what the backend recorded.
 *
 * The stored values stay machine-readable (`VOID`, `paid_at_sale`) so history
 * written years apart is still comparable and filterable; everything here is
 * purely the label put in front of a human. A value with no entry falls back
 * to a readable form of itself rather than disappearing, so an action added on
 * the backend before this file catches up still renders.
 */

export const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Updated',
  DELETE: 'Deleted',
  VOID: 'Voided',
  RESTORE: 'Restored',
  TRANSFER: 'Transfer',
  CLOSE_SHIPMENT: 'Closed shipment',
  REOPEN_SHIPMENT: 'Reopened shipment',
  CLOSE_MONTH: 'Closed month',
  REOPEN_MONTH: 'Reopened month',
  LOGIN: 'Signed in',
  LOGOUT: 'Signed out',
  PASSWORD_CHANGE: 'Password reset',
  PERMISSION_CHANGE: 'Permission change',
  DATA_RESET: 'Data reset',
}

/** Badge tone per action — destructive things should look destructive at a glance. */
export const ACTION_TONE: Record<string, 'success' | 'brass' | 'destructive' | 'outline'> = {
  CREATE: 'success',
  UPDATE: 'brass',
  DELETE: 'destructive',
  VOID: 'destructive',
  RESTORE: 'success',
  TRANSFER: 'brass',
  CLOSE_SHIPMENT: 'outline',
  REOPEN_SHIPMENT: 'outline',
  CLOSE_MONTH: 'outline',
  REOPEN_MONTH: 'outline',
  LOGIN: 'outline',
  LOGOUT: 'outline',
  PASSWORD_CHANGE: 'destructive',
  PERMISSION_CHANGE: 'destructive',
  DATA_RESET: 'destructive',
}

export function actionLabel(action: AuditActionName | string): string {
  return ACTION_LABELS[action] ?? humanise(action)
}

export function actionTone(action: AuditActionName | string) {
  return ACTION_TONE[action] ?? 'outline'
}

/**
 * Field names as they read on the screens they came from, so a before/after
 * comparison says "Amount" and "Category", not "amount" and "category_name".
 */
const FIELD_LABELS: Record<string, string> = {
  account_id: 'Account',
  account_name: 'Account',
  amount: 'Amount',
  bags: 'Bags',
  category_name: 'Category',
  closing_ton: 'Closing stock (TON)',
  consumed_ton: 'Consumed (TON)',
  credit: 'Amount',
  customer: 'Customer',
  customer_id: 'Customer',
  date: 'Date',
  debit: 'Amount',
  details: 'Details',
  direction: 'Direction',
  from_account: 'From',
  gross_weight_kg: 'Gross weight (KG)',
  invoice_no: 'Invoice no.',
  is_active: 'Active',
  linked_account_id: 'Deposited into',
  mesh_size: 'Mesh size',
  net_weight_kg: 'Net weight (KG)',
  net_weight_ton: 'Net weight (TON)',
  owner_name: 'Founder / CEO',
  paid_at_sale: 'Paid at sale',
  permissions: 'Permissions',
  price_per_ton: 'Price / TON',
  product: 'Product',
  product_id: 'Product',
  quantity_kg: 'Quantity (KG)',
  quantity_ton: 'Quantity (TON)',
  rate_per_ton: 'Rate / TON',
  received_ton: 'Received (TON)',
  reference: 'Reference',
  roles: 'Role',
  serial_no: 'Serial no.',
  ship_name: 'Ship name',
  status: 'Status',
  tare_weight_kg: 'Tare weight (KG)',
  to_account: 'To',
  total_amount: 'Total',
  total_weight_ton: 'Billable TON',
  truck_no: 'Truck no.',
  weight_ton: 'Weight (TON)',
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? humanise(key)
}

/**
 * Money fields print as Taka; the rest print as they are. Listed by name
 * rather than guessed from the value, because a rate and a bag count are both
 * just numbers.
 */
const MONEY_FIELDS = new Set([
  'amount', 'credit', 'debit', 'paid_at_sale', 'price_per_ton', 'rate_per_ton',
  'total_amount', 'value', 'grand_total', 'cash_total', 'bank_total',
])

export function isMoneyField(key: string): boolean {
  return MONEY_FIELDS.has(key)
}

function humanise(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase())
}
