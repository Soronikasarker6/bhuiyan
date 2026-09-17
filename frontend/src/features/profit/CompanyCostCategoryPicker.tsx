import { useMemo, useState } from 'react'
import { MultiComboBox } from '@ui5/webcomponents-react/MultiComboBox'
import { MultiComboBoxItem } from '@ui5/webcomponents-react/MultiComboBoxItem'
import { Wallet } from 'lucide-react'
import type { ID } from '@/types'
import type { CompanyCostCategoryTotal } from '@/utils/ledger'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Money } from '@/components/Money'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

/**
 * Profit & Loss's "Company Costs" filter — a multiselect combobox of every
 * eligible Cash Out *category* (Salary, Machine Cost, Rent, …) plus a "Go"
 * button, meant to sit inline with the Month/Year pickers above the page.
 * Company Costs = the sum of whichever categories are checked here.
 *
 * Checking/unchecking a category in the dropdown only updates *local* state
 * — nothing is saved as you click, which used to fire one API request per
 * selection and made the combobox feel sluggish. Pressing "Go" saves the
 * whole picked set in a single request (`onApply`, one array of category
 * ids), right before the results table is revealed.
 *
 * The parent should remount this component (e.g. `key={monthKey}`) when the
 * selected month/year changes, so its local selection resets to that
 * period's already-saved categories instead of carrying over unsaved picks
 * from the last one.
 *
 * `canEdit` mirrors the backend's own PROFIT_EDIT gate — a viewer without it
 * (e.g. Staff, who can see P&L but not curate it) gets a read-only combobox
 * rather than a control that would 403 on click.
 */
export function CompanyCostCategorySelect({
  candidates,
  onApply,
  canEdit,
  onGo,
}: {
  candidates: CompanyCostCategoryTotal[]
  /** Resolves to whether the save succeeded — `go()` only reveals the table on `true`, never on a failed save. */
  onApply: (categoryIds: ID[]) => Promise<boolean>
  canEdit: boolean
  onGo: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [pendingValues, setPendingValues] = useState<ID[]>(() => candidates.filter((c) => c.selected).map((c) => c.categoryId))

  const go = async () => {
    const persistedSet = new Set(candidates.filter((c) => c.selected).map((c) => c.categoryId))
    const pendingSet = new Set(pendingValues)
    const changed = persistedSet.size !== pendingSet.size || [...persistedSet].some((id) => !pendingSet.has(id))

    if (changed) {
      setBusy(true)
      let saved = false
      try {
        saved = await onApply(pendingValues)
      } finally {
        setBusy(false)
      }
      if (!saved) return
    }
    onGo()
  }

  return (
    <>
      <div className="min-w-[16rem] flex-1">
        <label
          htmlFor="company-cost-categories"
          className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Company cost categories
        </label>
        <MultiComboBox
          id="company-cost-categories"
          className="w-full"
          placeholder={candidates.length === 0 ? 'No categories configured' : 'Select categories…'}
          disabled={!canEdit || busy || candidates.length === 0}
          loading={busy}
          showSelectAll
          selectedValues={pendingValues}
          onSelectionChange={(event) =>
            setPendingValues(event.detail.items.map((item) => item.value ?? ''))
          }
        >
          {candidates.map((category) => (
            <MultiComboBoxItem key={category.categoryId} value={category.categoryId} text={category.name} />
          ))}
        </MultiComboBox>
      </div>

      <Button type="button" loading={busy} onClick={go} disabled={candidates.length === 0}>
        Go
      </Button>
    </>
  )
}

/** The selected categories, and this month's amount for each — shown once "Go" is pressed above. */
export function CompanyCostTable({ candidates }: { candidates: CompanyCostCategoryTotal[] }) {
  const selected = useMemo(() => candidates.filter((c) => c.selected), [candidates])
  const selectedTotal = useMemo(() => selected.reduce((sum, c) => sum + c.amount, 0), [selected])

  return (
    <Section
      title="Company costs — selected expense categories"
      description="Only the categories chosen above count toward this month's Company Costs. Each category's amount is the sum of its Cash Out entries this month."
      noPadding
    >
      {candidates.length === 0 ? (
        <EmptyState
          icon={Wallet}
          size="sm"
          title="No expense categories configured"
          description="Mark a Cash Out category as a Company Expense in Settings → Categories to see it here."
        />
      ) : selected.length === 0 ? (
        <EmptyState
          icon={Wallet}
          size="sm"
          title="No categories selected"
          description="Choose one or more categories above, then press Go."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead numeric>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selected.map((category) => (
                <TableRow key={category.categoryId}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell numeric>
                    <Money value={category.amount} size="sm" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-2xs uppercase tracking-wider">Selected company costs</TableCell>
                <TableCell numeric>
                  <Money value={selectedTotal} size="sm" weight="bold" />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </Section>
  )
}
