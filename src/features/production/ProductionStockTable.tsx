import { Fragment } from 'react'
import type { StockLedgerRow } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Boxes } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatDate, formatNumber, formatTons } from '@/utils/format'
import { bagsToKg } from '@/utils/productionStock'
import { kgToTons } from '@/utils/imports'

export interface StockLedgerDisplayRow extends StockLedgerRow {
  meshName: string
  bagKg: number
}

const GROUPS = [
  { key: 'previousStockBags', label: 'Previous Stock', tone: 'text-muted-foreground' },
  { key: 'productionBags', label: "Today's Production", tone: 'text-primary-700' },
  { key: 'totalProductionBags', label: 'Total Production', tone: 'text-foreground' },
  { key: 'sellBags', label: "Today's Sell", tone: 'text-destructive' },
  { key: 'stockBags', label: 'Stock in Hand', tone: 'text-success-700' },
] as const

/**
 * The §4/§19 register: one row per (date, mesh), five groups of three
 * columns each (Bag / Bag KG / Ton), Date and Mesh pinned so they stay in
 * view while the rest of this necessarily-wide table scrolls.
 *
 *     Stock in Hand = Previous Stock + Today's Production − Today's Sell
 *
 * Every figure here is derived from `buildStockLedger` — nothing in this
 * component recomputes a total, it only formats one.
 */
export function ProductionStockTable({ rows }: { rows: StockLedgerDisplayRow[] }) {
  if (rows.length === 0) {
    return (
      <Section title="Production & stock register" noPadding>
        <EmptyState
          icon={Boxes}
          size="sm"
          title="No production data available for this product"
          description="Record today's bagging above to see its stock ledger here."
        />
      </Section>
    )
  }

  return (
    <Section
      title="Production & stock register"
      description={`${rows.length} rows · date-wise, mesh by mesh`}
      noPadding
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-20 min-w-[6.5rem] border-b border-r border-border bg-secondary/80 px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur"
              >
                Date
              </th>
              <th
                rowSpan={2}
                className="sticky left-[6.5rem] z-20 min-w-[6rem] border-b border-r-2 border-border bg-secondary/80 px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur"
              >
                Mesh
              </th>
              {GROUPS.map((group) => (
                <th
                  key={group.key}
                  colSpan={3}
                  className={cn(
                    'border-b border-l-2 border-border bg-secondary/60 px-3 py-1.5 text-center text-2xs font-semibold uppercase tracking-wider',
                    group.tone,
                  )}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {GROUPS.map((group) => (
                <Fragment key={group.key}>
                  <th className="whitespace-nowrap border-b border-l-2 border-border bg-secondary/40 px-2.5 py-1.5 text-right text-2xs font-medium text-muted-foreground">
                    Bag
                  </th>
                  <th className="whitespace-nowrap border-b border-border bg-secondary/40 px-2.5 py-1.5 text-right text-2xs font-medium text-muted-foreground">
                    Bag KG
                  </th>
                  <th className="whitespace-nowrap border-b border-border bg-secondary/40 px-2.5 py-1.5 text-right text-2xs font-medium text-muted-foreground">
                    Ton
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.date}-${row.meshId}-${index}`} className="border-b border-border/70 hover:bg-secondary/40">
                <td className="sticky left-0 z-10 whitespace-nowrap border-r border-border bg-card px-3 py-2 text-muted-foreground">
                  {formatDate(row.date)}
                </td>
                <td className="sticky left-[6.5rem] z-10 whitespace-nowrap border-r-2 border-border bg-card px-3 py-2 font-medium">
                  {row.meshName}
                </td>
                {GROUPS.map((group) => {
                  const bags = row[group.key]
                  const kg = bagsToKg(bags, row.bagKg)
                  return (
                    <Fragment key={group.key}>
                      <td className={cn('whitespace-nowrap border-l-2 border-border px-2.5 py-2 text-right font-mono tabular', group.tone)}>
                        {formatNumber(bags)}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono tabular text-muted-foreground">
                        {formatNumber(kg)}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-right font-mono tabular text-muted-foreground">
                        {formatTons(kgToTons(kg))}
                      </td>
                    </Fragment>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
