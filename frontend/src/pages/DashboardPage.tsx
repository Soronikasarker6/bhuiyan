import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Banknote,
  Boxes,
  Factory,
  Package,
  Receipt,
  Ship,
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
import { buildImportRows, importTotals, todaysImports } from '@/utils/imports'
import { allMeshStock, todaysProductionBags, totalProductionBags, totalStockTon } from '@/utils/productionStock'
import { buildSaleSummaries, monthlySalesSeries } from '@/utils/sales'
import { customerTotals, outstandingCustomers, transactionsForCustomer } from '@/utils/customerLedger'
import { monthlyProfit } from '@/utils/profit'
import { MONTHS_SHORT, formatDate, formatNumber, todayISO } from '@/utils/format'
import { SALE_STATUS_LABEL, SALE_STATUS_VARIANT } from '@/constants/saleStatus'

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

  const todayCashIn = useMemo(
    () => data.customerTransactions.filter((t) => t.type === 'payment' && t.date === today).reduce((sum, t) => sum + t.credit, 0),
    [data.customerTransactions, today],
  )

  const salesTrend = useMemo(() => {
    const series = monthlySalesSeries(sales, year)
    return series.map((point) => ({ month: MONTHS_SHORT[point.monthIndex] ?? '', Sales: point.amount }))
  }, [sales, year])

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

      <StatGrid columns={4} className="mb-4">
        <StatCard label="Today's raw material import" icon={Ship} accent="primary" value={<Num value={todayImportTotal.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />} />
        <StatCard label="Total imported" icon={Ship} accent="brass" value={<Num value={importTotal.netWeightTon} suffix="Ton" size="2xl" className="font-bold" />} />
        <StatCard label="Today's production" icon={Factory} accent="primary" value={<Num value={todayProductionBags} suffix="Bag" size="2xl" className="font-bold" />} />
        <StatCard label="Total production" icon={Boxes} accent="brass" value={<Num value={totalProdBags} suffix="Bag" size="2xl" className="font-bold" />} footer={<span className="text-2xs text-muted-foreground">Current stock: {formatNumber(stockTon)} Ton</span>} />
        <StatCard label="Today's sales" icon={Receipt} accent="primary" value={<Money value={todaySales.reduce((s, r) => s + r.totalAmount, 0)} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{todaySales.length} invoices</span>} />
        <StatCard label="Total sales" icon={Receipt} accent="brass" value={<Money value={totalSalesAmount} size="2xl" weight="bold" />} footer={<span className="text-2xs text-muted-foreground">{sales.length} invoices</span>} />
        <StatCard label="Total customer due" icon={Wallet} accent={totalDue > 0 ? 'primary' : 'success'} value={<Money value={totalDue} size="2xl" weight="bold" tone={totalDue > 0 ? 'negative' : 'positive'} />} />
        <StatCard label="Today's cash in" icon={Banknote} accent="success" value={<Money value={todayCashIn} size="2xl" weight="bold" tone="positive" />} />
        <StatCard
          label="Net profit (this month)"
          icon={TrendingUp}
          accent={thisMonthProfit.netProfit < 0 ? 'primary' : 'success'}
          value={<Money value={thisMonthProfit.netProfit} size="2xl" weight="bold" tone={thisMonthProfit.netProfit < 0 ? 'negative' : 'positive'} />}
          footer={<span className="text-2xs text-muted-foreground">Sales {formatNumber(thisMonthProfit.totalSales)} · COGS {formatNumber(thisMonthProfit.costOfGoodsSold)}</span>}
        />
      </StatGrid>

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Section title="Sales overview" description={`Monthly revenue through ${year}`}>
          <SalesTrendChart data={salesTrend} />
        </Section>

        <Section title="Current stock" description="Total tons in hand, by product" noPadding>
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
                      <Badge variant={SALE_STATUS_VARIANT[sale.status]}>{SALE_STATUS_LABEL[sale.status]}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Section>
      </div>

      <Section title="Recent raw material imports" description="The latest weighbridge receipts" noPadding>
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
