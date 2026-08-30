import type { Product, ProductionEntry, ProductStock, SaleItem } from '@/types'
import { kgToTons, netWeightKg } from './production'

/**
 * Available stock, per product.
 *
 *     Available = Produced (net tons) − Sold (tons)
 *
 * Unlike the old bag ledger this replaces, production is not a sequential
 * pile that sales draw down in order — it is a pool. So this needs no
 * running-balance walk and no "previous stock" carried entry to entry: it is
 * simply the two totals, computed fresh from the production and sales logs
 * every time. That is also what keeps it correct without a month-end
 * snapshot — there is nothing here that can drift.
 */
export function productStock(
  products: Product[],
  productionEntries: ProductionEntry[],
  saleItems: SaleItem[],
): ProductStock[] {
  return products.map((product) => {
    const producedTon = productionEntries
      .filter((e) => e.productId === product.id)
      .reduce((sum, e) => sum + kgToTons(netWeightKg(e.grossWeightKg, e.tareWeightKg)), 0)

    const soldTon = saleItems
      .filter((i) => i.productId === product.id)
      .reduce((sum, i) => sum + (Number(i.weightTon) || 0), 0)

    return {
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      producedTon,
      soldTon,
      availableTon: producedTon - soldTon,
    }
  })
}

export interface StockTotals {
  producedTon: number
  soldTon: number
  availableTon: number
}

export function totalStock(stocks: ProductStock[]): StockTotals {
  return stocks.reduce(
    (totals, s) => ({
      producedTon: totals.producedTon + s.producedTon,
      soldTon: totals.soldTon + s.soldTon,
      availableTon: totals.availableTon + s.availableTon,
    }),
    { producedTon: 0, soldTon: 0, availableTon: 0 },
  )
}
