import type { Product, MeshSize } from './product'
import type { UnitOfMeasure } from './unitOfMeasure'
import type { RawMaterialImport, ShipmentCycle, WastageEntry } from './rawMaterialImport'
import type { ProductionEntry } from './production'
import type { Customer } from './customer'
import type { Sale, SaleItem } from './sale'
import type { CustomerTransaction } from './customerLedger'
import type { Account, Category, CompanyCostSelection, Transaction, LedgerClosing } from './ledger'

export interface AppData {
  products: Product[]
  meshSizes: MeshSize[]
  /** The units a product can be sold/counted in — Ton, KG, Bag, … */
  unitsOfMeasure: UnitOfMeasure[]
  /** Raw material received from ships — gross/tare/net at the yard, priced. */
  rawMaterialImports: RawMaterialImport[]
  /** Each raw material's open/closed inventory cycles — see `RawMaterialImport.shipmentId`. */
  shipmentCycles: ShipmentCycle[]
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
  /** Which Cash Out categories count toward Profit & Loss's "Company Costs", per month. */
  companyCostSelections: CompanyCostSelection[]
  ledgerClosings: LedgerClosing[]
  /** Set once when the sample data is laid down, so the UI can label it. */
  seeded: boolean
}
