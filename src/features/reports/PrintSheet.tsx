import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { formatDateTime, todayISO, formatDateLong } from '@/utils/format'

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
 * The printed document.
 *
 * Hidden on screen, visible on paper. Black on white with real rules — the
 * screen's cream and maroon cost ink and reproduce badly on an office laser.
 */
function PrintSheet({ payload }: { payload: PrintPayload }) {
  return (
    <div className="print-sheet hidden" aria-hidden>
      <header style={{ borderBottom: '2px solid #111', paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontSize: '17pt', fontWeight: 700, margin: 0, letterSpacing: '0.02em' }}>
              BHUIYAN INDUSTRY
            </h1>
            <p style={{ fontSize: '8.5pt', margin: '2px 0 0', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Limestone Production &amp; Sales Management
            </p>
          </div>
          <p style={{ fontSize: '8.5pt', margin: 0, textAlign: 'right' }}>
            {formatDateLong(todayISO())}
          </p>
        </div>
      </header>

      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: '12.5pt', fontWeight: 700, margin: 0 }}>{payload.title}</h2>
        {payload.subtitle && (
          <p style={{ fontSize: '9.5pt', margin: '3px 0 0', color: '#333' }}>{payload.subtitle}</p>
        )}

        {payload.meta && payload.meta.length > 0 && (
          <table style={{ border: 'none', marginTop: 8, fontSize: '9pt' }}>
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

      <table>
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
          {payload.rows.map((row, index) => (
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

          {payload.rows.length === 0 && (
            <tr>
              <td colSpan={payload.columns.length} style={{ textAlign: 'center', color: '#666' }}>
                No records for this selection.
              </td>
            </tr>
          )}
        </tbody>

        {payload.totals && (
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
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>Generated on {formatDateTime(new Date().toISOString())}</span>
        <span>BHUIYAN INDUSTRY · Internal Management System</span>
      </footer>
    </div>
  )
}
