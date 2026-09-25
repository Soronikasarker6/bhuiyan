import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, History, Search, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { PageSkeleton } from '@/components/PageSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { StoneLoader } from '@/components/ui/stone-loader'
import { AuditDetailDialog } from '@/features/audit/AuditDetailDialog'
import { usePageHeader } from '@/hooks/usePageHeader'
import { auditService } from '@/services/api/auditService'
import { actionLabel, actionTone } from '@/constants/audit'
import type { AuditFilterOptions, AuditLogRow, AuditQuery } from '@/types'
import { formatDateTime } from '@/utils/format'

const PER_PAGE = 25
const ALL = '__all__'

/**
 * Settings → Audit History. Admin only.
 *
 * Everything the system records about who changed what, in one place. The
 * route is guarded (`RequirePermission AUDIT_VIEW`) and the menu item is
 * hidden without the permission — but neither of those is what enforces it:
 * every endpoint behind this screen is refused server-side for anyone but an
 * Admin, so typing the URL, or calling the API directly with a Manager's
 * token, gets a 403 either way.
 *
 * Read-only by construction. There is nothing here that edits or deletes a
 * record, because the backend exposes no way to (§9) — this is a history, and
 * a history you can rewrite is not one.
 *
 * Paginated rather than loaded whole: audit history only ever grows, and
 * nothing here is cached in localStorage — the rows live only as long as the
 * screen is open (§25).
 */
export default function AuditHistoryPage() {
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [options, setOptions] = useState<AuditFilterOptions>({ users: [], actions: [], modules: [] })
  const [total, setTotal] = useState(0)
  const [lastPage, setLastPage] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const [userId, setUserId] = useState('')
  const [action, setAction] = useState('')
  const [module, setModule] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [search, setSearch] = useState('')

  const query = useMemo<AuditQuery>(
    () => ({ userId, action, module, from, to, search, page, perPage: PER_PAGE }),
    [userId, action, module, from, to, search, page],
  )

  // The search box filters server-side, so each keystroke would otherwise be
  // a request; a short pause is enough to make it one per phrase.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const result = await auditService.list({ ...query, search: debouncedSearch })
      setRows(result.data)
      setTotal(result.meta.total)
      setLastPage(result.meta.lastPage)
    } catch (error) {
      toast.error('Could not load the audit history', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setBusy(false)
      setLoading(false)
    }
    // `query.search` is replaced by the debounced value, so it is deliberately
    // not a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, action, module, from, to, debouncedSearch, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    auditService.filters().then(setOptions).catch(() => undefined)
  }, [])

  // Any filter change starts again from the first page — page 4 of the old
  // result set says nothing about the new one.
  const setFilter = (apply: () => void) => {
    apply()
    setPage(1)
  }

  const active = Boolean(userId || action || module || from || to || search)

  const clear = () => {
    setUserId('')
    setAction('')
    setModule('')
    setFrom('')
    setTo('')
    setSearch('')
    setPage(1)
  }

  const exportCsv = async () => {
    setExporting(true)
    try {
      const blob = await auditService.exportCsv({ ...query, search: debouncedSearch, page: undefined, perPage: undefined })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `audit-history-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast.success('Audit history exported', { description: 'Saved as CSV.' })
    } catch (error) {
      toast.error('Could not export the audit history', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setExporting(false)
    }
  }

  usePageHeader({
    title: 'Audit History',
    description:
      'Every recorded action across the system — who did it, when, and what changed. Visible to administrators only; entries can never be edited or removed.',
    actions: (
      <Button variant="outline" onClick={exportCsv} loading={exporting} disabled={total === 0}>
        <Download />
        Export CSV
      </Button>
    ),
  })

  if (loading) return <PageSkeleton />

  return (
    <div>
      <p className="mb-4 flex items-start gap-2 rounded-lg border border-brass-200 bg-brass-50/60 px-3 py-2 text-2xs leading-relaxed text-brass-800">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Audit records are written by the server from the signed-in session — never from anything the
          browser sends — and cannot be altered or deleted by anyone, including administrators. They may
          contain confidential figures, so this page is restricted to administrators.
        </span>
      </p>

      <Section
        title="Recorded activity"
        description={`${total} ${total === 1 ? 'event' : 'events'}${active ? ' · filtered' : ''}`}
        noPadding
      >
        {/* ------------------------------------------------ filters */}
        <div className="border-b border-border bg-secondary/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
            <div className="relative xl:col-span-2">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setFilter(() => setSearch(event.target.value))}
                placeholder="Search a record, summary, reason or user"
                className="pl-8"
                aria-label="Search the audit history"
              />
            </div>

            <Select
              value={userId || ALL}
              onValueChange={(v) => setFilter(() => setUserId(v === ALL ? '' : v))}
            >
              <SelectTrigger aria-label="Filter by user">
                <SelectValue placeholder="All users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All users</SelectItem>
                {options.users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={action || ALL}
              onValueChange={(v) => setFilter(() => setAction(v === ALL ? '' : v))}
            >
              <SelectTrigger aria-label="Filter by action">
                <SelectValue placeholder="All actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All actions</SelectItem>
                {options.actions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {actionLabel(name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={module || ALL}
              onValueChange={(v) => setFilter(() => setModule(v === ALL ? '' : v))}
            >
              <SelectTrigger aria-label="Filter by module">
                <SelectValue placeholder="All modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All modules</SelectItem>
                {options.modules.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="sm:col-span-2 xl:col-span-2">
              <DateRangePicker
                from={from}
                to={to}
                onChange={(nextFrom, nextTo) =>
                  setFilter(() => {
                    setFrom(nextFrom)
                    setTo(nextTo)
                  })
                }
                aria-label="Date range"
                className="text-xs"
              />
            </div>
          </div>

          {(active || busy) && (
            <div className="mt-2.5 flex items-center gap-3">
              {busy && (
                <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                  <StoneLoader />
                  Loading
                </span>
              )}
              {active && (
                <Button variant="ghost" size="sm" onClick={clear} className="ml-auto h-6 px-2 text-2xs">
                  <X className="h-3 w-3" />
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------ rows */}
        {rows.length === 0 ? (
          <EmptyState
            icon={active ? Search : History}
            size={active ? 'sm' : 'lg'}
            title={active ? 'Nothing matches these filters' : 'No activity recorded yet'}
            description={
              active
                ? 'Try widening the date range, or clearing the user and module filters.'
                : 'Every create, edit and removal across the system will appear here as it happens.'
            }
            action={
              active ? (
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Module</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={() => setOpenId(row.id)}
                    className="cursor-pointer"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setOpenId(row.id)
                      }
                    }}
                    aria-label={`Open the audit event for ${row.record ?? row.module}`}
                  >
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.performedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{row.performedByUserName}</TableCell>
                    <TableCell>
                      <Badge variant={actionTone(row.action)} className="font-normal">
                        {actionLabel(row.action)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{row.module}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono tabular text-xs">
                      {row.record ?? '—'}
                    </TableCell>
                    <TableCell className="max-w-[22rem]">
                      <span className="block truncate">{row.summary ?? '—'}</span>
                      {row.reason && (
                        <span className="mt-0.5 block truncate text-2xs text-muted-foreground">
                          Reason: {row.reason}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {lastPage > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5">
                <p className="text-2xs text-muted-foreground">
                  Page <span className="font-mono tabular">{page}</span> of{' '}
                  <span className="font-mono tabular">{lastPage}</span> ·{' '}
                  <span className="font-mono tabular">{total}</span> events
                </p>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 1 || busy}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= lastPage || busy}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      <AuditDetailDialog id={openId} onOpenChange={(open) => !open && setOpenId(null)} />
    </div>
  )
}
