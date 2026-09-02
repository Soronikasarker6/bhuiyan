import type { AppData } from '@/types'
import { storageService } from './storageService'
import { seedData } from '@/data/seed'

/**
 * The domain's view of persistence.
 *
 * Components call `repository.load()` and `repository.save()`. They do not
 * know a key name, and they do not know that the store is currently a browser
 * rather than a server. When this becomes a REST API, the two functions below
 * become two `fetch` calls and nothing else in the application changes.
 *
 * Each slice is stored under its own key rather than as one blob, so a write
 * to one table cannot corrupt another, and a future endpoint can be
 * introduced one slice at a time.
 *
 * `rawMaterialImports` keeps the storage key `'production-entries'` even
 * though the field was renamed — it used to be the app's only production
 * concept, and changing the key would orphan anyone's already-saved import
 * history the moment this ships. The new bag-wise `productionEntries` gets
 * its own fresh key, `'mesh-production-entries'`, and starts empty.
 */

const KEYS = {
  products: 'products',
  meshSizes: 'mesh-sizes',
  rawMaterialImports: 'production-entries',
  productionEntries: 'mesh-production-entries',
  customers: 'customers',
  sales: 'sales',
  saleItems: 'sale-items',
  customerTransactions: 'customer-transactions',
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  pnl: 'pnl',
  ledgerClosings: 'ledger-closings',
  seeded: 'seeded',
} as const satisfies Record<keyof AppData, string>

export type DataSlice = keyof AppData

export const repository = {
  /**
   * Read everything.
   *
   * A first run gets the sample data, so nobody meets an empty system with no
   * idea what it is for. `seeded` records that it happened, which is what lets
   * the UI label the demo rows honestly and what stops the sample data being
   * laid down again over real entries after someone clears one table.
   */
  load(): AppData {
    const seeded = storageService.get<boolean>(KEYS.seeded) ?? false

    if (!seeded) {
      const sample = seedData()
      repository.saveAll(sample)
      return sample
    }

    const fallback = seedData()

    return {
      products: storageService.get(KEYS.products) ?? fallback.products,
      meshSizes: storageService.get(KEYS.meshSizes) ?? fallback.meshSizes,
      rawMaterialImports: storageService.get(KEYS.rawMaterialImports) ?? [],
      productionEntries: storageService.get(KEYS.productionEntries) ?? [],
      customers: storageService.get(KEYS.customers) ?? [],
      sales: storageService.get(KEYS.sales) ?? [],
      saleItems: storageService.get(KEYS.saleItems) ?? [],
      customerTransactions: storageService.get(KEYS.customerTransactions) ?? [],
      accounts: storageService.get(KEYS.accounts) ?? fallback.accounts,
      categories: storageService.get(KEYS.categories) ?? fallback.categories,
      transactions: storageService.get(KEYS.transactions) ?? [],
      pnl: storageService.get(KEYS.pnl) ?? fallback.pnl,
      ledgerClosings: storageService.get(KEYS.ledgerClosings) ?? [],
      seeded: true,
    }
  },

  /** Write one slice. Returns the storage outcome so the UI can react. */
  save<K extends DataSlice>(slice: K, value: AppData[K]) {
    return storageService.set(KEYS[slice], value)
  },

  saveAll(data: AppData) {
    ;(Object.keys(KEYS) as DataSlice[]).forEach((slice) => {
      storageService.set(KEYS[slice], data[slice])
    })
    storageService.set(KEYS.seeded, true)
  },

  /** Wipe everything and lay the sample data down again. */
  reset(): AppData {
    const sample = seedData()
    repository.saveAll(sample)
    return sample
  },

  /** Clear the demo rows but keep the configuration the company set up. */
  clearTransactionalData(current: AppData): AppData {
    const cleared: AppData = {
      ...current,
      rawMaterialImports: [],
      productionEntries: [],
      sales: [],
      saleItems: [],
      customerTransactions: [],
      transactions: [],
      ledgerClosings: [],
      pnl: current.pnl.map((year) => ({
        ...year,
        months: year.months.map((month) => ({
          monthIndex: month.monthIndex,
          sales: 0,
          materialCost: 0,
          labourCost: 0,
          electricity: 0,
          freight: 0,
          transport: 0,
          handling: 0,
          otherCosts: 0,
          officeAdmin: 0,
          rent: 0,
          interest: 0,
        })),
      })),
    }

    repository.saveAll(cleared)
    return cleared
  },

  exportBackup(): string {
    return JSON.stringify(
      { exportedAt: new Date().toISOString(), data: storageService.exportAll() },
      null,
      2,
    )
  },
}
