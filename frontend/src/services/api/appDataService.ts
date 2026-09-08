import type { AppData } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapTransactions } from './mappers'

/** The bootstrap call — every collection in one round trip, shaped like `AppData`. */
export const appDataService = {
  async fetchAll(): Promise<AppData> {
    const raw = await http.get<Record<string, unknown>>('/app-data')

    return {
      products: mapEntities(raw.products),
      meshSizes: mapEntities(raw.meshSizes),
      unitsOfMeasure: mapEntities(raw.unitsOfMeasure),
      rawMaterialImports: mapEntities(raw.rawMaterialImports),
      wastageEntries: mapEntities(raw.wastageEntries),
      productionEntries: mapEntities(raw.productionEntries),
      customers: mapEntities(raw.customers),
      sales: mapEntities(raw.sales),
      saleItems: mapEntities(raw.saleItems),
      customerTransactions: mapEntities(raw.customerTransactions),
      accounts: mapEntities(raw.accounts),
      categories: mapEntities(raw.categories),
      transactions: mapTransactions(raw.transactions),
      ledgerClosings: mapEntities(raw.ledgerClosings),
      seeded: true,
    } as AppData
  },
}
