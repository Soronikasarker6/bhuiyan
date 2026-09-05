import type { ID, Product, ProductionEntry, RawMaterialImport, RawMaterialStock, WastageEntry, WastageRow } from '@/types'
import { productNameOf } from './products'
import { kgToTons, netWeightKg } from './imports'

/**
 * Raw material costing — a separate, weight-based stock from the mesh/bag
 * stock in `utils/productionStock.ts`. That one answers "how many bags of
 * 250 do we have"; this one answers "what did the limestone actually cost",
 * which is what turns Sales revenue into a real Net Profit.
 *
 *     Available Raw Material (Ton) = Imported − Wastage − Produced into bags
 *
 * Sales never touches this directly — a sale draws down bagged mesh stock,
 * and bagging is what consumes raw material, so routing production through
 * both keeps them consistent without duplicating the deduction.
 */

/**
 * The weighted average cost of one ton of a product's raw material, across
 * every priced import — the number §6's cost-of-goods-sold calculation
 * multiplies tons sold by. Unpriced imports (no `pricePerTon` entered) are
 * excluded rather than treated as free.
 */
export function averageCostPerTon(productId: ID, imports: RawMaterialImport[]): number | undefined {
  const priced = imports.filter((i) => i.productId === productId && (Number(i.pricePerTon) || 0) > 0)
  if (priced.length === 0) return undefined

  let weightedCost = 0
  let totalTon = 0

  for (const entry of priced) {
    const ton = kgToTons(netWeightKg(entry.grossWeightKg, entry.tareWeightKg))
    weightedCost += ton * (Number(entry.pricePerTon) || 0)
    totalTon += ton
  }

  return totalTon > 0 ? weightedCost / totalTon : undefined
}

function importedTonOf(productId: ID, imports: RawMaterialImport[]): number {
  return imports
    .filter((i) => i.productId === productId)
    .reduce((sum, i) => sum + kgToTons(netWeightKg(i.grossWeightKg, i.tareWeightKg)), 0)
}

function wastageTonOf(productId: ID, wastage: WastageEntry[]): number {
  return wastage
    .filter((w) => w.productId === productId)
    .reduce((sum, w) => sum + kgToTons(Number(w.quantityKg) || 0), 0)
}

function producedTonOf(productId: ID, productionEntries: ProductionEntry[], bagKgOf: (meshId: ID) => number): number {
  return productionEntries
    .filter((e) => e.productId === productId)
    .reduce((sum, e) => sum + kgToTons((Number(e.bags) || 0) * bagKgOf(e.meshId)), 0)
}

export function rawMaterialStock(
  productId: ID,
  products: Product[],
  imports: RawMaterialImport[],
  wastage: WastageEntry[],
  productionEntries: ProductionEntry[],
  bagKgOf: (meshId: ID) => number,
): RawMaterialStock {
  const importedTon = importedTonOf(productId, imports)
  const wastageTon = wastageTonOf(productId, wastage)
  const producedTon = producedTonOf(productId, productionEntries, bagKgOf)

  return {
    productId,
    productName: productNameOf(products, productId),
    importedTon,
    wastageTon,
    producedTon,
    availableTon: importedTon - wastageTon - producedTon,
    averageCostPerTon: averageCostPerTon(productId, imports),
  }
}

export function allRawMaterialStock(
  products: Product[],
  imports: RawMaterialImport[],
  wastage: WastageEntry[],
  productionEntries: ProductionEntry[],
  bagKgOf: (meshId: ID) => number,
): RawMaterialStock[] {
  return products.map((p) => rawMaterialStock(p.id, products, imports, wastage, productionEntries, bagKgOf))
}

// ---------------------------------------------------------------- wastage

function chronological(a: WastageEntry, b: WastageEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : 1
}

/** Every wastage entry, newest first, with its product name and tons resolved. */
export function buildWastageRows(entries: WastageEntry[], products: Product[]): WastageRow[] {
  return [...entries]
    .sort(chronological)
    .reverse()
    .map((entry) => ({
      ...entry,
      productName: productNameOf(products, entry.productId),
      quantityTon: kgToTons(entry.quantityKg),
    }))
}

export function wastageTotals(entries: WastageEntry[]): { entryCount: number; quantityKg: number; quantityTon: number } {
  return entries.reduce(
    (totals, e) => ({
      entryCount: totals.entryCount + 1,
      quantityKg: totals.quantityKg + (Number(e.quantityKg) || 0),
      quantityTon: totals.quantityTon + kgToTons(Number(e.quantityKg) || 0),
    }),
    { entryCount: 0, quantityKg: 0, quantityTon: 0 },
  )
}
