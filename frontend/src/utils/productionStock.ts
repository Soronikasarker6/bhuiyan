import type {
  ID,
  ISODate,
  MeshSize,
  MeshStock,
  Product,
  ProductionEntry,
  Sale,
  SaleItem,
  StockLedgerRow,
} from '@/types'
import { activeMeshSizes } from './products'
import { kgToTons } from './imports'

/**
 * Production & stock — mesh by mesh, bag by bag.
 *
 * The rule this module protects:
 *
 *     Stock in Hand = Previous Stock + Today's Production − Today's Sell
 *
 * with **previous stock never typed by anyone** — it is always the prior
 * day's stock-in-hand, recomputed from the entries themselves, so it cannot
 * drift and a back-dated entry correctly flows through to every later row.
 * "Today's Sell" is never typed either: it is read from actual `SaleItem`s
 * for that date, which is what makes a sale's effect on stock automatic
 * rather than a second figure someone has to remember to update.
 */

export function bagsToKg(bags: number, bagKg: number): number {
  return (Number(bags) || 0) * (Number(bagKg) || 0)
}

function chronological(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** Every production bag and every sold bag for one (product, mesh), bucketed by date. */
function dailyBuckets(
  productId: ID,
  meshId: ID,
  productionEntries: ProductionEntry[],
  saleItems: SaleItem[],
  sales: Sale[],
) {
  const producedByDate = new Map<ISODate, number>()
  for (const entry of productionEntries) {
    if (entry.productId !== productId || entry.meshId !== meshId) continue
    producedByDate.set(entry.date, (producedByDate.get(entry.date) ?? 0) + (Number(entry.bags) || 0))
  }

  const saleDateOf = new Map(sales.map((s) => [s.id, s.date]))
  const soldByDate = new Map<ISODate, number>()
  for (const item of saleItems) {
    if (item.productId !== productId || item.meshSizeId !== meshId) continue
    const date = saleDateOf.get(item.saleId)
    if (!date) continue
    soldByDate.set(date, (soldByDate.get(date) ?? 0) + (Number(item.bags) || 0))
  }

  const dates = [...new Set([...producedByDate.keys(), ...soldByDate.keys()])].sort(chronological)
  return { producedByDate, soldByDate, dates }
}

/**
 * The §4 stock ledger for one (product, mesh) — newest first, the same
 * convention every other register in this app uses.
 */
export function buildStockLedger(
  productId: ID,
  meshId: ID,
  productionEntries: ProductionEntry[],
  saleItems: SaleItem[],
  sales: Sale[],
): { rows: StockLedgerRow[]; currentStockBags: number } {
  const { producedByDate, soldByDate, dates } = dailyBuckets(productId, meshId, productionEntries, saleItems, sales)

  let running = 0

  const rows: StockLedgerRow[] = dates.map((date) => {
    const previousStockBags = running
    const productionBags = producedByDate.get(date) ?? 0
    const totalProductionBags = previousStockBags + productionBags
    const sellBags = soldByDate.get(date) ?? 0
    const stockBags = totalProductionBags - sellBags

    running = stockBags

    return { date, productId, meshId, previousStockBags, productionBags, totalProductionBags, sellBags, stockBags }
  })

  return { rows: rows.reverse(), currentStockBags: running }
}

/**
 * Available stock right now, in bags — the single function both the sale
 * form's live validation and the stock-summary cards call, so a sale can
 * never be accepted against a number the stock card itself disagrees with.
 */
export function availableBags(
  productId: ID,
  meshId: ID,
  productionEntries: ProductionEntry[],
  saleItems: SaleItem[],
  sales: Sale[],
): number {
  return buildStockLedger(productId, meshId, productionEntries, saleItems, sales).currentStockBags
}

/** The §9 per-mesh breakdown for one product. */
export function meshStockSummary(
  productId: ID,
  meshSizes: MeshSize[],
  productionEntries: ProductionEntry[],
  saleItems: SaleItem[],
  sales: Sale[],
): MeshStock[] {
  return activeMeshSizes(meshSizes).map((mesh) => {
    const stockBags = availableBags(productId, mesh.id, productionEntries, saleItems, sales)
    const stockKg = bagsToKg(stockBags, mesh.bagKg)

    return {
      meshId: mesh.id,
      meshName: mesh.name,
      bagKg: mesh.bagKg,
      stockBags,
      stockKg,
      stockTon: kgToTons(stockKg),
    }
  })
}

export interface ProductMeshStock extends MeshStock {
  productId: ID
  productName: string
}

/** Stock for every active product × active mesh combination — the dashboard/report view across everything. */
export function allMeshStock(
  products: Product[],
  meshSizes: MeshSize[],
  productionEntries: ProductionEntry[],
  saleItems: SaleItem[],
  sales: Sale[],
): ProductMeshStock[] {
  const rows: ProductMeshStock[] = []

  for (const product of products) {
    for (const mesh of meshStockSummary(product.id, meshSizes, productionEntries, saleItems, sales)) {
      rows.push({ ...mesh, productId: product.id, productName: product.name })
    }
  }

  return rows
}

export function totalStockTon(rows: ProductMeshStock[] | MeshStock[]): number {
  return rows.reduce((sum, r) => sum + r.stockTon, 0)
}

export function totalStockBags(rows: ProductMeshStock[] | MeshStock[]): number {
  return rows.reduce((sum, r) => sum + r.stockBags, 0)
}

// ---------------------------------------------------------------- aggregates

export function todaysProductionBags(entries: ProductionEntry[], today: ISODate, productId?: ID): number {
  return entries
    .filter((e) => e.date === today && (!productId || e.productId === productId))
    .reduce((sum, e) => sum + (Number(e.bags) || 0), 0)
}

export function totalProductionBags(entries: ProductionEntry[], productId?: ID): number {
  return entries
    .filter((e) => !productId || e.productId === productId)
    .reduce((sum, e) => sum + (Number(e.bags) || 0), 0)
}

export function todaysSoldBags(
  saleItems: SaleItem[],
  sales: Sale[],
  today: ISODate,
  productId?: ID,
): number {
  const saleDateOf = new Map(sales.map((s) => [s.id, s.date]))
  return saleItems
    .filter((i) => saleDateOf.get(i.saleId) === today && (!productId || i.productId === productId))
    .reduce((sum, i) => sum + (Number(i.bags) || 0), 0)
}

/** Bags produced per mesh, per date, for one product — the raw rows behind the §4 table. */
export function productionRowsForProduct(
  productId: ID,
  entries: ProductionEntry[],
): ProductionEntry[] {
  return entries
    .filter((e) => e.productId === productId)
    .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1))
}
