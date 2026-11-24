/**
 * Splits a printed document into pages.
 *
 * Browsers disagree about how a long document becomes pages: Chrome repeats
 * `position: fixed` elements and table headers on every page, Safari does
 * neither (it prints one long strip cut into page-sized slices). So the
 * printed document is laid out as explicit pages instead — each one a block
 * shorter than any browser's printable height, forced onto its own sheet —
 * and anything that must appear on every page (the seal, the column header)
 * is simply rendered on every page.
 *
 * Pure arithmetic over measured heights (in px), so it can be tested without
 * a browser.
 */

export interface SheetMeasurements {
  /** Letterhead, party heading, title and meta — page one only. */
  top: number
  /** The table's column header, repeated on every page with rows. */
  head: number
  /** Each body row, in order. */
  rows: number[]
  /** The closing total row (0 when there is none). */
  totals: number
  /** Balance, footnote and footer — after the table, once. */
  tail: number
}

export interface PageSpec {
  /** Page one carries the letterhead. */
  top: boolean
  /** Body rows `[rowStart, rowEnd)` printed on this page. */
  rowStart: number
  rowEnd: number
  /** Whether this page prints the table at all (a tail-only last page does not). */
  table: boolean
  totals: boolean
  tail: boolean
}

export function paginate(m: SheetMeasurements, pageHeight: number): PageSpec[] {
  const pages: PageSpec[] = []
  const n = m.rows.length
  let page: PageSpec = { top: true, rowStart: 0, rowEnd: 0, table: true, totals: false, tail: false }
  let used = m.top + m.head

  let i = 0
  while (i < n) {
    const height = m.rows[i]
    // A page always takes at least one row, so an oversized row can't loop forever.
    if (used + height > pageHeight && page.rowEnd > page.rowStart) {
      pages.push(page)
      page = { top: false, rowStart: i, rowEnd: i, table: true, totals: false, tail: false }
      used = m.head
      continue
    }
    i += 1
    page.rowEnd = i
    used += height
  }

  if (m.totals > 0) {
    // Never print the total row alone: carry the last row over with it.
    if (used + m.totals > pageHeight && page.rowEnd - page.rowStart > 1) {
      page.rowEnd -= 1
      pages.push(page)
      const carried = page.rowEnd
      page = { top: false, rowStart: carried, rowEnd: n, table: true, totals: false, tail: false }
      used = m.head + m.rows[carried]
    }
    page.totals = true
    used += m.totals
  }

  if (used + m.tail > pageHeight) {
    pages.push(page)
    page = { top: false, rowStart: n, rowEnd: n, table: false, totals: false, tail: true }
  } else {
    page.tail = true
  }
  pages.push(page)

  return pages
}
