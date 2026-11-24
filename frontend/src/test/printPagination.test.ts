import { describe, expect, it } from 'vitest'
import { paginate, type PageSpec } from '@/features/reports/paginate'

const rowsOn = (pages: PageSpec[]) => pages.map((p) => [p.rowStart, p.rowEnd])

describe('paginate', () => {
  it('keeps a short document on one page with everything on it', () => {
    const pages = paginate({ top: 100, head: 20, rows: [30, 30, 30], totals: 25, tail: 60 }, 1000)
    expect(pages).toEqual([{ top: true, rowStart: 0, rowEnd: 3, table: true, totals: true, tail: true }])
  })

  it('splits rows across pages, with the letterhead on page one only', () => {
    // Page one: 100 top + 20 head leaves room for 2 rows of 40 (200 budget).
    const pages = paginate({ top: 100, head: 20, rows: Array(8).fill(40), totals: 0, tail: 0 }, 200)
    expect(rowsOn(pages)).toEqual([[0, 2], [2, 6], [6, 8]])
    expect(pages.map((p) => p.top)).toEqual([true, false, false])
    expect(pages.every((p) => p.table)).toBe(true)
  })

  it('never leaves the total row alone on a page', () => {
    // Four rows fill page one exactly; the total carries the last row with it.
    const pages = paginate({ top: 0, head: 20, rows: [45, 45, 45, 45], totals: 25, tail: 0 }, 200)
    expect(rowsOn(pages)).toEqual([[0, 3], [3, 4]])
    expect(pages.map((p) => p.totals)).toEqual([false, true])
  })

  it('moves the balance and footer to their own page when they do not fit', () => {
    const pages = paginate({ top: 0, head: 20, rows: [80, 80], totals: 0, tail: 60 }, 200)
    expect(pages).toHaveLength(2)
    expect(pages[1]).toEqual({ top: false, rowStart: 2, rowEnd: 2, table: false, totals: false, tail: true })
  })

  it('still places a row taller than a whole page instead of looping', () => {
    const pages = paginate({ top: 0, head: 20, rows: [500, 30], totals: 0, tail: 0 }, 200)
    expect(rowsOn(pages)).toEqual([[0, 1], [1, 2]])
  })

  it('prints an empty table (the "No records" row) on one page', () => {
    const pages = paginate({ top: 100, head: 20, rows: [30], totals: 0, tail: 40 }, 1000)
    expect(pages).toHaveLength(1)
  })
})
