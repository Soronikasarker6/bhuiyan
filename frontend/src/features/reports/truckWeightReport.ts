import type { SaleType } from '@/types'
import type { PrintColumn, PrintPayload } from '@/features/reports/PrintSheet'
import { SALE_TYPE_LABEL, truckWeightTotals, type TruckWeightRow } from '@/utils/sales'
import { formatDate, formatNumber, formatTons } from '@/utils/format'

/**
 * The one truck-weight report layout — shared by the Truck-wise Sales report
 * (both sale types, with the Sale Type filter) and the Raw Material Sales
 * report (raw only, plus confidential Rate/Amount for permitted users), so
 * neither keeps its own columns, cells or totals rule.
 *
 * The payload is what the screen preview, the PDF print and the CSV export all
 * render, so an export always matches the report as filtered.
 *
 * No amounts by default — this is a weight report. Missing gross/tare/net
 * show "—", never 0.
 */

const DASH = '—'
const kg = (value: number | undefined) => (value === undefined ? DASH : formatNumber(value))
const ton = (value: number | undefined) => (value === undefined ? DASH : formatTons(value))

export const TRUCK_WEIGHT_COLUMNS: PrintColumn[] = [
  { key: 'date', label: 'Date' },
  { key: 'invoice', label: 'Invoice / Sale No' },
  { key: 'customer', label: 'Customer' },
  { key: 'truck', label: 'Truck No' },
  { key: 'type', label: 'Sale Type' },
  { key: 'product', label: 'Product / Material' },
  { key: 'gross', label: 'Gross Weight (KG)', align: 'right' },
  { key: 'tare', label: 'Tare Weight (KG)', align: 'right' },
  { key: 'netKg', label: 'Net Weight (KG)', align: 'right' },
  { key: 'netTon', label: 'Net Weight (TON)', align: 'right' },
]

export function truckWeightCells(row: TruckWeightRow): Record<string, string> {
  return {
    date: formatDate(row.date),
    invoice: row.reversed ? `${row.invoiceNo} (Reversed)` : row.invoiceNo,
    customer: row.customerName,
    truck: row.truckNo ?? DASH,
    type: SALE_TYPE_LABEL[row.saleType],
    product: row.productLabel,
    gross: kg(row.weights.grossKg),
    tare: kg(row.weights.tareKg),
    netKg: kg(row.weights.netKg),
    netTon: ton(row.weights.netTon),
  }
}

export function truckWeightReportPayload({
  title,
  subtitle,
  rows,
  saleType,
  extraColumns = [],
  extraCells,
  extraTotals,
}: {
  title: string
  subtitle: string
  rows: TruckWeightRow[]
  /** The active Sale Type filter — stated on the report so a printed or exported copy says what it covers. */
  saleType?: SaleType
  extraColumns?: PrintColumn[]
  extraCells?: (row: TruckWeightRow) => Record<string, string>
  extraTotals?: Record<string, string>
}): PrintPayload {
  const totals = truckWeightTotals(rows)

  return {
    title,
    subtitle,
    meta: [
      { label: 'Sale type', value: saleType ? `${SALE_TYPE_LABEL[saleType]} sales` : 'All sales' },
      { label: 'Sales', value: String(totals.rowCount) },
      { label: 'Total net weight', value: totals.netTon === undefined ? DASH : `${formatTons(totals.netTon)} Ton` },
    ],
    columns: [...TRUCK_WEIGHT_COLUMNS, ...extraColumns],
    rows: rows.map((row) => ({ ...truckWeightCells(row), ...(extraCells?.(row) ?? {}) })),
    totals: {
      date: `Total (${totals.rowCount})`,
      gross: kg(totals.grossKg),
      tare: kg(totals.tareKg),
      netKg: kg(totals.netKg),
      netTon: ton(totals.netTon),
      ...(extraTotals ?? {}),
    },
    footnote:
      totals.weighedCount < totals.rowCount
        ? `Weight totals cover the ${totals.weighedCount} of ${totals.rowCount} sales with a complete weighbridge slip (gross and tare). ` +
          'Sales recorded without one show "—" and are not counted as zero. Net weight is the weighbridge figure; billing uses each line\'s billable ton.'
        : "Net weight is the weighbridge figure; billing uses each line's billable ton.",
  }
}
