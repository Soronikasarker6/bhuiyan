import { useMemo, useState } from 'react'
import { Search, Wallet } from 'lucide-react'
import type { ID, Transaction } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/Money'
import { formatDate } from '@/utils/format'

/**
 * Profit & Loss's "Company Costs" picker — every Cash Out transaction for the
 * selected month, with a checkbox for whether it counts toward the period's
 * Company Costs. Mirrors the checkbox-list idiom `RoleForm` uses for
 * permissions (plain checkboxes + a group toggle), not a UI5 table selection
 * model, since that's the pattern already established for "pick some of
 * these" in this codebase.
 *
 * Each row's checkbox is disabled while its own toggle request is in
 * flight — a UI5-style busy state scoped to that one row, so a slow request
 * can't be double-submitted and the rest of the list stays interactive.
 *
 * `canEdit` mirrors the backend's own PROFIT_EDIT gate on the toggle route —
 * a viewer without it (e.g. Staff, who can see P&L but not curate it) gets
 * read-only checkboxes rather than controls that would 403 on click.
 */
export function CompanyCostPicker({
  candidates,
  onToggle,
  canEdit,
}: {
  candidates: Transaction[]
  onToggle: (transactionId: ID, isCompanyCost: boolean) => Promise<void>
  canEdit: boolean
}) {
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<Set<ID>>(new Set())

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return candidates
    return candidates.filter((t) =>
      `${t.details ?? ''} ${t.category}`.toLowerCase().includes(needle),
    )
  }, [candidates, search])

  const selectedTotal = useMemo(
    () => candidates.filter((t) => t.isCompanyCost).reduce((sum, t) => sum + t.amount, 0),
    [candidates],
  )

  const setRowPending = (id: ID, busy: boolean) => {
    setPending((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggle = async (transaction: Transaction, checked: boolean) => {
    setRowPending(transaction.id, true)
    try {
      await onToggle(transaction.id, checked)
    } finally {
      setRowPending(transaction.id, false)
    }
  }

  const selectAll = async (checked: boolean) => {
    const targets = filtered.filter((t) => Boolean(t.isCompanyCost) !== checked)
    for (const t of targets) {
      await toggle(t, checked)
    }
  }

  const allChecked = filtered.length > 0 && filtered.every((t) => t.isCompanyCost)

  return (
    <Section
      title="Company costs — select Cash Out expenses"
      description="Only the Cash Out transactions checked below count toward this month's Company Costs."
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search description, category…"
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => selectAll(true)} disabled={!canEdit || filtered.length === 0}>
            Select all
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => selectAll(false)} disabled={!canEdit || filtered.length === 0}>
            Clear all
          </Button>
        </div>
      }
    >
      {candidates.length === 0 ? (
        <EmptyState icon={Wallet} size="sm" title="No Cash Out transactions this month" description="Nothing to select for Company Costs yet." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} size="sm" title="No matches" description="Try a different search." />
      ) : (
        <div className="max-h-[22rem] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          <label className="flex items-center gap-2 border-b border-border px-1.5 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-border accent-primary-700"
              checked={allChecked}
              disabled={!canEdit}
              onChange={(e) => selectAll(e.target.checked)}
            />
            {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
          </label>
          {filtered.map((t) => (
            <label
              key={t.id}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-xs hover:bg-secondary/40"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary-700"
                checked={Boolean(t.isCompanyCost)}
                disabled={!canEdit || pending.has(t.id)}
                onChange={(e) => toggle(t, e.target.checked)}
              />
              <span className="w-20 shrink-0 whitespace-nowrap text-muted-foreground">{formatDate(t.date)}</span>
              <span className="min-w-0 flex-1 truncate">{t.details || t.category}</span>
              <span className="shrink-0 text-2xs text-muted-foreground">{t.category}</span>
              <Money value={t.amount} size="sm" className="w-24 shrink-0 text-right" />
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <div className="inline-flex overflow-hidden rounded-lg border border-brass-200">
          <div className="bg-brass-100 px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-brass-800">
            Selected company costs
          </div>
          <div className="border-l border-brass-200 bg-brass-100 px-4 py-2">
            <Money value={selectedTotal} size="sm" weight="bold" className="text-brass-800" />
          </div>
        </div>
      </div>
    </Section>
  )
}
