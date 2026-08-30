import type { ISODate, MonthKey } from '@/types'

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Bangladesh groups digits in the South Asian style — 12,34,567 rather than
 * 1,234,567. A finance user reads the group boundaries before the digits, so
 * showing lakh-grouped figures in thousands-grouping makes every number need a
 * second look. `en-IN` gives the correct grouping.
 */
const GROUPED = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const GROUPED_2 = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const safe = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

/** `1234567` → `12,34,567`. Whole Taka; this system has no paisa. */
export function formatNumber(value: number | null | undefined): string {
  const n = safe(value)
  return n < 0 ? `−${GROUPED.format(Math.abs(n))}` : GROUPED.format(n)
}

/** `1234567` → `৳ 12,34,567` */
export function formatCurrency(value: number | null | undefined): string {
  return `৳ ${formatNumber(value)}`
}

/**
 * Compact form for dashboard tiles: crore and lakh, not million and billion.
 * A manager here thinks in crore; converting for them is the same discourtesy
 * as quoting an American in lakh.
 */
export function formatCompact(value: number | null | undefined): string {
  const n = safe(value)
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''

  if (abs >= 1_00_00_000) return `${sign}৳ ${(abs / 1_00_00_000).toFixed(2)} Cr`
  if (abs >= 1_00_000) return `${sign}৳ ${(abs / 1_00_000).toFixed(2)} L`
  if (abs >= 1_000) return `${sign}৳ ${GROUPED.format(Math.round(abs))}`

  return `${sign}৳ ${GROUPED.format(abs)}`
}

/** Bags are whole things. You cannot produce two thirds of a sack. */
export function formatBags(value: number | null | undefined): string {
  return formatNumber(Math.round(safe(value)))
}

/** Tons carry two decimals and no more — beyond that is false precision. */
export function formatTons(value: number | null | undefined): string {
  const n = safe(value)
  return n < 0 ? `−${GROUPED_2.format(Math.abs(n))}` : GROUPED_2.format(n)
}

export function formatPercent(value: number | null | undefined, places = 1): string {
  const n = safe(value)
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(places)}%`
}

// ---------------------------------------------------------------- dates

/** Today, as the date input wants it. Local time, not UTC — a factory in */
/** Dhaka entering an evening shift must not have it filed as tomorrow. */
export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `2026-08-30` → `30 Aug 2026`. Day first, as everyone here writes it. */
export function formatDate(iso: ISODate | null | undefined): string {
  if (!iso) return '—'

  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso

  return `${d} ${MONTHS_SHORT[m - 1]} ${y}`
}

export function formatDateLong(iso: ISODate | null | undefined): string {
  if (!iso) return '—'

  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso

  return `${d} ${MONTHS[m - 1]} ${y}`
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return `${formatDate(toISODate(date))}, ${date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** `2026-08-30` → `2026-08`. The identity of a closable month. */
export function monthKeyOf(iso: ISODate): MonthKey {
  return iso.slice(0, 7)
}

export function makeMonthKey(year: number, monthIndex: number): MonthKey {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

/** `2026-08` → `August 2026` */
export function formatMonthKey(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return `${MONTHS[m - 1]} ${y}`
}

/**
 * The last day of a month, correctly — `2026-02-31` sorts after every real
 * February date, but only by accident, and February is exactly where an
 * accident like that would be found in production.
 */
export function lastDayOfMonth(year: number, monthIndex: number): ISODate {
  return toISODate(new Date(year, monthIndex + 1, 0))
}

export function firstDayOfMonth(year: number, monthIndex: number): ISODate {
  return toISODate(new Date(year, monthIndex, 1))
}

/** Inclusive on both ends. Empty bounds mean unbounded on that side. */
export function isWithin(iso: ISODate, from?: string, to?: string): boolean {
  if (from && iso < from) return false
  if (to && iso > to) return false
  return true
}

// ---------------------------------------------------------------- misc

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Percentage change against a baseline, guarding the zero-baseline case. */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
