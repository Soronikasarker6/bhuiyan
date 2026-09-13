import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  Banknote,
  Boxes,
  Factory,
  LineChart,
  Package,
  Receipt,
  Ship,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { Section } from '@/components/PageHeader'
import { StatCard, StatCardSkeleton, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChartSkeleton, TableSkeleton } from '@/components/PageSkeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SalesTrendChart, SalesTrendLegend } from '@/features/dashboard/SalesTrendChart'
import { useAppData } from '@/hooks/useAppData'
import { usePageHeader } from '@/hooks/usePageHeader'
import { buildImportRows, importTotals, todaysImports } from '@/utils/imports'
import { allMeshStock, todaysProductionBags, totalProductionBags, totalStockTon } from '@/utils/productionStock'
import { buildSaleSummaries, monthlySalesSeries } from '@/utils/sales'
import { customerTotals, outstandingCustomers, transactionsForCustomer } from '@/utils/customerLedger'
import { monthlyProfit, yearlyProfit } from '@/utils/profit'
import { MONTHS_SHORT, formatDate, formatNumber, formatTons, todayISO } from '@/utils/format'
import { SALE_STATUS_LABEL, SALE_STATUS_VARIANT } from '@/constants/saleStatus'
import '@/styles/quarry-theme.css'

/** The windows the sales-overview chart can be narrowed to. */
const TREND_RANGES = [
  { value: '12', label: 'Last 12 Months' },
  { value: '6', label: 'Last 6 Months' },
  { value: '3', label: 'Last 3 Months' },
] as const

/**
 * A labelled cluster of stat cards.
 *
 * Nine cards in one flat grid read as noise — nothing says which figures are
 * "what happened today" versus "the running total" versus "money that needs a
 * decision". Three short, named groups give the same figures a hierarchy
 * without adding another bordered card around them.
 */
function StatGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  )
}

/**
 * A hand-drawn ridge line along the bottom of a dark money card.
 *
 * Deliberately *not* a plot of anything: it is part of the card's rock
 * texture, in the same spirit as the gradients behind it. A decorative line
 * that looked like a sparkline but tracked no figure would be a small lie
 * told in the same place as the real ones, so it is shaped like terrain
 * rather than like data, and hidden from assistive technology.
 */
function RidgeAccent() {
  return (
    <svg
      className="dash-spark"
      viewBox="0 0 320 60"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <path
        d="M0 46 L38 38 L66 44 L98 26 L130 34 L162 18 L196 28 L228 14 L262 22 L292 10 L320 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/**
 * The dashboard.
 *
 * Answers the questions someone opens this system to ask, in the order they
 * ask them: what arrived and what got bagged today, what did we sell, what
 * is owed, and what happened most recently. Deliberately one chart, not
 * several — a dashboard that shows everything shows nothing.
 */
export default function DashboardPage() {
  const { data, loading } = useAppData()
  const today = todayISO()
  const year = new Date().getFullYear()
  const [trendRange, setTrendRange] = useState<string>('12')

  const importRows = useMemo(() => buildImportRows(data.rawMaterialImports, data.products), [data.rawMaterialImports, data.products])
  const importTotal = useMemo(() => importTotals(data.rawMaterialImports), [data.rawMaterialImports])
  const todayImportTotal = useMemo(() => importTotals(todaysImports(data.rawMaterialImports, today)), [data.rawMaterialImports, today])

  const todayProductionBags = todaysProductionBags(data.productionEntries, today)
  const totalProdBags = totalProductionBags(data.productionEntries)

  const stock = useMemo(
    () => allMeshStock(data.products, data.meshSizes, data.productionEntries, data.saleItems, data.sales),
    [data.products, data.meshSizes, data.productionEntries, data.saleItems, data.sales],
  )
  const stockTon = useMemo(() => totalStockTon(stock), [stock])

  const sales = useMemo(
    () => buildSaleSummaries(data.sales, data.saleItems, data.products, data.meshSizes, data.customers, data.customerTransactions),
    [data.sales, data.saleItems, data.products, data.meshSizes, data.customers, data.customerTransactions],
  )
  const todaySales = useMemo(() => sales.filter((s) => s.date === today), [sales, today])
  const totalSalesAmount = useMemo(() => sales.reduce((sum, s) => sum + s.totalAmount, 0), [sales])
  // Same `totalWeightTon` the Sales Register and every report read (§15) — never a separate bag-count estimate.
  const todaySalesTon = useMemo(() => todaySales.reduce((sum, s) => sum + s.totalWeightTon, 0), [todaySales])
  const totalSalesTon = useMemo(() => sales.reduce((sum, s) => sum + s.totalWeightTon, 0), [sales])

  const todayCashIn = useMemo(
    () => data.customerTransactions.filter((t) => t.type === 'payment' && t.date === today).reduce((sum, t) => sum + t.credit, 0),
    [data.customerTransactions, today],
  )

  /**
   * The sales overview, as a rolling window ending with the current month
   * rather than as a fixed calendar year — "last 12 months" has to be able to
   * reach back into the previous one, so both years are bucketed and the
   * window is cut across them. Revenue and profit come from the same two
   * functions the Sales Register and the Profit & Loss page already use; no
   * figure here is computed a second way.
   */
  const profitInputs = useMemo(
    () => ({
      sales: data.sales,
      saleItems: data.saleItems,
      products: data.products,
      meshSizes: data.meshSizes,
      rawMaterialImports: data.rawMaterialImports,
      transactions: data.transactions,
    }),
    [data.sales, data.saleItems, data.products, data.meshSizes, data.rawMaterialImports, data.transactions],
  )

  const salesTrend = useMemo(() => {
    const months = Number(trendRange)
    const now = new Date()

    // A 12-month window reaching back from the current month touches this
    // year and at most the one before it, so only those two are bucketed.
    const revenueByYear = new Map(
      [year, year - 1].map((y) => [y, monthlySalesSeries(sales, y)] as const),
    )
    const profitByYear = new Map(
      [year, year - 1].map((y) => [y, yearlyProfit(y, profitInputs)] as const),
    )

    return Array.from({ length: months }, (_, i) => {
      const point = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
      const pointYear = point.getFullYear()
      const monthIndex = point.getMonth()

      return {
        month: MONTHS_SHORT[monthIndex] ?? '',
        Sales: revenueByYear.get(pointYear)?.[monthIndex]?.amount ?? 0,
        Profit: profitByYear.get(pointYear)?.[monthIndex]?.netProfit ?? 0,
      }
    })
  }, [sales, year, trendRange, profitInputs])

  const customerSummaries = useMemo(
    () =>
      data.customers.map((customer) => ({
        customer,
        totals: customerTotals(transactionsForCustomer(data.customerTransactions, customer.id)),
      })),
    [data.customers, data.customerTransactions],
  )

  const totalDue = useMemo(() => customerSummaries.reduce((sum, c) => sum + c.totals.totalDue, 0), [customerSummaries])

  const topOutstanding = useMemo(
    () =>
      outstandingCustomers(data.customers, (id) => transactionsForCustomer(data.customerTransactions, id)).slice(0, 6),
    [data.customers, data.customerTransactions],
  )

  const thisMonthProfit = useMemo(
    () =>
      monthlyProfit(new Date().getFullYear(), new Date().getMonth(), {
        sales: data.sales,
        saleItems: data.saleItems,
        products: data.products,
        meshSizes: data.meshSizes,
        rawMaterialImports: data.rawMaterialImports,
        transactions: data.transactions,
      }),
    [data.sales, data.saleItems, data.products, data.meshSizes, data.rawMaterialImports, data.transactions],
  )

  const productWiseStock = useMemo(() => {
    const totals = new Map<string, { productName: string; stockTon: number }>()
    for (const row of stock) {
      const existing = totals.get(row.productId) ?? { productName: row.productName, stockTon: 0 }
      existing.stockTon += row.stockTon
      totals.set(row.productId, existing)
    }
    return [...totals.values()].sort((a, b) => b.stockTon - a.stockTon)
  }, [stock])

  const recentSales = useMemo(() => sales.slice(0, 6), [sales])
  const recentImports = useMemo(() => importRows.slice(0, 6), [importRows])

  const nothingYet =
    !loading && data.products.length === 0 && data.rawMaterialImports.length === 0 && data.sales.length === 0

  // Published to the app bar, not rendered in the page body — see
  // `usePageHeader`. "View reports" only makes sense once there's something
  // to report on, so it's the one thing that varies with `nothingYet`.
  usePageHeader({
    title: 'Dashboard',
    description: loading
      ? "Loading today's figures…"
      : nothingYet
        ? `Financial year ${year}`
        : `Financial year ${year} — figures update as entries are recorded.`,
    actions: !loading && !nothingYet && (
      <Link
        to="/reports"
        className="dash-pill-dark inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium shadow-raised transition-transform hover:scale-[1.02]"
      >
        View reports
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    ),
  })

  if (loading) {
    return (
      <div>
        <div className="mb-5 space-y-4">
          <StatGrid columns={4}>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </StatGrid>
          <StatGrid columns={3}>
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </StatGrid>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <ChartSkeleton />
          <TableSkeleton />
        </div>
      </div>
    )
  }

  if (nothingYet) {
    return (
      <div>
        <Section>
          <EmptyState
            icon={Package}
            size="lg"
            title="Nothing recorded yet"
            description="Add your products, then record an import and a sale — this page will show today's activity, outstanding balances and trends at a glance."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link to="/products">
                    <Package />
                    Add a product
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/import">
                    <Ship />
                    Record an import
                  </Link>
                </Button>
              </div>
            }
          />
        </Section>
      </div>
    )
  }

  return (
    <div>

      <div className="mb-4 space-y-4">
        <StatGroup label="Today">
          <StatGrid columns={4}>
            <StatCard theme="stone" label="Raw material import" icon={Ship} cornerIcon={Factory} accent="primary" value={<Num value={todayImportTotal.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />} />
            <StatCard theme="stone" label="Production" icon={Boxes} cornerIcon={BarChart3} accent="primary" value={<Num value={todayProductionBags} suffix="Bag" size="2xl" className="font-bold" />} />
            <StatCard theme="stone" label="Sales" icon={Receipt} cornerIcon={LineChart} accent="brass" value={<Money value={todaySales.reduce((s, r) => s + r.totalAmount, 0)} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{todaySales.length} invoices · {formatTons(todaySalesTon)} Ton</span>} />
            <StatCard theme="stone" label="Cash in" icon={Banknote} cornerIcon={LineChart} accent="success" value={<Money value={todayCashIn} size="2xl" weight="bold" tone="positive" />} />
          </StatGrid>
        </StatGroup>

        <StatGroup label="Totals">
          <StatGrid columns={3}>
            <StatCard theme="slate" label="Total imported" icon={Ship} accent="brass" value={<Num value={importTotal.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />} />
            <StatCard theme="slate" label="Total production" icon={Boxes} accent="brass" value={<Num value={totalProdBags} suffix="Bag" size="2xl" className="font-bold" />} footer={<span className="text-2xs text-muted-foreground">Current stock: {formatNumber(stockTon)} Ton</span>} />
            <StatCard theme="slate" label="Total sales" icon={BarChart3} accent="brass" value={<Money value={totalSalesAmount} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{sales.length} invoices · {formatTons(totalSalesTon)} Ton</span>} />
          </StatGrid>
        </StatGroup>

        <StatGroup label="This month's money">
          <StatGrid columns={2}>
            <StatCard
              theme="copper"
              label="Total customer due"
              icon={Wallet}
              accent={totalDue > 0 ? 'primary' : 'success'}
              decoration={<RidgeAccent />}
              value={<Money value={totalDue} size="2xl" weight="bold" tone={totalDue > 0 ? 'negative' : 'positive'} />}
            />
            <StatCard
              theme="copper"
              label="Net profit"
              icon={TrendingUp}
              accent={thisMonthProfit.netProfit < 0 ? 'primary' : 'success'}
              decoration={<RidgeAccent />}
              value={<Money value={thisMonthProfit.netProfit} size="2xl" weight="bold" tone={thisMonthProfit.netProfit < 0 ? 'negative' : 'positive'} />}
              footer={<span className="text-2xs text-muted-foreground">Sales {formatNumber(thisMonthProfit.totalSales)} · COGS {formatNumber(thisMonthProfit.costOfGoodsSold)}</span>}
            />
          </StatGrid>
        </StatGroup>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Section
          title="Sales overview"
          description={`Revenue and net profit, ${TREND_RANGES.find((r) => r.value === trendRange)?.label.toLowerCase() ?? ''}`}
          icon={BarChart3}
          actions={
            <>
              <SalesTrendLegend />
              <Select value={trendRange} onValueChange={setTrendRange}>
                <SelectTrigger id="dashboard-trend-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TREND_RANGES.map((range) => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        >
          <SalesTrendChart data={salesTrend} />
        </Section>

        <Section
          title="Current stock"
          description="Total tons in hand, by product"
          icon={Boxes}
          noPadding
        >
          {productWiseStock.length === 0 ? (
            <EmptyState icon={Boxes} size="sm" title="No stock yet" description="Record production to see product totals here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead numeric>Stock (Ton)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productWiseStock.map((p) => (
                  <TableRow key={p.productName}>
                    <TableCell className="font-medium">{p.productName}</TableCell>
                    <TableCell numeric>
                      <Num value={p.stockTon} size="sm" tone={p.stockTon <= 0 ? 'negative' : 'neutral'} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Section
          title="Outstanding customers"
          description="Highest due first"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/customers">
                All customers
                <ArrowRight />
              </Link>
            </Button>
          }
          icon={Users}
          noPadding
        >
          {topOutstanding.length === 0 ? (
            <EmptyState icon={Users} size="sm" title="Nobody owes anything" description="Every customer is settled up." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead numeric>Due</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topOutstanding.map(({ customer, totalDue: due }) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link to={`/customers/${customer.id}`} className="font-medium text-primary-700 hover:underline">
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell numeric>
                      <Money value={due} size="sm" tone="negative" weight="semibold" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>

        <Section title="Recent sales" description="The latest invoices" icon={Receipt} noPadding>
          {recentSales.length === 0 ? (
            <EmptyState
              icon={Receipt}
              size="sm"
              title="No sales recorded yet"
              description="Sales appear here as soon as you record one."
              action={<Button size="sm" asChild><Link to="/sales">Record a sale</Link></Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead numeric>Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentSales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{sale.invoiceNo}</TableCell>
                    <TableCell className="max-w-[9rem] truncate">{sale.customerName}</TableCell>
                    <TableCell numeric>
                      <Money value={sale.totalAmount} size="sm" />
                    </TableCell>
                    <TableCell>
                      <Badge variant={SALE_STATUS_VARIANT[sale.status]}>{SALE_STATUS_LABEL[sale.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>

      <Section title="Recent raw material imports" description="The latest weighbridge receipts" icon={Ship} noPadding>
        {recentImports.length === 0 ? (
          <EmptyState
            icon={Factory}
            size="sm"
            title="No imports recorded yet"
            description="Record today's gross and tare weight to see it here."
            action={<Button size="sm" asChild><Link to="/import">Record an import</Link></Button>}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead numeric>Gross (kg)</TableHead>
                <TableHead numeric>Tare (kg)</TableHead>
                <TableHead numeric>Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentImports.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(row.date)}</TableCell>
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell numeric className="text-muted-foreground">{row.grossWeightKg.toLocaleString('en-IN')}</TableCell>
                  <TableCell numeric className="text-muted-foreground">{row.tareWeightKg.toLocaleString('en-IN')}</TableCell>
                  <TableCell numeric className="font-semibold text-success-700">{row.netWeightTon.toFixed(2)} Ton</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  )
}
