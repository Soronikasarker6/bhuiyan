import type { StockLedgerRow } from '@/types'
import { Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Boxes } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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
 * The §4/§19 register: one row per (date, mesh).
 *
 *     Stock in Hand = Previous Stock + Today's Production − Today's Sell
 *
 * Every figure here is derived from `buildStockLedger` — nothing in this
 * component recomputes a total, it only formats one.
 *
 * Each measure gets one column, not three: the bag count (the unit the yard
 * actually works in) leads, with tons — the unit every other stock figure in
 * the app already reports in — underneath. Kilograms are a pure intermediate
 * step between the two with no meaning of its own, so it's dropped rather
 * than given a whole column; that alone takes this from 17 columns to 7,
 * without losing a single figure.
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
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Mesh</TableHead>
            {GROUPS.map((group) => (
              <TableHead key={group.key} numeric className={group.tone}>
                {group.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.date}-${row.meshId}-${index}`}>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.date)}</TableCell>
              <TableCell className="font-medium">{row.meshName}</TableCell>
              {GROUPS.map((group) => {
                const bags = row[group.key]
                const ton = kgToTons(bagsToKg(bags, row.bagKg))
                return (
                  <TableCell key={group.key} numeric>
                    <span className={cn('block font-mono tabular font-semibold', group.tone)}>
                      {formatNumber(bags)}
                    </span>
                    <span className="block font-mono tabular text-2xs text-muted-foreground">
                      {formatTons(ton)} Ton
                    </span>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  )
}
