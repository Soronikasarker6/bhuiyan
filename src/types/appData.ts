import type { Product, MeshSize } from './product'
import type { RawMaterialImport, WastageEntry } from './rawMaterialImport'
import type { ProductionEntry } from './production'
import type { Customer } from './customer'
import type { Sale, SaleItem } from './sale'
import type { CustomerTransaction } from './customerLedger'
import type { Account, Category, Transaction, LedgerClosing } from './ledger'

export interface AppData {
  products: Product[]
  meshSizes: MeshSize[]
  /** Raw material received from ships — gross/tare/net at the yard, priced. */
  rawMaterialImports: RawMaterialImport[]
  /** Raw material lost during processing or handling. */
  wastageEntries: WastageEntry[]
  /** Bag-wise production, mesh by mesh. */
  productionEntries: ProductionEntry[]
  customers: Customer[]
  sales: Sale[]
  saleItems: SaleItem[]
  customerTransactions: CustomerTransaction[]
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  ledgerClosings: LedgerClosing[]
  /** Set once when the sample data is laid down, so the UI can label it. */
  seeded: boolean
}
