import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { formatDateTime, todayISO, formatDateLong } from '@/utils/format'
import { useCompanyProfile } from '@/hooks/useCompanyProfile'
import type { CompanyProfile } from '@/types'
import { PrintWatermark } from './PrintWatermark'
import { paginate, type PageSpec } from './paginate'

/**
 * Printing.
 *
 * Reports print from a dedicated document rather than by hiding parts of the
 * application with CSS. That distinction matters: a printed register is a
 * business document that gets filed, signed and handed to an auditor, and it
 * should look like one — ruled table, company header, date range, a footer
 * saying when it was produced — not like a screenshot of a web page with the
 * navigation removed.
 *
 * The payload is deliberately plain data. Any screen can hand a table to the
 * printer without the print layout knowing anything about that screen.
 */

export interface PrintColumn {
  key: string
  label: string
  align?: 'left' | 'right'
}

export interface PrintPayload {
  title: string
  subtitle?: string
  meta?: Array<{ label: string; value: string }>
  columns: PrintColumn[]
  rows: Array<Record<string, string>>
  /** A closing total row, rendered in bold beneath the body. */
  totals?: Record<string, string>
  footnote?: string
  /**
   * The party a statement is about — printed as a prominent heading between
   * the letterhead and the table, so whose ledger this is reads first.
   */
  party?: { name: string; details?: string[] }
  /**
   * The closing Due/Advance, printed beneath the table with the amount in
   * words. `amount` is already formatted; `words` from `amountToWords`.
   */
  balance?: { label: string; amount: string; words: string }
}

interface PrintValue {
  print: (payload: PrintPayload) => void
}

const PrintContext = createContext<PrintValue | null>(null)

export function PrintProvider({ children }: { children: ReactNode }) {
  const [payload, setPayload] = useState<PrintPayload | null>(null)

  const print = useCallback((next: PrintPayload) => {
    setPayload(next)
    // One frame for the sheet to mount before the print dialog reads the DOM.
    window.setTimeout(() => window.print(), 100)
  }, [])

  // Clear after printing so the sheet is not left in the DOM, where it would
  // be read out by a screen reader and would print again next time.
  useEffect(() => {
    const clear = () => setPayload(null)
    window.addEventListener('afterprint', clear)
    return () => window.removeEventListener('afterprint', clear)
  }, [])

  return (
    <PrintContext.Provider value={{ print }}>
      {children}
      {payload && <PrintSheet payload={payload} />}
    </PrintContext.Provider>
  )
}

export function usePrint(): PrintValue {
  const value = useContext(PrintContext)
  if (!value) throw new Error('usePrint must be used inside a PrintProvider')
  return value
}

/**
 * The same `PrintPayload` as a CSV — every register in the app builds one
 * payload and hands it to both `print()` (PDF, via the browser's print
 * dialog) and this function (CSV), so the two never drift apart. Quoting
 * everything is the safe choice: names and details contain commas, and a
 * register that breaks a spreadsheet is not a register.
 */
export function printPayloadToCsv(payload: PrintPayload): string {
  const escape = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const lines: string[] = []

  if (payload.meta && payload.meta.length > 0) {
    for (const entry of payload.meta) lines.push(`${escape(entry.label)},${escape(entry.value)}`)
    lines.push('')
  }

  lines.push(payload.columns.map((column) => escape(column.label)).join(','))
  for (const row of payload.rows) {
    lines.push(payload.columns.map((column) => escape(row[column.key] ?? '')).join(','))
  }

  if (payload.totals) {
    lines.push(payload.columns.map((column) => escape(payload.totals?.[column.key] ?? '')).join(','))
  }

  if (payload.footnote) {
    lines.push('')
    lines.push(escape(payload.footnote))
  }

  return '﻿' + lines.join('\r\n')
}

/**
 * The letterhead's contact line — phone, email, location and website, in
 * that order, joined onto one row and skipping whichever fields are empty.
 * An empty Company Profile field never prints as a bare, meaningless label
 * (`Website:` with nothing after it) — it simply isn't there.
 */
function contactLine(profile: CompanyProfile): string {
  return [profile.phone, profile.email, profile.address, profile.website]
    .map((value) => value.trim())
    .filter(Boolean)
    .join('  ·  ')
}

/** One millimetre in CSS pixels. */
const MM = 96 / 25.4

/**
 * Height of one printed page block. It must sit below the printable height
 * of A4 in every browser this is printed from — Chrome gives 269mm (A4 less
 * the 14mm `@page` margins), Safari about 250mm (it keeps room for its own
 * header and footer). Rows are packed a little short of it, so rounding can
 * never push a block past the end of its sheet.
 */
const PAGE_HEIGHT_MM = 245
const PAGE_FILL_PX = (PAGE_HEIGHT_MM - 4) * MM

interface SheetLayout {
  payload: PrintPayload
  profile: CompanyProfile
  /** Column widths (px) from the measured table, so every page's table matches. */
  colWidths: number[]
  pages: PageSpec[]
}

/**
 * The printed document.
 *
 * Hidden on screen, visible on paper. Black on white with real rules — the
 * screen's cream and maroon cost ink and reproduce badly on an office laser.
 *
 * Rendered twice: first all in one piece, off-screen at the printed page's
 * width, to measure it; then as explicit pages (see `paginate`), each with
 * its own company seal and column header. Both renders happen before the
 * browser paints, well inside the delay before `window.print()`.
 */
function PrintSheet({ payload }: { payload: PrintPayload }) {
  const { profile } = useCompanyProfile()
  const [layout, setLayout] = useState<SheetLayout | null>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const current = layout && layout.payload === payload && layout.profile === profile ? layout : null

  useLayoutEffect(() => {
    if (current || !measureRef.current) return
    const root = measureRef.current
    const table = root.querySelector<HTMLTableElement>('.print-table')!
    const top = root.querySelector<HTMLElement>('[data-part="top"]')!
    const tail = root.querySelector<HTMLElement>('[data-part="tail"]')!

    // Freeze the auto-sized column widths first: every page then renders its
    // table with exactly these widths, so rows wrap — and measure — the same.
    const colWidths = [...table.tHead!.rows[0].cells].map((cell) => cell.getBoundingClientRect().width)
    table.querySelectorAll('col').forEach((col, index) => {
      col.style.width = `${colWidths[index]}px`
    })
    table.style.tableLayout = 'fixed'

    // Row heights from consecutive row tops, so collapsed borders add up exactly.
    const body = table.tBodies[0].getBoundingClientRect()
    const rowTops = [...table.tBodies[0].rows].map((row) => row.getBoundingClientRect().top)
    const rows = rowTops.map((rowTop, index) => (rowTops[index + 1] ?? body.bottom) - rowTop)
    const tableBox = table.getBoundingClientRect()

    const pages = paginate(
      {
        top: top.getBoundingClientRect().height,
        head: body.top - tableBox.top,
        rows,
        totals: tableBox.bottom - body.bottom,
        tail: tail.getBoundingClientRect().height,
      },
      PAGE_FILL_PX,
    )
    setLayout({ payload, profile, colWidths, pages })
  }, [current, payload, profile])

  if (!current) {
    return (
      <div ref={measureRef} className="print-sheet print-measure" aria-hidden>
        <div data-part="top" className="print-part">
          <SheetTop payload={payload} profile={profile} />
        </div>
        <SheetTable payload={payload} rowStart={0} rowEnd={payload.rows.length} totals />
        <div data-part="tail" className="print-part">
          <SheetTail payload={payload} profile={profile} />
        </div>
      </div>
    )
  }

  return (
    <div className="print-sheet hidden" aria-hidden>
      {current.pages.map((page, index) => (
        <section key={index} className="print-page">
          {/* The company seal, centred behind this page's content. */}
          <PrintWatermark />
          <div className="print-sheet-content">
            {page.top && (
              <div className="print-part">
                <SheetTop payload={payload} profile={profile} />
              </div>
            )}
            {page.table && (
              <SheetTable
                payload={payload}
                rowStart={page.rowStart}
                rowEnd={page.rowEnd}
                totals={page.totals}
                colWidths={current.colWidths}
              />
            )}
            {page.tail && (
              <div className="print-part">
                <SheetTail payload={payload} profile={profile} />
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Letterhead, party heading, title and meta — the top of page one. */
function SheetTop({ payload, profile }: { payload: PrintPayload; profile: CompanyProfile }) {
  const contact = contactLine(profile)
  const ownerLine = [profile.designation, profile.ownerName].filter(Boolean).join(': ')

  return (
    <>
      {/*
        The letterhead. Deliberately small and plain-text: a document is
        identified by its heading, not by the size of the logo above it, and
        every millimetre spent here is a row of data pushed onto a second
        page. Every field here comes from Settings → Company Profile
        (`useCompanyProfile`) — nothing about the business is typed into this
        component, so changing a phone number there reaches the very next
        document printed, invoice or register alike, with nothing to keep in
        sync by hand.
      */}
      <header style={{ borderBottom: '1.5px solid #111', paddingBottom: 7, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            {profile.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.logoUrl}
                alt=""
                style={{ height: 30, width: 30, objectFit: 'contain', flexShrink: 0 }}
              />
            )}
            <div>
              <h1 style={{ fontSize: '15.5pt', fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>
                {profile.name}
              </h1>
              {profile.tagline && (
                <p style={{ fontSize: '8.5pt', margin: '2px 0 0', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {profile.tagline}
                </p>
              )}
              {ownerLine && (
                <p style={{ fontSize: '8pt', margin: '2px 0 0', color: '#444' }}>{ownerLine}</p>
              )}
              {contact && (
                <p style={{ fontSize: '7.5pt', margin: '2px 0 0', color: '#555' }}>{contact}</p>
              )}
            </div>
          </div>
          <p style={{ fontSize: '8.5pt', margin: 0, textAlign: 'right', whiteSpace: 'nowrap' }}>
            {formatDateLong(todayISO())}
          </p>
        </div>
      </header>

      {payload.party && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            marginBottom: 12,
            padding: '9px 14px',
            background: '#f7f9fb',
            border: '1px solid #dde3ea',
            borderLeft: '3.5px solid #3a7fc1',
            borderRadius: 4,
            breakInside: 'avoid',
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '7.5pt', fontWeight: 700, margin: 0, color: '#3a7fc1', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Statement for
            </p>
            <p style={{ fontSize: '17pt', fontWeight: 700, margin: '1px 0 0', lineHeight: 1.15, color: '#111827', overflowWrap: 'anywhere' }}>
              {payload.party.name}
            </p>
            {payload.party.details && payload.party.details.length > 0 && (
              <p style={{ fontSize: '9pt', margin: '3px 0 0', color: '#4b5563', overflowWrap: 'anywhere' }}>
                {payload.party.details.join('  •  ')}
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <h2 style={{ fontSize: '13pt', fontWeight: 700, margin: 0, color: '#111827' }}>{payload.title}</h2>
            {payload.subtitle && (
              <span
                style={{
                  display: 'inline-block',
                  marginTop: 4,
                  padding: '2px 9px',
                  borderRadius: 999,
                  background: '#e3effa',
                  color: '#2563a6',
                  fontSize: '8.5pt',
                  fontWeight: 600,
                }}
              >
                {payload.subtitle}
              </span>
            )}
          </div>
        </div>
      )}

      <div style={{ marginBottom: payload.party && !payload.meta?.length ? 0 : 12 }}>
        {!payload.party && <h2 style={{ fontSize: '12.5pt', fontWeight: 700, margin: 0 }}>{payload.title}</h2>}
        {!payload.party && payload.subtitle && (
          <p style={{ fontSize: '9.5pt', margin: '3px 0 0', color: '#333' }}>{payload.subtitle}</p>
        )}

        {payload.meta && payload.meta.length > 0 && (
          <table style={{ border: 'none', marginTop: payload.party ? 0 : 8, fontSize: '9pt' }}>
            <tbody>
              {payload.meta.map((entry) => (
                <tr key={entry.label}>
                  <td style={{ border: 'none', padding: '1px 16px 1px 0', color: '#444' }}>
                    {entry.label}
                  </td>
                  <td style={{ border: 'none', padding: '1px 0', fontWeight: 600 }}>
                    {entry.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}

/**
 * The ruled table — rows `[rowStart, rowEnd)` of it, under its column header.
 * Every page that prints rows prints the header too, so a page torn out of a
 * ledger still says what its columns are.
 */
function SheetTable({
  payload,
  rowStart,
  rowEnd,
  totals = false,
  colWidths,
}: {
  payload: PrintPayload
  rowStart: number
  rowEnd: number
  totals?: boolean
  colWidths?: number[]
}) {
  return (
    <table className="print-table" style={colWidths ? { tableLayout: 'fixed' } : undefined}>
      <colgroup>
        {payload.columns.map((column, index) => (
          <col key={column.key} style={colWidths ? { width: colWidths[index] } : undefined} />
        ))}
      </colgroup>
      <thead>
        <tr>
          {payload.columns.map((column) => (
            <th
              key={column.key}
              style={{
                background: '#eee',
                textAlign: column.align ?? 'left',
                fontSize: '9pt',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {column.label}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {payload.rows.slice(rowStart, rowEnd).map((row, index) => (
          <tr key={index}>
            {payload.columns.map((column) => (
              <td
                key={column.key}
                style={{
                  textAlign: column.align ?? 'left',
                  fontFamily: column.align === 'right' ? 'monospace' : undefined,
                }}
              >
                {row[column.key] ?? ''}
              </td>
            ))}
          </tr>
        ))}

        {payload.rows.length === 0 && rowStart === 0 && (
          <tr>
            <td colSpan={payload.columns.length} style={{ textAlign: 'center', color: '#666' }}>
              No records for this selection.
            </td>
          </tr>
        )}
      </tbody>

      {totals && payload.totals && (
        <tfoot>
          <tr>
            {payload.columns.map((column, index) => (
              <td
                key={column.key}
                style={{
                  fontWeight: 700,
                  borderTop: '2px solid #111',
                  textAlign: column.align ?? 'left',
                  fontFamily: column.align === 'right' ? 'monospace' : undefined,
                }}
              >
                {payload.totals?.[column.key] ?? (index === 0 ? 'Total' : '')}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  )
}

/** Balance, footnote and footer — once, after the last row. */
function SheetTail({ payload, profile }: { payload: PrintPayload; profile: CompanyProfile }) {
  return (
    <>
      {payload.balance && (
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', breakInside: 'avoid' }}>
          <div style={{ border: '1px solid #111', padding: '5px 10px', maxWidth: '70%', textAlign: 'right' }}>
            <p style={{ fontSize: '10.5pt', margin: 0 }}>
              <span style={{ fontWeight: 700 }}>{payload.balance.label}:</span>{' '}
              <span style={{ fontWeight: 700, fontFamily: 'monospace' }}>{payload.balance.amount}</span>
            </p>
            <p style={{ fontSize: '8.5pt', margin: '2px 0 0', fontStyle: 'italic', color: '#333' }}>
              In Words: {payload.balance.words}
            </p>
          </div>
        </div>
      )}

      {payload.footnote && (
        <p style={{ fontSize: '9.5pt', marginTop: 12, fontWeight: 600 }}>{payload.footnote}</p>
      )}

      <footer
        style={{
          marginTop: 22,
          paddingTop: 8,
          borderTop: '1px solid #999',
          fontSize: '8pt',
          color: '#555',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {/* When it was produced stays on the left: a filed report is only
              as trustworthy as the moment it was run, and figures move. */}
          <span>Generated on {formatDateTime(new Date().toISOString())}</span>
          <span>Generated by Bhuiyan Industry Internal Management System</span>
        </div>
        <div style={{ marginTop: 3, textAlign: 'center', color: '#777' }}>
          {profile.name}
          {profile.tagline ? ` — ${profile.tagline}` : ''}
        </div>
      </footer>
    </>
  )
}
