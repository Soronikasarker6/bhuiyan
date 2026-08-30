import { describe, expect, it } from 'vitest'
import type { PnlMonth } from '@/types'
import {
  analyseMonth,
  analyseYear,
  emptyMonth,
  emptyYear,
  grossProfit,
  isMonthEmpty,
  netProfit,
  operatingCost,
  productionCost,
} from '@/utils/pnl'
import { formatCompact, formatMoneyGrouping } from './helpers'

/**
 * Profit and loss.
 *
 * Gross and net are always computed. These tests exist to make sure they stay
 * that way, and that a loss-making month reports a loss rather than a
 * suspiciously round zero.
 */

const AUGUST: PnlMonth = {
  monthIndex: 7,
  sales: 6_090_000,
  materialCost: 5_000_000,
  labourCost: 97_440,
  electricity: 365_400,
  freight: 182_700,
  transport: 20_000,
  handling: 20_000,
  otherCosts: 5_000,
  officeAdmin: 120_000,
  rent: 100_000,
  interest: 359_000,
}

describe('profit calculation', () => {
  it('adds up the production costs that sit above gross profit', () => {
    // 5,000,000 + 97,440 + 365,400 + 182,700 + 20,000 + 20,000 + 5,000
    expect(productionCost(AUGUST)).toBe(5_690_540)
  })

  it('adds up the operating costs that sit between gross and net', () => {
    expect(operatingCost(AUGUST)).toBe(579_000)
  })

  it('computes gross profit as sales less production costs', () => {
    expect(grossProfit(AUGUST)).toBe(6_090_000 - 5_690_540)
    expect(grossProfit(AUGUST)).toBe(399_460)
  })

  it('computes net profit as gross less office, rent and interest', () => {
    expect(netProfit(AUGUST)).toBe(399_460 - 579_000)
    expect(netProfit(AUGUST)).toBe(-179_540)
  })

  it('reports a loss as a loss', () => {
    const result = analyseMonth(AUGUST)

    expect(result.netProfit).toBeLessThan(0)
    expect(result.netMargin).toBeLessThan(0)
  })

  it('never divides by zero when there were no sales', () => {
    const barren: PnlMonth = { ...emptyMonth(0), materialCost: 50_000 }
    const result = analyseMonth(barren)

    expect(result.grossProfit).toBe(-50_000)
    expect(result.grossMargin).toBe(0)
    expect(result.netMargin).toBe(0)
    expect(Number.isFinite(result.netMargin)).toBe(true)
  })

  it('treats a blank field as zero rather than NaN', () => {
    const partial = { ...emptyMonth(3), sales: 100_000, materialCost: undefined } as unknown as PnlMonth

    expect(netProfit(partial)).toBe(100_000)
  })
})

describe('year totals', () => {
  it('sums every line and recomputes the profits from the totals', () => {
    const year = emptyYear(2026)
    year.months[7] = AUGUST
    year.months[8] = { ...AUGUST, monthIndex: 8, sales: 7_000_000 }

    const totals = analyseYear(year)

    expect(totals.sales).toBe(13_090_000)
    expect(totals.materialCost).toBe(10_000_000)
    expect(totals.grossProfit).toBe(totals.sales - totals.productionCost)
    expect(totals.netProfit).toBe(totals.grossProfit - totals.operatingCost)
  })

  it('agrees with the sum of the individual months', () => {
    const year = emptyYear(2026)
    year.months[0] = { ...AUGUST, monthIndex: 0 }
    year.months[1] = { ...AUGUST, monthIndex: 1, sales: 8_000_000 }

    const totals = analyseYear(year)
    const byMonth = year.months.reduce((sum, month) => sum + netProfit(month), 0)

    expect(totals.netProfit).toBe(byMonth)
  })

  it('handles a year with nothing entered', () => {
    const totals = analyseYear(emptyYear(2026))

    expect(totals.sales).toBe(0)
    expect(totals.netProfit).toBe(0)
    expect(totals.netMargin).toBe(0)
  })
})

describe('month emptiness', () => {
  it('recognises a month nobody has filled in', () => {
    expect(isMonthEmpty(emptyMonth(5))).toBe(true)
    expect(isMonthEmpty(AUGUST)).toBe(false)
  })
})

describe('number formatting', () => {
  it('groups digits in the South Asian style', () => {
    // 12,34,567 — not 1,234,567. A finance user here reads the group
    // boundaries before the digits.
    expect(formatMoneyGrouping(1_234_567)).toBe('12,34,567')
    expect(formatMoneyGrouping(100_000)).toBe('1,00,000')
  })

  it('reports large figures in lakh and crore', () => {
    expect(formatCompact(1_24_00_000)).toContain('Cr')
    expect(formatCompact(3_40_000)).toContain('L')
  })
})
