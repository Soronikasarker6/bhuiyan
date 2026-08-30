import type { ID, ISODate, Product, ProductionEntry, ProductionRow } from '@/types'
import { productNameOf } from './products'

/**
 * Production arithmetic.
 *
 * The rule this module protects:
 *
 *     Net Weight = Gross Weight − Tare Weight
 *
 * computed through one function and **never stored** — the same principle
 * the cash ledger applies to account balances. A typed net weight is a net
 * weight that can eventually disagree with the two figures behind it; this
 * one cannot.
 */

export function netWeightKg(grossWeightKg: number, tareWeightKg: number): number {
  const gross = Number(grossWeightKg) || 0
  const tare = Number(tareWeightKg) || 0
  return Math.max(0, gross - tare)
}

export function kgToTons(kg: number): number {
  return (Number(kg) || 0) / 1000
}

export function tonsToKg(tons: number): number {
  return (Number(tons) || 0) * 1000
}

function chronological(a: ProductionEntry, b: ProductionEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : 1
}

/** Every entry, newest first, with its product name and net weight resolved. */
export function buildProductionRows(
  entries: ProductionEntry[],
  products: Product[],
): ProductionRow[] {
  return [...entries]
    .sort(chronological)
    .reverse()
    .map((entry) => {
      const net = netWeightKg(entry.grossWeightKg, entry.tareWeightKg)
      return {
        ...entry,
        productName: productNameOf(products, entry.productId),
        netWeightKg: net,
        netWeightTon: kgToTons(net),
      }
    })
}

export interface ProductionTotals {
  entryCount: number
  grossWeightKg: number
  tareWeightKg: number
  netWeightKg: number
  netWeightTon: number
}

export function productionTotals(entries: ProductionEntry[]): ProductionTotals {
  return entries.reduce<ProductionTotals>(
    (totals, entry) => {
      const net = netWeightKg(entry.grossWeightKg, entry.tareWeightKg)
      return {
        entryCount: totals.entryCount + 1,
        grossWeightKg: totals.grossWeightKg + (Number(entry.grossWeightKg) || 0),
        tareWeightKg: totals.tareWeightKg + (Number(entry.tareWeightKg) || 0),
        netWeightKg: totals.netWeightKg + net,
        netWeightTon: totals.netWeightTon + kgToTons(net),
      }
    },
    { entryCount: 0, grossWeightKg: 0, tareWeightKg: 0, netWeightKg: 0, netWeightTon: 0 },
  )
}

export function todaysProduction(entries: ProductionEntry[], today: ISODate): ProductionEntry[] {
  return entries.filter((e) => e.date === today)
}

/** Net tons produced per month for a year, for the reports/dashboard chart. */
export function monthlyProductionSeries(
  entries: ProductionEntry[],
  year: number,
): Array<{ monthIndex: number; netTon: number }> {
  const series = Array.from({ length: 12 }, (_, monthIndex) => ({ monthIndex, netTon: 0 }))

  for (const entry of entries) {
    const [y, m] = entry.date.split('-').map(Number)
    if (y !== year || !m) continue

    const bucket = series[m - 1]
    if (!bucket) continue

    bucket.netTon += kgToTons(netWeightKg(entry.grossWeightKg, entry.tareWeightKg))
  }

  return series
}

/** Net tons produced per product, biggest first — "product-wise production". */
export function productionByProduct(
  entries: ProductionEntry[],
  products: Product[],
): Array<{ productId: ID; productName: string; netTon: number; entryCount: number }> {
  const totals = new Map<ID, { netTon: number; entryCount: number }>()

  for (const entry of entries) {
    const existing = totals.get(entry.productId) ?? { netTon: 0, entryCount: 0 }
    existing.netTon += kgToTons(netWeightKg(entry.grossWeightKg, entry.tareWeightKg))
    existing.entryCount += 1
    totals.set(entry.productId, existing)
  }

  return products
    .map((product) => ({
      productId: product.id,
      productName: product.name,
      ...(totals.get(product.id) ?? { netTon: 0, entryCount: 0 }),
    }))
    .sort((a, b) => b.netTon - a.netTon)
}
