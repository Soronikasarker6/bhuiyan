import { useEffect, useState } from 'react'
import type { PnlFieldKey, PnlMonth } from '@/types'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/misc'
import { Money } from '@/components/Money'
import { PNL_FIELDS, analyseMonth } from '@/utils/pnl'
import { cn } from '@/utils/cn'

/**
 * One month's figures.
 *
 * The costs are typed; gross and net profit are not, and cannot be. They are
 * shown as results at the bottom, recalculating as the fields change, so the
 * effect of a correction is visible while the person is still looking at it.
 *
 * Fields hold their raw text while being edited rather than being coerced to a
 * number on each keystroke — otherwise clearing a field to retype it snaps it
 * back to 0, and the digit you meant to delete stays put.
 */
export function MonthEditor({
  month,
  onChange,
}: {
  month: PnlMonth
  onChange: (next: PnlMonth) => void
}) {
  const [drafts, setDrafts] = useState<Partial<Record<PnlFieldKey, string>>>({})

  // A month switch discards any half-typed field, which is the right
  // behaviour: the value was never committed.
  useEffect(() => {
    setDrafts({})
  }, [month.monthIndex])

  const result = analyseMonth(month)

  const setField = (key: PnlFieldKey, raw: string) => {
    setDrafts((current) => ({ ...current, [key]: raw }))

    const value = raw.trim() === '' ? 0 : Number(raw)
    if (!Number.isFinite(value) || value < 0) return

    onChange({ ...month, [key]: value })
  }

  const groups = [
    { id: 'sales', title: 'Revenue', hint: 'What was invoiced this month' },
    {
      id: 'production',
      title: 'Production costs',
      hint: 'Everything that goes into making the product — deducted to reach gross profit',
    },
    {
      id: 'operating',
      title: 'Operating costs',
      hint: 'Costs of running the business — deducted from gross profit to reach net',
    },
  ] as const

  return (
    <div>
      {groups.map((group) => (
        <fieldset key={group.id} className="mb-4 last:mb-0">
          <legend className="mb-0.5 text-2xs font-semibold uppercase tracking-wider text-brass-700">
            {group.title}
          </legend>
          <p className="mb-2.5 text-2xs text-muted-foreground">{group.hint}</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PNL_FIELDS.filter((field) => field.group === group.id).map((field) => {
              const id = `pnl-${month.monthIndex}-${field.key}`
              const draft = drafts[field.key]
              const value = draft !== undefined ? draft : month[field.key] || ''

              return (
                <div key={field.key}>
                  <Label htmlFor={id} className="mb-1 block text-2xs text-muted-foreground">
                    {field.label}
                  </Label>
                  <Input
                    id={id}
                    type="number"
                    min={0}
                    step="1"
                    inputMode="numeric"
                    placeholder="0"
                    value={value}
                    onChange={(event) => setField(field.key, event.target.value)}
                    onBlur={() =>
                      setDrafts((current) => {
                        const next = { ...current }
                        delete next[field.key]
                        return next
                      })
                    }
                    className={cn(field.key === 'sales' && 'border-success-300 bg-success-50/50')}
                  />
                </div>
              )
            })}
          </div>
        </fieldset>
      ))}

      {/* ------------------------------------------------ the results */}
      <div className="mt-4 grid gap-3 rounded-lg border border-border bg-secondary/50 p-3.5 sm:grid-cols-2">
        <ResultLine
          label="Gross Profit"
          hint="Sales less production costs"
          value={result.grossProfit}
          margin={result.grossMargin}
        />
        <ResultLine
          label="Net Profit"
          hint="Gross profit less office, rent and interest"
          value={result.netProfit}
          margin={result.netMargin}
          emphasis
        />
      </div>
    </div>
  )
}

function ResultLine({
  label,
  hint,
  value,
  margin,
  emphasis,
}: {
  label: string
  hint: string
  value: number
  margin: number
  emphasis?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3.5 py-3',
        emphasis ? 'border-brass-300 bg-card' : 'border-transparent',
      )}
    >
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1">
        <Money
          value={value}
          size="xl"
          weight="bold"
          tone={value < 0 ? 'negative' : 'positive'}
        />
      </div>
      <p className="mt-1 text-2xs text-muted-foreground">
        {hint} · <span className="font-mono tabular">{margin.toFixed(1)}%</span> of sales
      </p>
    </div>
  )
}
