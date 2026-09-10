import { useMemo, useState } from 'react'
import { Receipt, Scale, TrendingUp, Wallet } from 'lucide-react'
import { PageHeader, Section } from '@/components/PageHeader'
import { PageSkeleton } from '@/components/PageSkeleton'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAppData } from '@/hooks/useAppData'
import { yearlyProfit, yearlyProfitTotals } from '@/utils/profit'
import { MONTHS } from '@/utils/format'

/**
 * Profit & Loss — computed, never typed in (§6).
 *
 *     Cost of Goods Sold = Σ per product: (tons sold that month) × average cost/ton
 *     Gross Profit       = Total Sales − Cost of Goods Sold
 *     Net Profit         = Gross Profit − Total Company Costs
 *
 * Every figure on this page traces back to a real sale, a real priced
 * import, or a real Cash & Bank Ledger entry — there is nothing left to
 * enter by hand, and nothing here can silently drift from what those
 * records actually say.
 */
export default function ProfitPage() {
  const { data, loading } = useAppData()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [monthIndex, setMonthIndex] = useState(today.getMonth())

  const months = useMemo(
    () =>
      yearlyProfit(year, {
        sales: data.sales,
        saleItems: data.saleItems,
        products: data.products,
        meshSizes: data.meshSizes,
        rawMaterialImports: data.rawMaterialImports,
        transactions: data.transactions,
      }),
    [year, data.sales, data.saleItems, data.products, data.meshSizes, data.rawMaterialImports, data.transactions],
  )

  const yearTotals = useMemo(() => yearlyProfitTotals(months), [months])
  const selected = months[monthIndex] ?? months[0]!

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        description="Sales, cost of goods sold and net profit — computed from real records, month by month."
      />

      <Section title="Month" className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[9rem]">
            <label htmlFor="profit-month" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Month
            </label>
            <Select value={String(monthIndex)} onValueChange={(v) => setMonthIndex(Number(v))}>
              <SelectTrigger id="profit-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((month, index) => (
                  <SelectItem key={month} value={String(index)}>
                    {month}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-28">
            <label htmlFor="profit-year" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Year
            </label>
            <Input id="profit-year" type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
        </div>
      </Section>

      {/*
        One grid, not three — Total sales/COGS/Gross profit/Company costs
        (row 1) and Net profit/Net margin (row 2, a size up: these two are
        the answer, the rest are how it was reached) used to repeat across a
        second StatGrid *and* a `<dl>` breakdown below, all showing the exact
        same five numbers. The year-at-a-glance table already presents
        Sales → COGS → Gross Profit → Company Costs → Net Profit in that
        left-to-right order for every month, selected month included and
        highlighted, so the formula is still traceable without a third copy.
      */}
      <StatGrid columns={3} className="mb-4">
        <StatCard label="Total sales" icon={Receipt} accent="primary" value={<Money value={selected.totalSales} size="xl" weight="bold" />} />
        <StatCard label="Cost of goods sold" icon={Scale} accent="brass" value={<Money value={selected.costOfGoodsSold} size="xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">Weight actually sold × avg. cost/ton</span>} />
        <StatCard
          label="Gross profit"
          icon={TrendingUp}
          accent={selected.grossProfit >= 0 ? 'success' : 'primary'}
          value={<Money value={selected.grossProfit} size="xl" weight="bold" tone={selected.grossProfit >= 0 ? 'positive' : 'negative'} />}
        />
        <StatCard label="Company costs" icon={Wallet} accent="brass" value={<Money value={selected.totalExpenses} size="xl" weight="bold" />} />
        <StatCard
          label="Net profit"
          icon={TrendingUp}
          accent={selected.netProfit >= 0 ? 'success' : 'primary'}
          value={<Money value={selected.netProfit} size="2xl" weight="bold" tone={selected.netProfit >= 0 ? 'positive' : 'negative'} />}
          footer={<span className="text-2xs text-muted-foreground">{MONTHS[monthIndex]} {year}</span>}
        />
        <StatCard
          label="Net margin"
          icon={TrendingUp}
          accent={selected.netMargin >= 0 ? 'success' : 'primary'}
          value={<span className="text-2xl font-bold tabular-nums">{selected.netMargin.toFixed(1)}%</span>}
          footer={<span className="text-2xs text-muted-foreground">Net profit ÷ total sales</span>}
        />
      </StatGrid>

      <Section title={`${year} at a glance`} description="Every month, computed the same way" noPadding>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead numeric>Sales</TableHead>
                <TableHead numeric>COGS</TableHead>
                <TableHead numeric>Gross Profit</TableHead>
                <TableHead numeric>Company Costs</TableHead>
                <TableHead numeric>Net Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((month, index) => (
                <TableRow key={month.monthIndex} className={index === monthIndex ? 'bg-secondary/50' : undefined}>
                  <TableCell className="font-medium">{MONTHS[month.monthIndex]}</TableCell>
                  <TableCell numeric><Money value={month.totalSales} size="sm" /></TableCell>
                  <TableCell numeric><Money value={month.costOfGoodsSold} size="sm" /></TableCell>
                  <TableCell numeric><Money value={month.grossProfit} size="sm" tone={month.grossProfit >= 0 ? 'positive' : 'negative'} /></TableCell>
                  <TableCell numeric><Money value={month.totalExpenses} size="sm" /></TableCell>
                  <TableCell numeric><Money value={month.netProfit} size="sm" weight="semibold" tone={month.netProfit >= 0 ? 'positive' : 'negative'} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="hover:bg-transparent">
                <TableCell className="text-2xs uppercase tracking-wider">Year total</TableCell>
                <TableCell numeric><Money value={yearTotals.totalSales} size="sm" weight="bold" /></TableCell>
                <TableCell numeric><Money value={yearTotals.costOfGoodsSold} size="sm" weight="bold" /></TableCell>
                <TableCell numeric><Money value={yearTotals.grossProfit} size="sm" weight="bold" /></TableCell>
                <TableCell numeric><Money value={yearTotals.totalExpenses} size="sm" weight="bold" /></TableCell>
                <TableCell numeric><Money value={yearTotals.netProfit} size="sm" weight="bold" /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </Section>
    </div>
  )
}
