import type {
  Account,
  AppData,
  Category,
  Customer,
  MeshSize,
  Product,
  ProductionEntry,
  RawMaterialImport,
  Transaction,
  UnitOfMeasure,
  WastageEntry,
} from '@/types'
import { productService } from './productService'
import { meshSizeService } from './meshSizeService'
import { unitOfMeasureService } from './unitOfMeasureService'
import { accountService } from './accountService'
import { categoryService } from './categoryService'
import { customerService } from './customerService'
import { shipmentService } from './shipmentService'
import { wastageService } from './wastageService'
import { productionService } from './productionService'
import { ledgerService } from './ledgerService'

/**
 * Translates a full-array `update(slice, next)` / `updateMany(patch)` call —
 * the shape every page already calls — into the right REST requests, by
 * diffing against the array currently in memory. This is what lets almost
 * every page (Products, Mesh Sizes, Units, Accounts, Categories, Customers,
 * Import/Wastage/Production add-and-delete, the Ledger register, Monthly
 * Closing) keep calling `update`/`updateMany` completely unchanged.
 *
 * Composite, multi-slice business actions that don't decompose into
 * independent per-slice CRUD — creating a sale, recording a payment — are
 * NOT synced here; those slices (`sales`, `saleItems`, `customerTransactions`
 * when it comes from a sale/payment) are written by dedicated service calls
 * instead (see `useAppData.tsx`), and this module only has to avoid double
 * handling them.
 */

type WithId = { id: string }

interface Diff<T> {
  created: T[]
  updated: Array<{ before: T; after: T }>
  removed: T[]
}

function diff<T extends WithId>(current: T[], next: T[]): Diff<T> {
  const currentById = new Map(current.map((c) => [c.id, c]))
  const nextIds = new Set(next.map((n) => n.id))

  const created = next.filter((n) => !currentById.has(n.id))
  const updated = next
    .filter((n) => currentById.has(n.id))
    .map((n) => ({ before: currentById.get(n.id)!, after: n }))
    .filter(({ before, after }) => JSON.stringify(before) !== JSON.stringify(after))
  const removed = current.filter((c) => !nextIds.has(c.id))

  return { created, updated, removed }
}

interface CrudAdapter<T extends WithId> {
  create: (item: T) => Promise<unknown>
  update: (id: string, item: T) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
}

function simple<T extends WithId>(adapter: CrudAdapter<T>) {
  return async (current: T[], next: T[]) => {
    const { created, updated, removed } = diff(current, next)
    for (const item of created) await adapter.create(item)
    for (const { after } of updated) await adapter.update(after.id, after)
    for (const item of removed) await adapter.remove(item.id)
  }
}

function createOnly<T extends WithId>(create: (item: T) => Promise<unknown>, remove: (id: string) => Promise<unknown>) {
  return async (current: T[], next: T[]) => {
    const { created, removed } = diff(current, next)
    for (const item of created) await create(item)
    for (const item of removed) await remove(item.id)
  }
}

const syncProducts = simple<Product>({
  create: (p) => productService.create(p),
  update: (id, p) => productService.update(id, p),
  remove: (id) => productService.remove(id),
})

const syncMeshSizes = simple<MeshSize>({
  create: (m) => meshSizeService.create(m),
  update: (id, m) => meshSizeService.update(id, m),
  remove: (id) => meshSizeService.remove(id),
})

const syncUnitsOfMeasure = simple<UnitOfMeasure>({
  create: (u) => unitOfMeasureService.create(u.name),
  update: (id, u) => unitOfMeasureService.update(id, u.name),
  remove: (id) => unitOfMeasureService.remove(id),
})

const syncAccounts = simple<Account>({
  create: (a) => accountService.create(a.name, a.kind),
  update: (id, a) => accountService.update(id, a.name, a.kind),
  remove: (id) => accountService.remove(id),
})

const syncCategories = simple<Category>({
  create: (c) => categoryService.create(c.name, c.direction),
  update: (id, c) => categoryService.update(id, c.name, c.direction),
  remove: (id) => categoryService.remove(id),
})

const syncCustomers = simple<Customer>({
  create: (c) => customerService.create(c),
  update: (id, c) => customerService.update(id, c),
  remove: (id) => customerService.remove(id),
})

const syncWastageEntries = createOnly<WastageEntry>(
  (w) => wastageService.create({ date: w.date, productId: w.productId, quantityKg: w.quantityKg, reason: w.reason }),
  (id) => wastageService.remove(id),
)

const syncProductionEntries = createOnly<ProductionEntry>(
  (p) => productionService.create({ date: p.date, productId: p.productId, meshId: p.meshId, bags: p.bags, notes: p.notes }),
  (id) => productionService.remove(id),
)

/** A shipment "update" is either a regular field edit, or a close/reopen — told apart by what changed. */
async function syncRawMaterialImports(current: RawMaterialImport[], next: RawMaterialImport[]): Promise<void> {
  const { created, updated, removed } = diff(current, next)

  for (const item of created) {
    await shipmentService.create({
      date: item.date,
      productId: item.productId,
      shipName: item.shipName,
      serialNo: item.serialNo,
      truckNo: item.truckNo,
      grossWeightKg: item.grossWeightKg,
      tareWeightKg: item.tareWeightKg,
      pricePerTon: item.pricePerTon,
      notes: item.notes,
    })
  }

  for (const { before, after } of updated) {
    if (after.status === 'closed' && before.status !== 'closed') {
      await shipmentService.close(after.id)
    } else if (after.status !== 'closed' && before.status === 'closed') {
      await shipmentService.reopen(after.id)
    } else {
      await shipmentService.update(after.id, {
        date: after.date,
        productId: after.productId,
        shipName: after.shipName,
        serialNo: after.serialNo,
        truckNo: after.truckNo,
        grossWeightKg: after.grossWeightKg,
        tareWeightKg: after.tareWeightKg,
        pricePerTon: after.pricePerTon,
        notes: after.notes,
      })
    }
  }

  for (const item of removed) await shipmentService.remove(item.id)
}

/** A transfer is two rows sharing `transferId` — grouped so it becomes one API call, not two. */
async function syncTransactions(
  current: Transaction[],
  next: Transaction[],
  categories: Category[],
): Promise<void> {
  const { created, removed } = diff(current, next)

  const transferGroups = new Map<string, Transaction[]>()
  const singles: Transaction[] = []
  for (const t of created) {
    if (t.transferId) {
      transferGroups.set(t.transferId, [...(transferGroups.get(t.transferId) ?? []), t])
    } else {
      singles.push(t)
    }
  }

  for (const legs of transferGroups.values()) {
    const out = legs.find((l) => l.direction === 'out')
    const inLeg = legs.find((l) => l.direction === 'in')
    if (out && inLeg) {
      await ledgerService.transfer({
        date: out.date,
        fromAccountId: out.accountId,
        toAccountId: inLeg.accountId,
        amount: out.amount,
        details: out.details,
      })
    }
  }

  for (const t of singles) {
    const category =
      categories.find((c) => c.name === t.category && c.direction === t.direction) ??
      categories.find((c) => c.name === t.category)
    if (!category) throw new Error(`Unknown category "${t.category}"`)

    await ledgerService.createTransaction({
      date: t.date,
      details: t.details,
      accountId: t.accountId,
      direction: t.direction,
      categoryId: category.id,
      amount: t.amount,
    })
  }

  const handledTransferIds = new Set<string>()
  for (const t of removed) {
    if (t.transferId) {
      if (handledTransferIds.has(t.transferId)) continue
      handledTransferIds.add(t.transferId)
    }
    await ledgerService.removeTransaction(t.id)
  }
}

async function syncLedgerClosings(current: AppData['ledgerClosings'], next: AppData['ledgerClosings']): Promise<void> {
  const { created, removed } = diff(current, next)
  for (const item of created) await ledgerService.closeMonth(item.monthKey)
  for (const item of removed) await ledgerService.reopenMonth(item.id)
}

/**
 * Applies one slice's change. `customerTransactions`, `saleItems` and `sales`
 * have no entry here on purpose — they only ever change as a side effect of
 * a dedicated service call (createSale, recordPayment, ...), never through
 * this generic path, so a patch that happens to include them (e.g. Customers
 * page also passing an opening-balance transaction) is a harmless no-op here.
 */
export async function syncSlice<K extends keyof AppData>(
  slice: K,
  current: AppData[K],
  next: AppData[K],
  data: AppData,
): Promise<void> {
  switch (slice) {
    case 'products':
      return syncProducts(current as Product[], next as Product[])
    case 'meshSizes':
      return syncMeshSizes(current as MeshSize[], next as MeshSize[])
    case 'unitsOfMeasure':
      return syncUnitsOfMeasure(current as UnitOfMeasure[], next as UnitOfMeasure[])
    case 'accounts':
      return syncAccounts(current as Account[], next as Account[])
    case 'categories':
      return syncCategories(current as Category[], next as Category[])
    case 'customers':
      return syncCustomers(current as Customer[], next as Customer[])
    case 'wastageEntries':
      return syncWastageEntries(current as WastageEntry[], next as WastageEntry[])
    case 'productionEntries':
      return syncProductionEntries(current as ProductionEntry[], next as ProductionEntry[])
    case 'rawMaterialImports':
      return syncRawMaterialImports(current as RawMaterialImport[], next as RawMaterialImport[])
    case 'transactions':
      return syncTransactions(current as Transaction[], next as Transaction[], data.categories)
    case 'ledgerClosings':
      return syncLedgerClosings(current as AppData['ledgerClosings'], next as AppData['ledgerClosings'])
    default:
      return undefined
  }
}
