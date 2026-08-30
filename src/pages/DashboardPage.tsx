import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Boxes,
  Factory,
  Package,
  PiggyBank,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { PageHeader, Section } from '@/components/PageHeader'
import { StatCard, StatCardSkeleton, StatGrid } from '@/components/StatCard'
import { Money, Num } from '@/components/Money'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/misc'
import { ChartSkeleton, TableSkeleton } from '@/components/PageSkeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SalesTrendChart } from '@/features/dashboard/SalesTrendChart'
import { useAppData } from '@/hooks/useAppData'
import { buildProductionRows, productionByProduct, todaysProduction } from '@/utils/production'
import { productStock, totalStock } from '@/utils/stock'
import { buildSaleSummaries, monthlySalesSeries } from '@/utils/sales'
import { customerTotals, outstandingCustomers, transactionsForCustomer } from '@/utils/customerLedger'
import { MONTHS_SHORT, formatDate, todayISO } from '@/utils/format'

const STATUS_VARIANT = { paid: 'success', partial: 'brass', due: 'destructive' } as const
const STATUS_LABEL = { paid: 'Paid', partial: 'Partial', due: 'Due' } as const

/**
 * The dashboard.
 *
 * Answers the questions someone opens this system to ask, in the order they
 * ask them: what did the yard make and sell today, what is the overall
 * position, who owes money, and what happened most recently. Deliberately one
 * chart, not several — a dashboard that shows everything shows nothing.
 */
export default function DashboardPage() {
  const { data, loading } = useAppData()
  const today = todayISO()
  const year = new Date().getFullYear()

  const productionRows = useMemo(() => buildProductionRows(data.productionEntries, data.products), [data.productionEntries, data.products])
  const todayProductionRows = useMemo(() => todaysProduction(data.productionEntries, today), [data.productionEntries, today])
  const productWise = useMemo(() => productionByProduct(data.productionEntries, data.products), [data.productionEntries, data.products])

  const stock = useMemo(() => productStock(data.products, data.productionEntries, data.saleItems), [data.products, data.productionEntries, data.saleItems])
  const stockTotals = useMemo(() => totalStock(stock), [stock])

  const sales = useMemo(
    () => buildSaleSummaries(data.sales, data.saleItems, data.products, data.meshSizes, data.customers, data.customerTransactions),
    [data.sales, data.saleItems, data.products, data.meshSizes, data.customers, data.customerTransactions],
  )
  const todaySales = useMemo(() => sales.filter((s) => s.date === today), [sales, today])
  const totalSalesAmount = useMemo(() => sales.reduce((sum, s) => sum + s.totalAmount, 0), [sales])

  const salesTrend = useMemo(() => {
    const series = monthlySalesSeries(sales, year)
    return series.map((point) => ({ month: MONTHS_SHORT[point.monthIndex] ?? '', Sales: point.amount }))
  }, [sales, year])

  const customerSummaries = useMemo(
    () =>
      data.customers.map((customer) => {
        const txns = transactionsForCustomer(data.customerTransactions, customer.id)
        const customerSales = sales.filter((s) => s.customerId === customer.id)
        return { customer, totals: customerTotals(txns, customerSales) }
      }),
    [data.customers, data.customerTransactions, sales],
  )

  const totalDue = useMemo(() => customerSummaries.reduce((sum, c) => sum + c.totals.totalDue, 0), [customerSummaries])
  const totalAdvance = useMemo(() => customerSummaries.reduce((sum, c) => sum + c.totals.availableAdvance, 0), [customerSummaries])

  const topOutstanding = useMemo(
    () => outstandingCustomers(data.customers, (id) => sales.filter((s) => s.customerId === id)).slice(0, 6),
    [data.customers, sales],
  )

  const recentSales = useMemo(() => sales.slice(0, 6), [sales])
  const recentProduction = useMemo(() => productionRows.slice(0, 6), [productionRows])

  const nothingYet =
    !loading && data.products.length === 0 && data.productionEntries.length === 0 && data.sales.length === 0

  if (loading) {
    return (
      <div>
        <PageHeader title="Dashboard" description="Loading today's figures…" />
        <StatGrid className="mb-5">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </StatGrid>
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
        <PageHeader title="Dashboard" description={`Financial year ${year}`} />
        <Section>
          <EmptyState
            icon={Package}
            size="lg"
            title="Nothing recorded yet"
            description="Add your products, then record production and a sale — this page will show today's activity, outstanding balances and trends at a glance."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild>
                  <Link to="/products">
                    <Package />
                    Add a product
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/production">
                    <Factory />
                    Record production
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
      <PageHeader
        title="Dashboard"
        description={`Financial year ${year} — figures update as entries are recorded.`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/reports">
              View reports
              <ArrowRight />
            </Link>
          </Button>
        }
      />

      <StatGrid columns={3} className="mb-4">
        <StatCard label="Today's production" icon={Factory} accent="primary" value={<Num value={todayProductionRows.reduce((s, e) => s + Math.max(0, e.grossWeightKg - e.tareWeightKg), 0) / 1000} suffix="Ton" size="2xl" className="font-bold" />} />
        <StatCard label="Today's sales" icon={Receipt} accent="primary" value={<Money value={todaySales.reduce((s, r) => s + r.totalAmount, 0)} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{todaySales.length} invoices</span>} />
        <StatCard label="Total production" icon={Factory} accent="brass" value={<Num value={stockTotals.producedTon} suffix="Ton" size="2xl" className="font-bold" />} footer={<span className="text-2xs text-muted-foreground">Available now: {stockTotals.availableTon.toFixed(1)} Ton</span>} />
        <StatCard label="Total sales" icon={TrendingUp} accent="brass" value={<Money value={totalSalesAmount} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{sales.length} invoices</span>} />
        <StatCard label="Total outstanding due" icon={Wallet} accent={totalDue > 0 ? 'primary' : 'success'} value={<Money value={totalDue} size="2xl" weight="bold" tone={totalDue > 0 ? 'negative' : 'positive'} />} />
        <StatCard label="Total customer advance" icon={PiggyBank} accent="success" value={<Money value={totalAdvance} size="2xl" weight="bold" tone="positive" />} />
      </StatGrid>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Section title="Sales overview" description={`Monthly revenue through ${year}`}>
          <SalesTrendChart data={salesTrend} />
        </Section>

        <Section title="Production overview" description="Net tons produced, by product" noPadding>
          {productWise.filter((p) => p.entryCount > 0).length === 0 ? (
            <EmptyState icon={Boxes} size="sm" title="No production yet" description="Record a production entry to see product totals here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead numeric>Net (Ton)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productWise.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell className="font-medium">{p.productName}</TableCell>
                    <TableCell numeric>
                      <Num value={p.netTon} size="sm" />
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

        <Section title="Recent sales" description="The latest invoices" noPadding>
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
                      <Badge variant={STATUS_VARIANT[sale.status]}>{STATUS_LABEL[sale.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>

      <Section title="Recent production" description="The latest weighbridge entries" noPadding>
        {recentProduction.length === 0 ? (
          <EmptyState
            icon={Factory}
            size="sm"
            title="No production recorded yet"
            description="Record today's gross and tare weight to see it here."
            action={<Button size="sm" asChild><Link to="/production">Record production</Link></Button>}
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
              {recentProduction.map((row) => (
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
