import { useMemo, useState } from 'react'
import {
  BarChart3,
  BookText,
  Boxes,
  Download,
  FileText,
  Landmark,
  PiggyBank,
  Printer,
  Receipt,
  Scale,
  Truck,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Section } from '@/components/PageHeader'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageSkeleton } from '@/components/PageSkeleton'
import { usePrint, type PrintPayload } from '@/features/reports/PrintSheet'
import { useAppData } from '@/hooks/useAppData'
import type { PaymentStatus } from '@/types'
import {
  accountBalances,
  buildLedgerRows,
  categoryBreakdown,
  monthMovement,
  totalBalances,
} from '@/utils/ledger'
import { buildProductionRows, productionByProduct } from '@/utils/production'
import { productStock } from '@/utils/stock'
import {
  buildSaleSummaries,
  filterSaleSummaries,
  salesByCustomer,
  salesByMeshSize,
  salesByProduct,
  salesByTruck,
} from '@/utils/sales'
import {
  buildCustomerLedgerRows,
  customerNameOf,
  customerTotals,
  filterCustomerTransactions,
  transactionsForCustomer,
} from '@/utils/customerLedger'
import { PNL_FIELDS, analyseMonth, analyseYear, yearOf } from '@/utils/pnl'
import {
  MONTHS,
  firstDayOfMonth,
  formatCurrency,
  formatDate,
  formatDateLong,
  formatNumber,
  formatTons,
  isWithin,
  lastDayOfMonth,
  todayISO,
} from '@/utils/format'

/**
 * Reports.
 *
 * Every report builds the same plain payload — columns, rows, totals — which
 * is then either printed as a document or written out as CSV. Keeping every
 * report in that one shape is what stops "print" and "export" drifting into
 * producing different numbers for the same thing.
 */

interface ReportDefinition {
  id: string
  group: 'Production' | 'Sales' | 'Customer' | 'Company Finance'
  name: string
  description: string
  icon: typeof FileText
  build: () => PrintPayload
  /** Rows available, so an empty report can say so before it is opened. */
  count: number
}

const ALL = '__all__'

export default function ReportsPage() {
  const { data, loading } = useAppData()
  const { print } = usePrint()

  const thisYear = new Date().getFullYear()
  const thisMonth = new Date().getMonth()

  const [from, setFrom] = useState(firstDayOfMonth(thisYear, thisMonth))
  const [to, setTo] = useState(todayISO())
  const [year, setYear] = useState(thisYear)
  const [productFilter, setProductFilter] = useState(ALL)
  const [customerFilter, setCustomerFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | typeof ALL>(ALL)
  const [accountFilter, setAccountFilter] = useState(ALL)

  const rangeLabel = `${formatDateLong(from)} to ${formatDateLong(to)}`

  // ---------------------------------------------------------------- sources

  const productionInRange = useMemo(
    () =>
      buildProductionRows(data.productionEntries, data.products)
        .filter((row) => isWithin(row.date, from, to))
        .filter((row) => productFilter === ALL || row.productId === productFilter),
    [data.productionEntries, data.products, from, to, productFilter],
  )

  const allSales = useMemo(
    () =>
      buildSaleSummaries(
        data.sales,
        data.saleItems,
        data.products,
        data.meshSizes,
        data.customers,
        data.customerTransactions,
      ),
    [data.sales, data.saleItems, data.products, data.meshSizes, data.customers, data.customerTransactions],
  )

  const salesInRange = useMemo(
    () =>
      filterSaleSummaries(allSales, {
        from,
        to,
        productId: productFilter === ALL ? undefined : productFilter,
        customerId: customerFilter === ALL ? undefined : customerFilter,
        status: statusFilter === ALL ? undefined : statusFilter,
      }),
    [allSales, from, to, productFilter, customerFilter, statusFilter],
  )

  const ledgerInRange = useMemo(
    () =>
      buildLedgerRows(data.transactions, data.accounts, {
        from,
        to,
        accountId: accountFilter === ALL ? undefined : accountFilter,
      }),
    [data.transactions, data.accounts, from, to, accountFilter],
  )

  const customerTxnsInRange = useMemo(
    () =>
      filterCustomerTransactions(data.customerTransactions, {
        from,
        to,
        customerId: customerFilter === ALL ? undefined : customerFilter,
      }),
    [data.customerTransactions, from, to, customerFilter],
  )

  // ---------------------------------------------------------------- reports

  const reports = useMemo<ReportDefinition[]>(() => {
    const stock = productStock(data.products, data.productionEntries, data.saleItems)
    const productTotals = productionByProduct(productionInRange, data.products)
    const pnlYear = yearOf(data.pnl, year)
    const pnlTotals = analyseYear(pnlYear)
    const balances = accountBalances(data.accounts, data.transactions, to)
    const balanceTotals = totalBalances(balances)

    const customerSummaries = data.customers.map((customer) => {
      const txns = transactionsForCustomer(data.customerTransactions, customer.id)
      const sales = allSales.filter((s) => s.customerId === customer.id)
      return { customer, totals: customerTotals(txns, sales) }
    })

    const outstanding = customerSummaries.filter((c) => c.totals.totalDue > 0).sort((a, b) => b.totals.totalDue - a.totals.totalDue)
    const withAdvance = customerSummaries.filter((c) => c.totals.availableAdvance > 0).sort((a, b) => b.totals.availableAdvance - a.totals.availableAdvance)
    const creditSales = salesInRange.filter((s) => s.status !== 'paid')
    const paymentsInRange = customerTxnsInRange.filter((t) => t.type === 'payment')
    const ledgerRows = buildCustomerLedgerRows(customerTxnsInRange).map((row) => ({ ...row, customerName: customerNameOf(data.customers, row.customerId) }))

    return [
      // ---------------------------------------------------------- production
      {
        id: 'production',
        group: 'Production',
        name: 'Production Report',
        description: 'Every production entry in the range, with gross, tare and net weight.',
        icon: Boxes,
        count: productionInRange.length,
        build: () => ({
          title: 'Production Report',
          subtitle: rangeLabel,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'product', label: 'Product' },
            { key: 'gross', label: 'Gross (kg)', align: 'right' },
            { key: 'tare', label: 'Tare (kg)', align: 'right' },
            { key: 'net', label: 'Net (kg)', align: 'right' },
            { key: 'netTon', label: 'Net (Ton)', align: 'right' },
          ],
          rows: productionInRange.map((row) => ({
            date: formatDate(row.date),
            product: row.productName,
            gross: formatNumber(row.grossWeightKg),
            tare: formatNumber(row.tareWeightKg),
            net: formatNumber(row.netWeightKg),
            netTon: formatTons(row.netWeightTon),
          })),
          totals: {
            date: 'Total',
            gross: formatNumber(productionInRange.reduce((s, r) => s + r.grossWeightKg, 0)),
            tare: formatNumber(productionInRange.reduce((s, r) => s + r.tareWeightKg, 0)),
            net: formatNumber(productionInRange.reduce((s, r) => s + r.netWeightKg, 0)),
            netTon: formatTons(productionInRange.reduce((s, r) => s + r.netWeightTon, 0)),
          },
        }),
      },
      {
        id: 'production-by-product',
        group: 'Production',
        name: 'Product-wise Production',
        description: 'Net tons produced per product in the range.',
        icon: Boxes,
        count: productTotals.filter((p) => p.entryCount > 0).length,
        build: () => ({
          title: 'Product-wise Production',
          subtitle: rangeLabel,
          columns: [
            { key: 'product', label: 'Product' },
            { key: 'entries', label: 'Entries', align: 'right' },
            { key: 'netTon', label: 'Net (Ton)', align: 'right' },
          ],
          rows: productTotals.map((p) => ({ product: p.productName, entries: String(p.entryCount), netTon: formatTons(p.netTon) })),
          totals: {
            product: 'Total',
            entries: String(productTotals.reduce((s, p) => s + p.entryCount, 0)),
            netTon: formatTons(productTotals.reduce((s, p) => s + p.netTon, 0)),
          },
        }),
      },
      {
        id: 'stock',
        group: 'Production',
        name: 'Stock Report',
        description: 'Available stock for every product, as it stands now.',
        icon: Boxes,
        count: stock.length,
        build: () => ({
          title: 'Stock Report',
          subtitle: `As at ${formatDateLong(todayISO())}`,
          columns: [
            { key: 'product', label: 'Product' },
            { key: 'produced', label: 'Produced (Ton)', align: 'right' },
            { key: 'sold', label: 'Sold (Ton)', align: 'right' },
            { key: 'available', label: 'Available (Ton)', align: 'right' },
          ],
          rows: stock.map((s) => ({
            product: s.productName,
            produced: formatTons(s.producedTon),
            sold: formatTons(s.soldTon),
            available: formatTons(s.availableTon),
          })),
          totals: {
            product: 'Total',
            produced: formatTons(stock.reduce((s, r) => s + r.producedTon, 0)),
            sold: formatTons(stock.reduce((s, r) => s + r.soldTon, 0)),
            available: formatTons(stock.reduce((s, r) => s + r.availableTon, 0)),
          },
        }),
      },

      // ---------------------------------------------------------- sales
      {
        id: 'sales',
        group: 'Sales',
        name: 'Sales Report',
        description: 'Every invoice in the range, with paid and due.',
        icon: Receipt,
        count: salesInRange.length,
        build: () => ({
          title: 'Sales Report',
          subtitle: rangeLabel,
          columns: [
            { key: 'invoice', label: 'Invoice' },
            { key: 'date', label: 'Date' },
            { key: 'customer', label: 'Customer' },
            { key: 'truck', label: 'Truck' },
            { key: 'total', label: 'Total', align: 'right' },
            { key: 'paid', label: 'Paid', align: 'right' },
            { key: 'due', label: 'Due', align: 'right' },
          ],
          rows: salesInRange.map((s) => ({
            invoice: s.invoiceNo,
            date: formatDate(s.date),
            customer: s.customerName,
            truck: s.truckNo ?? '—',
            total: formatCurrency(s.totalAmount),
            paid: formatCurrency(s.amountPaid),
            due: formatCurrency(s.amountDue),
          })),
          totals: {
            invoice: `Total (${salesInRange.length})`,
            total: formatCurrency(salesInRange.reduce((s, r) => s + r.totalAmount, 0)),
            paid: formatCurrency(salesInRange.reduce((s, r) => s + r.amountPaid, 0)),
            due: formatCurrency(salesInRange.reduce((s, r) => s + r.amountDue, 0)),
          },
        }),
      },
      {
        id: 'sales-by-product',
        group: 'Sales',
        name: 'Product-wise Sales',
        description: 'Revenue and weight sold per product in the range.',
        icon: Boxes,
        count: salesByProduct(salesInRange).length,
        build: () => {
          const rows = salesByProduct(salesInRange)
          return {
            title: 'Product-wise Sales',
            subtitle: rangeLabel,
            columns: [
              { key: 'product', label: 'Product' },
              { key: 'weight', label: 'Weight (Ton)', align: 'right' },
              { key: 'amount', label: 'Amount', align: 'right' },
            ],
            rows: rows.map((r) => ({ product: r.productName, weight: formatTons(r.weightTon), amount: formatCurrency(r.amount) })),
            totals: { product: 'Total', weight: formatTons(rows.reduce((s, r) => s + r.weightTon, 0)), amount: formatCurrency(rows.reduce((s, r) => s + r.amount, 0)) },
          }
        },
      },
      {
        id: 'sales-by-customer',
        group: 'Sales',
        name: 'Customer-wise Sales',
        description: 'Revenue per customer in the range.',
        icon: Users,
        count: salesByCustomer(salesInRange).length,
        build: () => {
          const rows = salesByCustomer(salesInRange)
          return {
            title: 'Customer-wise Sales',
            subtitle: rangeLabel,
            columns: [
              { key: 'customer', label: 'Customer' },
              { key: 'count', label: 'Invoices', align: 'right' },
              { key: 'amount', label: 'Amount', align: 'right' },
            ],
            rows: rows.map((r) => ({ customer: r.customerName, count: String(r.count), amount: formatCurrency(r.amount) })),
            totals: { customer: 'Total', count: String(rows.reduce((s, r) => s + r.count, 0)), amount: formatCurrency(rows.reduce((s, r) => s + r.amount, 0)) },
          }
        },
      },
      {
        id: 'sales-by-truck',
        group: 'Sales',
        name: 'Truck-wise Sales',
        description: 'Revenue per truck in the range.',
        icon: Truck,
        count: salesByTruck(salesInRange).length,
        build: () => {
          const rows = salesByTruck(salesInRange)
          return {
            title: 'Truck-wise Sales',
            subtitle: rangeLabel,
            columns: [
              { key: 'truck', label: 'Truck No' },
              { key: 'count', label: 'Trips', align: 'right' },
              { key: 'amount', label: 'Amount', align: 'right' },
            ],
            rows: rows.map((r) => ({ truck: r.truckNo, count: String(r.count), amount: formatCurrency(r.amount) })),
            totals: { truck: 'Total', count: String(rows.reduce((s, r) => s + r.count, 0)), amount: formatCurrency(rows.reduce((s, r) => s + r.amount, 0)) },
          }
        },
      },
      {
        id: 'sales-by-mesh',
        group: 'Sales',
        name: 'Mesh-wise Sales',
        description: 'Revenue and weight per mesh size in the range.',
        icon: Scale,
        count: salesByMeshSize(salesInRange).length,
        build: () => {
          const rows = salesByMeshSize(salesInRange)
          return {
            title: 'Mesh-wise Sales',
            subtitle: rangeLabel,
            columns: [
              { key: 'mesh', label: 'Mesh / Size' },
              { key: 'weight', label: 'Weight (Ton)', align: 'right' },
              { key: 'amount', label: 'Amount', align: 'right' },
            ],
            rows: rows.map((r) => ({ mesh: r.meshSizeName, weight: formatTons(r.weightTon), amount: formatCurrency(r.amount) })),
            totals: { mesh: 'Total', weight: formatTons(rows.reduce((s, r) => s + r.weightTon, 0)), amount: formatCurrency(rows.reduce((s, r) => s + r.amount, 0)) },
          }
        },
      },

      // ---------------------------------------------------------- customer
      {
        id: 'outstanding',
        group: 'Customer',
        name: 'Customer Outstanding',
        description: 'Every customer with a due balance, highest first.',
        icon: Wallet,
        count: outstanding.length,
        build: () => ({
          title: 'Customer Outstanding',
          subtitle: `As at ${formatDateLong(todayISO())}`,
          columns: [
            { key: 'customer', label: 'Customer' },
            { key: 'due', label: 'Total due', align: 'right' },
          ],
          rows: outstanding.map((c) => ({ customer: c.customer.name, due: formatCurrency(c.totals.totalDue) })),
          totals: { customer: 'Total', due: formatCurrency(outstanding.reduce((s, c) => s + c.totals.totalDue, 0)) },
        }),
      },
      {
        id: 'advance',
        group: 'Customer',
        name: 'Customer Advance',
        description: 'Every customer holding unused advance.',
        icon: PiggyBank,
        count: withAdvance.length,
        build: () => ({
          title: 'Customer Advance',
          subtitle: `As at ${formatDateLong(todayISO())}`,
          columns: [
            { key: 'customer', label: 'Customer' },
            { key: 'advance', label: 'Available advance', align: 'right' },
          ],
          rows: withAdvance.map((c) => ({ customer: c.customer.name, advance: formatCurrency(c.totals.availableAdvance) })),
          totals: { customer: 'Total', advance: formatCurrency(withAdvance.reduce((s, c) => s + c.totals.availableAdvance, 0)) },
        }),
      },
      {
        id: 'credit-sales',
        group: 'Customer',
        name: 'Credit Sales',
        description: 'Invoices in the range that are not yet fully paid.',
        icon: Receipt,
        count: creditSales.length,
        build: () => ({
          title: 'Credit Sales',
          subtitle: rangeLabel,
          columns: [
            { key: 'invoice', label: 'Invoice' },
            { key: 'customer', label: 'Customer' },
            { key: 'total', label: 'Total', align: 'right' },
            { key: 'paid', label: 'Paid', align: 'right' },
            { key: 'due', label: 'Due', align: 'right' },
          ],
          rows: creditSales.map((s) => ({
            invoice: s.invoiceNo,
            customer: s.customerName,
            total: formatCurrency(s.totalAmount),
            paid: formatCurrency(s.amountPaid),
            due: formatCurrency(s.amountDue),
          })),
          totals: { invoice: `Total (${creditSales.length})`, due: formatCurrency(creditSales.reduce((s, r) => s + r.amountDue, 0)) },
        }),
      },
      {
        id: 'payment-collection',
        group: 'Customer',
        name: 'Payment Collection',
        description: 'Every payment recorded in the range.',
        icon: Wallet,
        count: paymentsInRange.length,
        build: () => ({
          title: 'Payment Collection',
          subtitle: rangeLabel,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'reference', label: 'Reference' },
            { key: 'customer', label: 'Customer' },
            { key: 'amount', label: 'Amount', align: 'right' },
          ],
          rows: paymentsInRange.map((t) => ({
            date: formatDate(t.date),
            reference: t.reference,
            customer: customerNameOf(data.customers, t.customerId),
            amount: formatCurrency(t.credit),
          })),
          totals: { date: 'Total', amount: formatCurrency(paymentsInRange.reduce((s, t) => s + t.credit, 0)) },
        }),
      },
      {
        id: 'customer-ledger',
        group: 'Customer',
        name: 'Customer Ledger',
        description: 'Every customer transaction in the range, in order.',
        icon: BookText,
        count: ledgerRows.length,
        build: () => ({
          title: 'Customer Ledger',
          subtitle: rangeLabel,
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'reference', label: 'Reference' },
            { key: 'customer', label: 'Customer' },
            { key: 'description', label: 'Description' },
            { key: 'debit', label: 'Debit', align: 'right' },
            { key: 'credit', label: 'Credit', align: 'right' },
            { key: 'balance', label: 'Balance', align: 'right' },
          ],
          rows: [...ledgerRows].reverse().map((r) => ({
            date: formatDate(r.date),
            reference: r.reference,
            customer: r.customerName,
            description: r.description,
            debit: r.debit > 0 ? formatCurrency(r.debit) : '',
            credit: r.credit > 0 ? formatCurrency(r.credit) : '',
            balance: formatCurrency(r.balance),
          })),
        }),
      },

      // ---------------------------------------------------------- company finance
      {
        id: 'pnl',
        group: 'Company Finance',
        name: 'Monthly P&L',
        description: `Profit and loss for every month of ${year}.`,
        icon: TrendingUp,
        count: 12,
        build: () => ({
          title: `Profit & Loss — ${year}`,
          subtitle: 'Monthly summary',
          meta: [
            { label: 'Year sales', value: formatCurrency(pnlTotals.sales) },
            { label: 'Gross profit', value: formatCurrency(pnlTotals.grossProfit) },
            { label: 'Net profit', value: formatCurrency(pnlTotals.netProfit) },
          ],
          columns: [
            { key: 'month', label: 'Month' },
            ...PNL_FIELDS.map((field) => ({ key: field.key, label: field.label, align: 'right' as const })),
            { key: 'gross', label: 'Gross Profit', align: 'right' as const },
            { key: 'net', label: 'Net Profit', align: 'right' as const },
          ],
          rows: pnlYear.months.map((month) => {
            const result = analyseMonth(month)
            return {
              month: MONTHS[month.monthIndex] ?? '',
              ...Object.fromEntries(PNL_FIELDS.map((field) => [field.key, formatNumber(month[field.key])])),
              gross: formatNumber(result.grossProfit),
              net: formatNumber(result.netProfit),
            }
          }),
          totals: {
            month: 'Year total',
            ...Object.fromEntries(PNL_FIELDS.map((field) => [field.key, formatNumber(pnlTotals[field.key])])),
            gross: formatNumber(pnlTotals.grossProfit),
            net: formatNumber(pnlTotals.netProfit),
          },
        }),
      },
      {
        id: 'cash',
        group: 'Company Finance',
        name: 'Cash Ledger',
        description: 'Cash-account entries in the range, with running balance.',
        icon: Wallet,
        count: ledgerInRange.filter((row) => data.accounts.find((a) => a.id === row.accountId)?.kind === 'cash').length,
        build: () => {
          const cashAccountIds = data.accounts.filter((a) => a.kind === 'cash').map((a) => a.id)
          const rows = ledgerInRange.filter((row) => cashAccountIds.includes(row.accountId))
          return {
            title: 'Cash Ledger',
            subtitle: rangeLabel,
            meta: [{ label: 'Cash in hand', value: formatCurrency(balanceTotals.cash) }],
            columns: ledgerColumns,
            rows: [...rows].reverse().map(ledgerRow),
            totals: {
              date: 'Total',
              in: formatCurrency(rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0)),
              out: formatCurrency(rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0)),
              balance: formatCurrency(balanceTotals.cash),
            },
          }
        },
      },
      {
        id: 'bank',
        group: 'Company Finance',
        name: 'Bank Ledger',
        description: 'Bank-account entries in the range, with running balance.',
        icon: Landmark,
        count: ledgerInRange.filter((row) => data.accounts.find((a) => a.id === row.accountId)?.kind === 'bank').length,
        build: () => {
          const bankAccountIds = data.accounts.filter((a) => a.kind === 'bank').map((a) => a.id)
          const rows = ledgerInRange.filter((row) => bankAccountIds.includes(row.accountId))
          return {
            title: 'Bank Ledger',
            subtitle: rangeLabel,
            meta: [{ label: 'Total in banks', value: formatCurrency(balanceTotals.bank) }],
            columns: ledgerColumns,
            rows: [...rows].reverse().map(ledgerRow),
            totals: {
              date: 'Total',
              in: formatCurrency(rows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.amount, 0)),
              out: formatCurrency(rows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.amount, 0)),
              balance: formatCurrency(balanceTotals.bank),
            },
          }
        },
      },
      {
        id: 'closings',
        group: 'Company Finance',
        name: 'Monthly Closing',
        description: 'Every frozen cash & bank month-end snapshot on record.',
        icon: BarChart3,
        count: data.ledgerClosings.length,
        build: () => ({
          title: 'Monthly Closing Summary',
          subtitle: 'All frozen snapshots',
          columns: [
            { key: 'month', label: 'Month' },
            { key: 'in', label: 'Money in', align: 'right' },
            { key: 'out', label: 'Money out', align: 'right' },
            { key: 'total', label: 'Closing position', align: 'right' },
            { key: 'closedAt', label: 'Closed on' },
          ],
          rows: [...data.ledgerClosings]
            .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1))
            .map((closing) => ({
              month: `${closing.month} ${closing.year}`,
              in: formatCurrency(closing.monthIn),
              out: formatCurrency(closing.monthOut),
              total: formatCurrency(closing.grandTotal),
              closedAt: formatDate(closing.closedAt.slice(0, 10)),
            })),
        }),
      },
    ]

    function ledgerRow(row: (typeof ledgerInRange)[number]) {
      return {
        date: formatDate(row.date),
        details: row.details || '—',
        account: row.accountName,
        category: row.category,
        in: row.direction === 'in' ? formatCurrency(row.amount) : '',
        out: row.direction === 'out' ? formatCurrency(row.amount) : '',
        balance: formatCurrency(row.balance),
      }
    }
  }, [data, productionInRange, allSales, salesInRange, ledgerInRange, customerTxnsInRange, rangeLabel, year, to])

  // ---------------------------------------------------------------- export

  const exportCsv = (report: ReportDefinition) => {
    const payload = report.build()

    // Quoting everything is the safe choice: names and details contain
    // commas, and a report that breaks a spreadsheet is not a report.
    const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`

    const lines = [
      payload.columns.map((column) => escape(column.label)).join(','),
      ...payload.rows.map((row) => payload.columns.map((column) => escape(row[column.key] ?? '')).join(',')),
    ]

    if (payload.totals) {
      lines.push(payload.columns.map((column) => escape(payload.totals?.[column.key] ?? '')).join(','))
    }

    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${report.name.replace(/\s+/g, '-').toLowerCase()}-${from}-to-${to}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('Report exported', { description: `${report.name} saved as CSV.` })
  }

  const spendBreakdown = useMemo(() => categoryBreakdown(data.transactions, 'out', { from, to }).slice(0, 8), [data.transactions, from, to])
  const monthNet = useMemo(() => monthMovement(data.transactions, to.slice(0, 7)), [data.transactions, to])

  if (loading) return <PageSkeleton />

  const nothingRecorded = data.productionEntries.length === 0 && data.sales.length === 0 && data.transactions.length === 0

  if (nothingRecorded) {
    return (
      <div>
        <PageHeader title="Reports" />
        <Section>
          <EmptyState
            icon={FileText}
            size="lg"
            title="Nothing to report yet"
            description="Reports are built from your production entries, sales and ledger transactions. Record a few and they will appear here, ready to print or export."
          />
        </Section>
      </div>
    )
  }

  const groups: ReportDefinition['group'][] = ['Production', 'Sales', 'Customer', 'Company Finance']

  return (
    <div>
      <PageHeader title="Reports" description="Pick a date range and filters, then print a document or export a spreadsheet." />

      <Section title="Date range and filters" className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label htmlFor="report-from" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">From</label>
            <Input id="report-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="report-to" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">To</label>
            <Input id="report-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Product</label>
            <Select value={productFilter} onValueChange={setProductFilter}>
              <SelectTrigger><SelectValue placeholder="All products" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All products</SelectItem>
                {data.products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Customer</label>
            <Select value={customerFilter} onValueChange={setCustomerFilter}>
              <SelectTrigger><SelectValue placeholder="All customers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All customers</SelectItem>
                {data.customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Payment status</label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as PaymentStatus | typeof ALL)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="due">Due</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Account</label>
            <Select value={accountFilter} onValueChange={setAccountFilter}>
              <SelectTrigger><SelectValue placeholder="All accounts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All accounts</SelectItem>
                {data.accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: 'This month', from: firstDayOfMonth(thisYear, thisMonth), to: todayISO() },
              { label: 'Last month', from: firstDayOfMonth(thisYear, thisMonth - 1), to: lastDayOfMonth(thisYear, thisMonth - 1) },
              { label: 'This year', from: firstDayOfMonth(thisYear, 0), to: todayISO() },
            ].map((preset) => (
              <Button key={preset.label} variant="outline" size="sm" onClick={() => { setFrom(preset.from); setTo(preset.to) }}>
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="ml-auto">
            <label htmlFor="report-year" className="mb-1.5 block text-2xs font-semibold uppercase tracking-wider text-muted-foreground">P&amp;L year</label>
            <Input id="report-year" type="number" min={2000} max={2100} className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />
          </div>
        </div>
      </Section>

      {groups.map((group) => {
        const groupReports = reports.filter((r) => r.group === group)
        if (groupReports.length === 0) return null

        return (
          <div key={group} className="mb-5">
            <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{group} Reports</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {groupReports.map((report) => (
                <div key={report.id} className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-card transition-shadow hover:shadow-raised">
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-50 text-primary-700">
                      <report.icon className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[0.875rem] font-semibold leading-tight">{report.name}</h3>
                      <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{report.description}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
                    <Badge variant={report.count > 0 ? 'outline' : 'destructive'}>{report.count > 0 ? `${report.count} rows` : 'No data'}</Badge>
                    <div className="flex gap-1.5">
                      <Button variant="outline" size="sm" disabled={report.count === 0} onClick={() => exportCsv(report)}>
                        <Download />
                        CSV
                      </Button>
                      <Button size="sm" disabled={report.count === 0} onClick={() => print(report.build())}>
                        <Printer />
                        Print
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {spendBreakdown.length > 0 && (
        <Section title="Where the money went" description={`Spending by category · ${rangeLabel}`}>
          <ul className="space-y-2">
            {spendBreakdown.map((entry) => {
              const largest = spendBreakdown[0]?.amount ?? 1
              const share = (entry.amount / largest) * 100

              return (
                <li key={entry.category}>
                  <div className="mb-1 flex items-baseline justify-between gap-3 text-[0.8125rem]">
                    <span className="truncate">{entry.category}</span>
                    <span className="shrink-0 font-mono tabular font-medium">
                      {formatCurrency(entry.amount)}
                      <span className="ml-1.5 text-2xs font-normal text-muted-foreground">{entry.count}×</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.max(share, 2)}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>

          <p className="mt-3 border-t border-dashed border-border pt-2.5 text-2xs text-muted-foreground">
            Net movement for {formatDateLong(to).slice(-8)}:{' '}
            <span className={`font-mono tabular font-semibold ${monthNet.net < 0 ? 'text-primary-700' : 'text-success-700'}`}>
              {formatCurrency(monthNet.net)}
            </span>{' '}
            · transfers between accounts are excluded, since they are neither income nor expenditure.
          </p>
        </Section>
      )}
    </div>
  )
}

const ledgerColumns = [
  { key: 'date', label: 'Date' },
  { key: 'details', label: 'Details' },
  { key: 'account', label: 'Account' },
  { key: 'category', label: 'Category' },
  { key: 'in', label: 'In', align: 'right' as const },
  { key: 'out', label: 'Out', align: 'right' as const },
  { key: 'balance', label: 'Balance', align: 'right' as const },
]
