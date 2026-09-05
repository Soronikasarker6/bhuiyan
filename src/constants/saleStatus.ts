import type { PaymentStatus } from '@/types'

/**
 * How a sale's payment status reads on screen — one definition, used
 * everywhere a `Badge` shows a `PaymentStatus` (was copy-pasted identically
 * across `DashboardPage`, `CustomerDetailPage`, and `SalesTable` before this
 * moved here).
 */
export const SALE_STATUS_LABEL: Record<PaymentStatus, string> = {
  paid: 'Paid',
  partial: 'Partial',
  due: 'Due',
}

export const SALE_STATUS_VARIANT: Record<PaymentStatus, 'success' | 'brass' | 'destructive'> = {
  paid: 'success',
  partial: 'brass',
  due: 'destructive',
}
