import type { ID } from './common'

/**
 * One recorded action, as the Admin-only Audit History screen reads it.
 *
 * These come from `/api/audit-logs`, never from `/app-data` — audit records
 * are not part of the application's working data and are never loaded for a
 * user who cannot see them.
 */

/** Mirrors backend/app/Support/AuditAction.php. */
export type AuditActionName =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'VOID'
  | 'RESTORE'
  | 'TRANSFER'
  | 'CLOSE_SHIPMENT'
  | 'REOPEN_SHIPMENT'
  | 'CLOSE_MONTH'
  | 'REOPEN_MONTH'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'PERMISSION_CHANGE'
  | 'DATA_RESET'

/** The table row. Deliberately without before/after — a listing stays small. */
export interface AuditLogRow {
  id: ID
  performedAt: string
  performedByUserId: ID | null
  performedByUserName: string
  action: AuditActionName | string
  module: string
  entityType: string
  entityId: string | null
  record: string | null
  summary: string | null
  reason: string | null
  hasChanges: boolean
}

/** One event opened in full, including the before/after values (§12). */
export interface AuditLogDetail extends AuditLogRow {
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  changedFields: string[]
  metadata: Record<string, unknown> | null
  ipAddress: string | null
}

export interface AuditLogPage {
  data: AuditLogRow[]
  meta: { currentPage: number; lastPage: number; perPage: number; total: number }
}

/** What the filter dropdowns offer — built from what has actually been recorded. */
export interface AuditFilterOptions {
  users: Array<{ id: ID; name: string }>
  actions: string[]
  modules: string[]
}

export interface AuditQuery {
  userId?: string
  action?: string
  module?: string
  entityType?: string
  entityId?: string
  from?: string
  to?: string
  search?: string
  page?: number
  perPage?: number
}
