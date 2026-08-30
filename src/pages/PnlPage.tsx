import { useCallback, useMemo, useState } from 'react'
import { CircleDollarSign, Coins, Printer, TrendingUp, Wallet } from 'lucide-react'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatGrid } from '@/components/StatCard'
import { Money } from '@/components/Money'
import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PageSkeleton } from '@/components/PageSkeleton'
import { MonthEditor } from '@/features/pnl/MonthEditor'
import { SalesProfitChart } from '@/features/dashboard/SalesProfitChart'
import { usePrint } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { PnlMonth, PnlYear } from '@/types'
import {
  PNL_FIELDS,
  analyseMonth,
  analyseYear,
  availableYears,
  chartSeries,
  emptyYear,
  isMonthEmpty,
  yearOf,
} from '@/utils/pnl'
import { MONTHS, formatCurrency, formatNumber } from '@/utils/format'
import { cn } from '@/utils/cn'

/**
 * Profit and loss.
 *
 * A month at a time, in an accordion, because nobody edits twelve months at
 * once and a twelve-by-eleven grid of inputs is unusable on anything smaller
 * than a desktop. The year total sits above, always visible, so the effect of
 * an edit on the whole year is never more than a glance away.
 */
export default function PnlPage() {
  const { data, loading, update } = useAppData()
  const { print } = usePrint()

  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [openMonth, setOpenMonth] = useState<string>(String(new Date().getMonth()))

  const years = useMemo(() => availableYears(data.pnl, thisYear), [data.pnl, thisYear])
  const pnlYear = useMemo(() => yearOf(data.pnl, year), [data.pnl, year])
  const totals = useMemo(() => analyseYear(pnlYear), [pnlYear])
  const series = useMemo(() => chartSeries(pnlYear), [pnlYear])

  const setMonth = useCallback(
    (next: PnlMonth) => {
      const existing = data.pnl.find((entry) => entry.year === year)

      const updatedYear: PnlYear = existing
        ? {
            ...existing,
            months: existing.months.map((month) =>
              month.monthIndex === next.monthIndex ? next : month,
            ),
          }
        : {
            ...emptyYear(year),
            months: emptyYear(year).months.map((month) =>
              month.monthIndex === next.monthIndex ? next : month,
            ),
          }

      update(
        'pnl',
        existing
          ? data.pnl.map((entry) => (entry.year === year ? updatedYear : entry))
          : [...data.pnl, updatedYear],
      )
    },
    [data.pnl, year, update],
  )

  const printYear = useCallback(() => {
    print({
      title: `Profit & Loss — ${year}`,
      subtitle: 'Monthly summary for the full year',
      meta: [
        { label: 'Year sales', value: formatCurrency(totals.sales) },
        { label: 'Gross profit', value: formatCurrency(totals.grossProfit) },
        { label: 'Net profit', value: formatCurrency(totals.netProfit) },
      ],
      columns: [
        { key: 'month', label: 'Month' },
        ...PNL_FIELDS.map((field) => ({
          key: field.key,
          label: field.label,
          align: 'right' as const,
        })),
        { key: 'gross', label: 'Gross Profit', align: 'right' as const },
        { key: 'net', label: 'Net Profit', align: 'right' as const },
      ],
      rows: pnlYear.months.map((month) => {
        const result = analyseMonth(month)
        return {
          month: MONTHS[month.monthIndex] ?? '',
          ...Object.fromEntries(
            PNL_FIELDS.map((field) => [field.key, formatNumber(month[field.key])]),
          ),
          gross: formatNumber(result.grossProfit),
          net: formatNumber(result.netProfit),
        }
      }),
      totals: {
        month: 'Year total',
        ...Object.fromEntries(PNL_FIELDS.map((field) => [field.key, formatNumber(totals[field.key])])),
        gross: formatNumber(totals.grossProfit),
        net: formatNumber(totals.netProfit),
      },
      footnote:
        `Gross profit = sales less production costs. ` +
        `Net profit = gross profit less office/admin, rent and interest.`,
    })
  }, [print, year, pnlYear, totals])

  if (loading) return <PageSkeleton />

  return (
    <div>
      <PageHeader
        title="Monthly Profit & Loss"
        description="Enter the month's sales and costs. Gross and net profit are always calculated — they are never typed in."
        actions={
          <div className="flex items-center gap-2">
            <Select value={String(year)} onValueChange={(value) => setYear(Number(value))}>
              <SelectTrigger className="w-28" aria-label="Financial year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((option) => (
                  <SelectItem key={option} value={String(option)}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={printYear}>
              <Printer />
              Print year
            </Button>
          </div>
        }
      />

      {/* ------------------------------------------------ year summary */}
      <StatGrid columns={4} className="mb-4">
        <StatCard
          label={`${year} Sales`}
          icon={TrendingUp}
          accent="primary"
          value={<Money value={totals.sales} size="2xl" weight="bold" tone="neutral" />}
        />

        <StatCard
          label={`${year} Gross Profit`}
          icon={CircleDollarSign}
          accent="brass"
          value={
            <Money
              value={totals.grossProfit}
              size="2xl"
              weight="bold"
              tone={totals.grossProfit < 0 ? 'negative' : 'positive'}
            />
          }
          footer={
            <Badge variant="brass">{totals.grossMargin.toFixed(1)}% of sales</Badge>
          }
        />

        <StatCard
          label={`${year} Net Profit`}
          icon={Coins}
          accent={totals.netProfit < 0 ? 'primary' : 'success'}
          value={
            <Money
              value={totals.netProfit}
              size="2xl"
              weight="bold"
              tone={totals.netProfit < 0 ? 'negative' : 'positive'}
            />
          }
          footer={
            <Badge variant={totals.netProfit < 0 ? 'destructive' : 'success'}>
              {totals.netMargin.toFixed(1)}% of sales
            </Badge>
          }
        />

        <StatCard
          label={`${year} Total Costs`}
          icon={Wallet}
          accent="neutral"
          value={
            <Money
              value={totals.productionCost + totals.operatingCost}
              size="2xl"
              weight="bold"
              tone="neutral"
            />
          }
          footer={
            <span className="text-2xs text-muted-foreground">
              {formatNumber(totals.productionCost)} production ·{' '}
              {formatNumber(totals.operatingCost)} operating
            </span>
          }
        />
      </StatGrid>

      <Tabs defaultValue="months">
        <TabsList className="mb-1">
          <TabsTrigger value="months">By month</TabsTrigger>
          <TabsTrigger value="table">Year table</TabsTrigger>
          <TabsTrigger value="chart">Trend</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------ month accordion */}
        <TabsContent value="months">
          <Accordion
            type="single"
            collapsible
            value={openMonth}
            onValueChange={setOpenMonth}
            className="space-y-2"
          >
            {pnlYear.months.map((month) => {
              const result = analyseMonth(month)
              const empty = isMonthEmpty(month)

              return (
                <AccordionItem key={month.monthIndex} value={String(month.monthIndex)}>
                  <AccordionTrigger>
                    <span className="flex flex-1 flex-wrap items-center justify-between gap-3 pr-2">
                      <span className="flex items-center gap-2.5">
                        <span className="font-display text-base">
                          {MONTHS[month.monthIndex]}
                        </span>
                        {empty && (
                          <Badge variant="outline" className="font-normal">
                            Not filled in
                          </Badge>
                        )}
                      </span>

                      {!empty && (
                        <span className="flex items-center gap-4">
                          <span className="hidden text-right sm:block">
                            <span className="block text-2xs uppercase tracking-wider text-muted-foreground">
                              Sales
                            </span>
                            <Money value={month.sales} size="sm" weight="medium" tone="neutral" />
                          </span>
                          <span className="text-right">
                            <span className="block text-2xs uppercase tracking-wider text-muted-foreground">
                              Net
                            </span>
                            <Money
                              value={result.netProfit}
                              size="sm"
                              weight="semibold"
                              tone={result.netProfit < 0 ? 'negative' : 'positive'}
                            />
                          </span>
                        </span>
                      )}
                    </span>
                  </AccordionTrigger>

                  <AccordionContent>
                    <MonthEditor month={month} onChange={setMonth} />
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </TabsContent>

        {/* ------------------------------------------------ year table */}
        <TabsContent value="table">
          <Section
            title={`${year} at a glance`}
            description="Every month and every line, with the year total beneath"
            noPadding
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-20 bg-secondary/90">Month</TableHead>
                  {PNL_FIELDS.map((field) => (
                    <TableHead key={field.key} numeric>
                      {field.label}
                    </TableHead>
                  ))}
                  <TableHead numeric>Gross</TableHead>
                  <TableHead numeric>Net</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {pnlYear.months.map((month) => {
                  const result = analyseMonth(month)
                  const empty = isMonthEmpty(month)

                  return (
                    <TableRow key={month.monthIndex} className={cn(empty && 'opacity-50')}>
                      <TableCell className="sticky left-0 z-10 whitespace-nowrap bg-card font-medium">
                        {MONTHS[month.monthIndex]}
                      </TableCell>

                      {PNL_FIELDS.map((field) => (
                        <TableCell key={field.key} numeric className="text-muted-foreground">
                          {month[field.key] ? formatNumber(month[field.key]) : '—'}
                        </TableCell>
                      ))}

                      <TableCell
                        numeric
                        className={cn(
                          'font-medium',
                          result.grossProfit < 0 && 'text-primary-700',
                        )}
                      >
                        {empty ? '—' : formatNumber(result.grossProfit)}
                      </TableCell>

                      <TableCell
                        numeric
                        className={cn(
                          'font-semibold',
                          result.netProfit < 0 ? 'text-primary-700' : 'text-success-700',
                        )}
                      >
                        {empty ? '—' : formatNumber(result.netProfit)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>

              <TableFooter>
                <TableRow className="hover:bg-transparent">
                  <TableCell className="sticky left-0 z-10 bg-secondary/80 text-2xs font-semibold uppercase tracking-wider">
                    Year total
                  </TableCell>
                  {PNL_FIELDS.map((field) => (
                    <TableCell key={field.key} numeric className="font-semibold">
                      {formatNumber(totals[field.key])}
                    </TableCell>
                  ))}
                  <TableCell numeric className="font-bold">
                    {formatNumber(totals.grossProfit)}
                  </TableCell>
                  <TableCell
                    numeric
                    className={cn(
                      'font-bold',
                      totals.netProfit < 0 ? 'text-primary-700' : 'text-success-700',
                    )}
                  >
                    {formatNumber(totals.netProfit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </Section>
        </TabsContent>

        {/* ------------------------------------------------ chart */}
        <TabsContent value="chart">
          <Section
            title={`Sales, gross and net profit — ${year}`}
            description="The gap between the lines is the cost of running the business"
          >
            <SalesProfitChart data={series} height={360} showGross />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  )
}
