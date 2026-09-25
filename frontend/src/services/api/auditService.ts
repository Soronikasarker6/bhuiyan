import type { AuditFilterOptions, AuditLogDetail, AuditLogPage, AuditQuery } from '@/types'
import { getToken } from './httpClient'
import { http } from './httpClient'
import { mapEntity, toQuery } from './mappers'

/**
 * The Admin-only Audit History API.
 *
 * Nothing here is part of `/app-data`: audit records are never bundled into
 * the payload every signed-in user receives, so a Manager's browser never
 * holds them in the first place. Nothing is cached in localStorage either —
 * these responses live only for as long as the screen is open.
 *
 * There is no create/update/delete here because the backend exposes none:
 * audit records are immutable (§9).
 */

function queryString(query: AuditQuery): string {
  return toQuery({
    user_id: query.userId,
    action: query.action,
    module: query.module,
    entity_type: query.entityType,
    entity_id: query.entityId,
    from: query.from,
    to: query.to,
    search: query.search,
    page: query.page,
    per_page: query.perPage,
  })
}

export const auditService = {
  async list(query: AuditQuery = {}): Promise<AuditLogPage> {
    return mapEntity<AuditLogPage>(await http.get(`/audit-logs${queryString(query)}`))
  },

  async show(id: string): Promise<AuditLogDetail> {
    // `mapEntity` camelCases keys, which is right for the envelope but wrong
    // for `before`/`after`: those are verbatim snapshots of what was stored
    // and their keys are part of the record. They are re-attached raw below.
    const raw = (await http.get(`/audit-logs/${id}`)) as Record<string, unknown>
    const mapped = mapEntity<AuditLogDetail>(raw)

    return {
      ...mapped,
      before: (raw.before ?? null) as AuditLogDetail['before'],
      after: (raw.after ?? null) as AuditLogDetail['after'],
      changedFields: (raw.changedFields ?? []) as string[],
      metadata: (raw.metadata ?? null) as AuditLogDetail['metadata'],
    }
  },

  async filters(): Promise<AuditFilterOptions> {
    return mapEntity<AuditFilterOptions>(await http.get('/audit-logs/filters'))
  },

  /**
   * Downloads the current filter's results as CSV.
   *
   * Fetched with the auth header rather than opened as a plain link: the
   * export endpoint is permission-gated like every other audit route, and a
   * bare `window.open` would arrive without a token and be refused.
   */
  async exportCsv(query: AuditQuery = {}): Promise<Blob> {
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'
    const token = getToken()

    const response = await fetch(`${base}/audit-logs/export${queryString(query)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })

    if (!response.ok) {
      throw new Error(
        response.status === 403
          ? 'You do not have permission to export the audit history.'
          : `Could not export the audit history (${response.status}).`,
      )
    }

    return response.blob()
  },
}
