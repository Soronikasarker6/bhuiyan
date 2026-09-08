import type { MeshSize, MonthlyProfit, Product, RawMaterialImport, Sale, SaleItem, Transaction } from '@/types'
import { buildSaleItemRows, itemsForSale } from './sales'
import { averageCostPerTon } from './rawMaterial'
import { monthMovement } from './ledger'
import { makeMonthKey, MONTHS } from './format'

/**
 * Net Profit — computed entirely from real records, never typed in.
 *
 *     Cost of Goods Sold = Σ per product: (tons sold this month) × average cost/ton
 *     Gross Profit       = Total Sales − Cost of Goods Sold
 *     Total Expenses     = the Cash & Bank Ledger's own "out" transactions this
 *                          month, transfers excluded (`monthMovement`, unchanged)
 *     Net Profit         = Gross Profit − Total Expenses
 *
 * "Cost of goods sold" is deliberately not "raw material bought this month" —
 * a business that imports 10,000kg but sells 3,000kg has only sold 3,000kg
 * of cost, not 10,000kg (§6). Cost per ton comes from `averageCostPerTon`, the
 * same weighted-average function the raw material stock cards use, so this
 * can never show a different cost basis than what stock reports as available.
 */
export function monthlyProfit(
  year: number,
  monthIndex: number,
  data: {
    sales: Sale[]
    saleItems: SaleItem[]
    products: Product[]
    meshSizes: MeshSize[]
    rawMaterialImports: RawMaterialImport[]
    transactions: Transaction[]
  },
): MonthlyProfit {
  const monthKey = makeMonthKey(year, monthIndex)
  const salesThisMonth = data.sales.filter((s) => s.date.slice(0, 7) === monthKey)

  const itemsThisMonth = salesThisMonth.flatMap((sale) => itemsForSale(data.saleItems, sale.id))
  const rows = buildSaleItemRows(itemsThisMonth, data.products, data.meshSizes)

  const totalSales = rows.reduce((sum, r) => sum + r.amount, 0)

  const tonsSoldByProduct = new Map<string, number>()
  for (const row of rows) {
    tonsSoldByProduct.set(row.productId, (tonsSoldByProduct.get(row.productId) ?? 0) + row.weightTon)
  }

  const costOfGoodsSold = [...tonsSoldByProduct.entries()].reduce((sum, [productId, tons]) => {
    const costPerTon = averageCostPerTon(productId, data.rawMaterialImports) ?? 0
    return sum + tons * costPerTon
  }, 0)

  const grossProfit = totalSales - costOfGoodsSold
  const totalExpenses = monthMovement(data.transactions, monthKey).monthOut
  const netProfit = grossProfit - totalExpenses

  return {
    year,
    monthIndex,
    totalSales,
    costOfGoodsSold,
    grossProfit,
    totalExpenses,
    netProfit,
    grossMargin: totalSales === 0 ? 0 : (grossProfit / totalSales) * 100,
    netMargin: totalSales === 0 ? 0 : (netProfit / totalSales) * 100,
  }
}

/** Every month of a year, for the year-at-a-glance table. */
export function yearlyProfit(
  year: number,
  data: Parameters<typeof monthlyProfit>[2],
): MonthlyProfit[] {
  return MONTHS.map((_, monthIndex) => monthlyProfit(year, monthIndex, data))
}

export interface ProfitYearTotals {
  totalSales: number
  costOfGoodsSold: number
  grossProfit: number
  totalExpenses: number
  netProfit: number
}

export function yearlyProfitTotals(months: MonthlyProfit[]): ProfitYearTotals {
  return months.reduce(
    (totals, m) => ({
      totalSales: totals.totalSales + m.totalSales,
      costOfGoodsSold: totals.costOfGoodsSold + m.costOfGoodsSold,
      grossProfit: totals.grossProfit + m.grossProfit,
      totalExpenses: totals.totalExpenses + m.totalExpenses,
      netProfit: totals.netProfit + m.netProfit,
    }),
    { totalSales: 0, costOfGoodsSold: 0, grossProfit: 0, totalExpenses: 0, netProfit: 0 },
  )
}
