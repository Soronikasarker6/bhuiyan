import {
  OPERATING_COST_KEYS,
  PRODUCTION_COST_KEYS,
  type PnlFieldKey,
  type PnlMonth,
  type PnlResult,
  type PnlYear,
} from '@/types'
import { MONTHS } from './format'

/**
 * Profit and loss.
 *
 *     Gross Profit = Sales − production costs
 *     Net Profit   = Gross Profit − office/admin − rent − interest
 *
 * Both are **always computed**. Neither is ever a field a person can type,
 * because a typed profit figure is one that stops agreeing with the costs
 * above it the moment either is edited.
 */

/** The order these appear on the form, and their labels. */
export const PNL_FIELDS: Array<{ key: PnlFieldKey; label: string; group: 'sales' | 'production' | 'operating' }> = [
  { key: 'sales', label: 'Sales', group: 'sales' },
  { key: 'materialCost', label: 'Material Cost', group: 'production' },
  { key: 'labourCost', label: 'Labour Cost', group: 'production' },
  { key: 'electricity', label: 'Electricity', group: 'production' },
  { key: 'freight', label: 'Freight', group: 'production' },
  { key: 'transport', label: 'Transport', group: 'production' },
  { key: 'handling', label: 'Handling', group: 'production' },
  { key: 'otherCosts', label: 'Other Costs', group: 'production' },
  { key: 'officeAdmin', label: 'Office / Admin', group: 'operating' },
  { key: 'rent', label: 'Rent', group: 'operating' },
  { key: 'interest', label: 'Interest', group: 'operating' },
]

export const PNL_LABELS: Record<PnlFieldKey, string> = PNL_FIELDS.reduce(
  (labels, field) => ({ ...labels, [field.key]: field.label }),
  {} as Record<PnlFieldKey, string>,
)

const num = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

// ---------------------------------------------------------------- calculation

export function productionCost(month: PnlMonth): number {
  return PRODUCTION_COST_KEYS.reduce((total, key) => total + num(month[key]), 0)
}

export function operatingCost(month: PnlMonth): number {
  return OPERATING_COST_KEYS.reduce((total, key) => total + num(month[key]), 0)
}

export function grossProfit(month: PnlMonth): number {
  return num(month.sales) - productionCost(month)
}

export function netProfit(month: PnlMonth): number {
  return grossProfit(month) - operatingCost(month)
}

/** Everything derived for one month, computed once. */
export function analyseMonth(month: PnlMonth): PnlResult {
  const sales = num(month.sales)
  const production = productionCost(month)
  const gross = sales - production
  const operating = operatingCost(month)
  const net = gross - operating

  return {
    productionCost: production,
    grossProfit: gross,
    operatingCost: operating,
    netProfit: net,
    grossMargin: sales === 0 ? 0 : (gross / sales) * 100,
    netMargin: sales === 0 ? 0 : (net / sales) * 100,
  }
}

// ---------------------------------------------------------------- year totals

export type PnlYearTotals = Record<PnlFieldKey, number> & PnlResult & { sales: number }

export function analyseYear(year: PnlYear): PnlYearTotals {
  const totals = PNL_FIELDS.reduce(
    (acc, field) => ({
      ...acc,
      [field.key]: year.months.reduce((sum, month) => sum + num(month[field.key]), 0),
    }),
    {} as Record<PnlFieldKey, number>,
  )

  const production = PRODUCTION_COST_KEYS.reduce((total, key) => total + totals[key], 0)
  const operating = OPERATING_COST_KEYS.reduce((total, key) => total + totals[key], 0)
  const gross = totals.sales - production
  const net = gross - operating

  return {
    ...totals,
    productionCost: production,
    grossProfit: gross,
    operatingCost: operating,
    netProfit: net,
    grossMargin: totals.sales === 0 ? 0 : (gross / totals.sales) * 100,
    netMargin: totals.sales === 0 ? 0 : (net / totals.sales) * 100,
  }
}

// ---------------------------------------------------------------- construction

export function emptyMonth(monthIndex: number): PnlMonth {
  return {
    monthIndex,
    sales: 0,
    materialCost: 0,
    labourCost: 0,
    electricity: 0,
    freight: 0,
    transport: 0,
    handling: 0,
    otherCosts: 0,
    officeAdmin: 0,
    rent: 0,
    interest: 0,
  }
}

export function emptyYear(year: number): PnlYear {
  return { year, months: MONTHS.map((_, index) => emptyMonth(index)) }
}

/** Find a year, creating an empty one rather than returning undefined. */
export function yearOf(pnl: PnlYear[], year: number): PnlYear {
  return pnl.find((y) => y.year === year) ?? emptyYear(year)
}

export function availableYears(pnl: PnlYear[], fallback: number): number[] {
  const years = pnl.map((y) => y.year)
  if (!years.includes(fallback)) years.push(fallback)
  return [...new Set(years)].sort((a, b) => b - a)
}

// ---------------------------------------------------------------- chart series

export interface PnlSeriesPoint {
  month: string
  monthFull: string
  Sales: number
  'Net Profit': number
  'Gross Profit': number
}

export function chartSeries(year: PnlYear): PnlSeriesPoint[] {
  return year.months.map((month) => ({
    month: MONTHS[month.monthIndex]?.slice(0, 3) ?? '',
    monthFull: MONTHS[month.monthIndex] ?? '',
    Sales: num(month.sales),
    'Gross Profit': grossProfit(month),
    'Net Profit': netProfit(month),
  }))
}

/** Whether a month has had anything entered — drives the "not filled in" hint. */
export function isMonthEmpty(month: PnlMonth): boolean {
  return PNL_FIELDS.every((field) => num(month[field.key]) === 0)
}
