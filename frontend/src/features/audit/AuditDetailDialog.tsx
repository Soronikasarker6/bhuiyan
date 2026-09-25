import { useEffect, useState } from 'react'
import { Dialog } from '@ui5/webcomponents-react/Dialog'
import { Bar } from '@ui5/webcomponents-react/Bar'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { StoneLoader } from '@/components/ui/stone-loader'
import { auditService } from '@/services/api/auditService'
import { actionLabel, actionTone, fieldLabel, isMoneyField } from '@/constants/audit'
import type { AuditLogDetail } from '@/types'
import { formatCurrency, formatDateTime } from '@/utils/format'
import { cn } from '@/utils/cn'

/**
 * One audit event, opened in full (§12).
 *
 * The event's own facts first — what happened, to which record, by whom, when,
 * and why — then the before/after comparison. Only the fields that actually
 * changed are shown by default: an UPDATE that moved one amount should read as
 * one line, not as twenty identical ones with a needle in them. Everything
 * else is one click away.
 *
 * Fetched on open rather than bundled into the listing: before/after payloads
 * are the largest part of an audit record and most rows are never opened.
 */
export function AuditDetailDialog({
  id,
  onOpenChange,
}: {
  id: string | null
  onOpenChange: (open: boolean) => void
}) {
  const [detail, setDetail] = useState<AuditLogDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!id) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setShowAll(false)
    setDetail(null)

    auditService
      .show(id)
      .then((result) => {
        if (!cancelled) setDetail(result)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this audit event.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [id])

  const before = detail?.before ?? null
  const after = detail?.after ?? null
  const changed = detail?.changedFields ?? []

  // Every key on either side, so a field that only exists before (a removed
  // record) or only after (a new one) is still shown.
  const allKeys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]))
  const keys = showAll || changed.length === 0 ? allKeys : allKeys.filter((key) => changed.includes(key))

  return (
    <Dialog
      open={id !== null}
      headerText="Audit event"
      onClose={() => onOpenChange(false)}
      footer={
        <Bar
          design="Footer"
          endContent={
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          }
        />
      }
    >
      <div className="min-w-[20rem] max-w-[34rem] space-y-4 p-1">
        {loading && (
          <p className="flex items-center gap-2 py-6 text-[0.8125rem] text-muted-foreground">
            <StoneLoader />
            Loading the event…
          </p>
        )}

        {error && <p className="py-4 text-[0.8125rem] text-destructive">{error}</p>}

        {detail && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-[0.8125rem]">
              <dt className="text-muted-foreground">Action</dt>
              <dd>
                <Badge variant={actionTone(detail.action)} className="font-normal">
                  {actionLabel(detail.action)}
                </Badge>
              </dd>

              <dt className="text-muted-foreground">Module</dt>
              <dd className="font-medium">{detail.module}</dd>

              <dt className="text-muted-foreground">Record</dt>
              <dd className="font-mono tabular text-xs">{detail.record ?? '—'}</dd>

              <dt className="text-muted-foreground">Performed by</dt>
              <dd className="font-medium">{detail.performedByUserName}</dd>

              <dt className="text-muted-foreground">Performed at</dt>
              <dd>{formatDateTime(detail.performedAt)}</dd>

              {detail.summary && (
                <>
                  <dt className="text-muted-foreground">Summary</dt>
                  <dd>{detail.summary}</dd>
                </>
              )}

              {detail.reason && (
                <>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd className="italic">{detail.reason}</dd>
                </>
              )}
            </dl>

            {allKeys.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {before && after ? 'Before and after' : before ? 'Recorded values' : 'Values recorded'}
                  </h3>
                  {changed.length > 0 && changed.length < allKeys.length && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-2xs"
                      onClick={() => setShowAll(!showAll)}
                    >
                      {showAll ? 'Only what changed' : `Show all ${allKeys.length} fields`}
                    </Button>
                  )}
                </div>

                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-[0.8125rem]">
                    <tbody>
                      {keys.map((key, index) => (
                        <ComparisonRow
                          key={key}
                          field={key}
                          before={before?.[key]}
                          after={after?.[key]}
                          changed={changed.includes(key)}
                          showBoth={Boolean(before && after)}
                          striped={index % 2 === 1}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-2xs text-muted-foreground">
                This event has no stored values — it records that the action happened, by whom and when.
              </p>
            )}

            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <div>
                <h3 className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Context
                </h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 text-2xs">
                  {Object.entries(detail.metadata).map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-muted-foreground">{fieldLabel(key)}</dt>
                      <dd className="truncate font-medium">{renderValue(key, value)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </>
        )}
      </div>
    </Dialog>
  )
}

function ComparisonRow({
  field,
  before,
  after,
  changed,
  showBoth,
  striped,
}: {
  field: string
  before: unknown
  after: unknown
  changed: boolean
  showBoth: boolean
  striped: boolean
}) {
  return (
    <tr className={cn('border-b border-border last:border-0', striped && 'bg-secondary/30')}>
      <th scope="row" className="w-[9rem] px-3 py-1.5 text-left align-top font-normal text-muted-foreground">
        {fieldLabel(field)}
      </th>

      {showBoth ? (
        <>
          <td
            className={cn(
              'px-3 py-1.5 align-top',
              changed ? 'text-destructive line-through decoration-destructive/40' : 'text-muted-foreground',
            )}
          >
            {renderValue(field, before)}
          </td>
          <td className="w-5 px-0 py-1.5 align-top text-muted-foreground">
            {changed && <ArrowRight className="h-3 w-3" aria-label="changed to" />}
          </td>
          <td className={cn('px-3 py-1.5 align-top', changed && 'font-semibold text-success-800')}>
            {renderValue(field, after)}
          </td>
        </>
      ) : (
        <td className="px-3 py-1.5 align-top font-medium" colSpan={3}>
          {renderValue(field, after ?? before)}
        </td>
      )}
    </tr>
  )
}

/** Money as Taka, booleans as Yes/No, lists comma-separated, objects as compact JSON. */
function renderValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map((v) => String(v)).join(', ')

  if (isMoneyField(field) && typeof value !== 'object') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return formatCurrency(numeric)
  }

  if (typeof value === 'object') return JSON.stringify(value)

  return String(value)
}
