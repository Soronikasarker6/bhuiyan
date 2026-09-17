import { useMemo, useState } from 'react'
import { Search, Wallet } from 'lucide-react'
import type { ID } from '@/types'
import type { CompanyCostCategoryTotal } from '@/utils/ledger'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/Money'

/**
 * Profit & Loss's "Company Costs" picker — one row per eligible Cash Out
 * *category* (Salary, Machine Cost, Rent, …), each showing that category's
 * total for the selected month, not a scrolling list of individual
 * transactions/person names. Company Costs = the sum of whichever categories
 * are checked. Mirrors the checkbox-list idiom `RoleForm` uses for
 * permissions, same as the transaction-level picker this replaces.
 *
 * Each row's checkbox is disabled while its own toggle request is in
 * flight — a UI5-style busy state scoped to that one row, so a slow request
 * can't be double-submitted and the rest of the list stays interactive.
 *
 * `canEdit` mirrors the backend's own PROFIT_EDIT gate — a viewer without it
 * (e.g. Staff, who can see P&L but not curate it) gets read-only checkboxes
 * rather than controls that would 403 on click.
 */
export function CompanyCostCategoryPicker({
  candidates,
  onToggle,
  canEdit,
}: {
  candidates: CompanyCostCategoryTotal[]
  onToggle: (categoryId: ID, selected: boolean) => Promise<void>
  canEdit: boolean
}) {
  const [search, setSearch] = useState('')
  const [pending, setPending] = useState<Set<ID>>(new Set())

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return candidates
    return candidates.filter((c) => c.name.toLowerCase().includes(needle))
  }, [candidates, search])

  const selectedTotal = useMemo(
    () => candidates.filter((c) => c.selected).reduce((sum, c) => sum + c.amount, 0),
    [candidates],
  )
  const selectedCount = useMemo(() => candidates.filter((c) => c.selected).length, [candidates])

  const setRowPending = (id: ID, busy: boolean) => {
    setPending((current) => {
      const next = new Set(current)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggle = async (category: CompanyCostCategoryTotal, checked: boolean) => {
    setRowPending(category.categoryId, true)
    try {
      await onToggle(category.categoryId, checked)
    } finally {
      setRowPending(category.categoryId, false)
    }
  }

  const selectAll = async (checked: boolean) => {
    const targets = filtered.filter((c) => c.selected !== checked)
    for (const c of targets) {
      await toggle(c, checked)
    }
  }

  const allChecked = filtered.length > 0 && filtered.every((c) => c.selected)

  return (
    <Section
      title="Company costs — select expense categories"
      description="Only the categories checked below count toward this month's Company Costs. Each category's amount is the sum of its Cash Out entries this month."
      actions={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search category…"
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
        <EmptyState
          icon={Wallet}
          size="sm"
          title="No expense categories configured"
          description="Mark a Cash Out category as a Company Expense in Settings → Categories to see it here."
        />
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
            {filtered.length} categor{filtered.length === 1 ? 'y' : 'ies'}
          </label>
          {filtered.map((c) => (
            <label
              key={c.categoryId}
              className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-xs hover:bg-secondary/40"
            >
              <input
                type="checkbox"
                className="h-3.5 w-3.5 shrink-0 rounded border-border accent-primary-700"
                checked={c.selected}
                disabled={!canEdit || pending.has(c.categoryId)}
                onChange={(e) => toggle(c, e.target.checked)}
              />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <Money value={c.amount} size="sm" className="w-24 shrink-0 text-right" />
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2">
        <span className="text-2xs uppercase tracking-wider text-muted-foreground">
          Selected categories: {selectedCount}
        </span>
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
