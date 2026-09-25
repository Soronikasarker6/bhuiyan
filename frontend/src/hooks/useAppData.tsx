import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import type { AppData, ID } from '@/types'
import { repository, type DataSlice } from '@/services/repository'
import { storageIsPersistent } from '@/services/storageService'
import { now, uid } from '@/utils/id'
import { defaultCashAccountId } from '@/utils/ledger'
import { appDataService } from '@/services/api/appDataService'
import { backupService } from '@/services/api/backupService'
import { customerService } from '@/services/api/customerService'
import { ledgerService } from '@/services/api/ledgerService'
import { salesService } from '@/services/api/salesService'
import { shipmentService, type ShipmentInput } from '@/services/api/shipmentService'
import { syncSlice } from '@/services/api/sync'
import { ApiError, onTokenChange } from '@/services/api/httpClient'

/**
 * The application's data, in one place.
 *
 * Two implementations share the one `useAppData()` hook and the one
 * `AppDataValue` shape, so every page keeps working unchanged regardless of
 * which is active:
 *
 *  - `useLocalAppData` — the original localStorage-backed store. Used only by
 *    the offline, double-clickable single-file build (`npm run build:single`,
 *    `__OFFLINE__ === true`), unchanged from before this backend existed.
 *  - `useApiAppData` — backs onto the Laravel API. `data.*` is loaded once
 *    from `GET /app-data` (shaped exactly like `AppData`, so every existing
 *    `src/utils/*.ts` derivation function keeps working against it
 *    unmodified); `update`/`updateMany` translate a full-array patch into the
 *    right REST calls by diffing (see `services/api/sync.ts`), then reload.
 *
 * `createSale` / `deleteSale` / `recordPayment` exist on both because those
 * three actions are composite, multi-row business transactions (an invoice
 * plus its ledger postings; a payment plus its optional cash-ledger entry)
 * that don't decompose into independent per-slice CRUD — everything else
 * goes through the generic `update`/`updateMany` path.
 */

export interface SaleItemInput {
  productId: ID
  meshSizeId: ID
  bags: number
  ratePerTon: number
  actualWeightTon?: number
}

export interface SaleInput {
  date: string
  customerId: ID
  truckNo?: string
  notes?: string
  paidAtSale?: number
  /** Which Cash & Bank account a "paid at sale" amount lands in — falls back to the system Cash account when omitted. */
  accountId?: ID
  items: SaleItemInput[]
}

export interface PaymentInput {
  customerId: ID
  date: string
  amount: number
  method?: string
  accountId?: ID
}

/** Everything about a payment that can change after the fact — never the customer it belongs to. */
export interface PaymentUpdateInput {
  date: string
  amount: number
  method?: string
  accountId?: ID
  /**
   * Why the correction was made. Recorded on the audit event only — it never
   * goes onto the ledger row itself, so the register stays clean (§15).
   */
  reason?: string
}

/**
 * Editing one Cash & Bank entry in place (§13). The entry keeps its id and
 * its TX- reference; nothing here says who is making the change — the backend
 * takes that from the authenticated session (§5).
 */
export interface TransactionUpdateInput {
  date: string
  details?: string
  accountId: ID
  direction: 'in' | 'out'
  /** The category *name*, matching how `Transaction.category` is stored on the frontend. */
  category: string
  amount: number
  reason?: string
}

/** Editing a transfer as the one operation it is — both legs move together (§17). */
export interface TransferUpdateInput {
  date: string
  fromAccountId: ID
  toAccountId: ID
  amount: number
  details?: string
  reason?: string
}

interface AppDataValue {
  data: AppData
  loading: boolean
  /** False when the browser refuses to persist (local mode) — a private window, say. */
  persistent: boolean
  /**
   * Resolves once the change has been persisted (and, on the API build, the
   * refetch after it) — awaitable by a caller that wants a real busy state.
   * Resolves `false` (after already toasting its own "Could not save"
   * error) rather than rejecting on failure, so a caller that ignores the
   * result behaves exactly as before; a caller that shows its own success
   * toast should check it first so it never claims success on a failed save.
   */
  update: <K extends DataSlice>(slice: K, value: AppData[K]) => Promise<boolean>
  /** Several slices at once, as one atomic screen update. */
  updateMany: (patch: Partial<AppData>) => Promise<boolean>
  reset: () => void
  clearTransactionalData: () => void
  exportBackup: () => string | Promise<string>
  createSale: (input: SaleInput) => Promise<{ invoiceNo: string }>
  deleteSale: (saleId: ID) => Promise<void>
  recordPayment: (input: PaymentInput) => Promise<{ reference: string }>
  /** Edit a Cash In already recorded — never the customer it belongs to, only when/how much/how. */
  updatePayment: (customerTransactionId: ID, input: PaymentUpdateInput) => Promise<void>
  deletePayment: (customerTransactionId: ID, reason?: string) => Promise<void>
  /**
   * Edit one Cash & Bank entry in place — the entry is updated, never deleted
   * and re-created, so its reference and every report citing it still point at
   * the same event (§13). A transfer leg takes `TransferUpdateInput` and moves
   * both legs at once (§17).
   */
  updateTransaction: (id: ID, input: TransactionUpdateInput | TransferUpdateInput) => Promise<void>
  /** Void an entry — both legs of a transfer, or both halves of a customer payment, together (§14). */
  voidTransaction: (ids: ID[], reason?: string) => Promise<void>
  /** Selects or clears one Cash Out category as a Profit & Loss "Company Cost" for one month. */
  setCompanyCostSelection: (monthKey: string, categoryId: ID, selected: boolean) => Promise<void>
  /** Replaces the whole set of selected Company Cost categories for one month in a single request. */
  setCompanyCostSelections: (monthKey: string, categoryIds: ID[]) => Promise<void>
  /** Edit a raw material import already recorded — recalculates net weight/ton and re-validates stock server-side. */
  updateRawMaterialImport: (id: ID, input: ShipmentInput) => Promise<void>
}

const AppDataContext = createContext<AppDataValue | null>(null)

const EMPTY: AppData = {
  products: [],
  meshSizes: [],
  unitsOfMeasure: [],
  rawMaterialImports: [],
  shipmentCycles: [],
  productionEntries: [],
  customers: [],
  sales: [],
  saleItems: [],
  customerTransactions: [],
  accounts: [],
  categories: [],
  transactions: [],
  companyCostSelections: [],
  wastageEntries: [],
  ledgerClosings: [],
  seeded: false,
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return undefined
}

// ---------------------------------------------------------------- local (offline build)

function useLocalAppData(): AppDataValue {
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loaded = repository.load()

    // A short, honest delay so the skeleton is seen rather than flashing.
    const timer = window.setTimeout(() => {
      setData(loaded)
      setLoading(false)
    }, 220)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!storageIsPersistent) {
      toast.warning('This browser is not saving data', {
        description:
          'Entries will work normally but will be lost when the page is reloaded. ' +
          'This usually means a private window or blocked site data.',
        duration: 10000,
      })
    }
  }, [])

  const update = useCallback(async <K extends DataSlice>(slice: K, value: AppData[K]) => {
    setData((current) => ({ ...current, [slice]: value }))

    // Local mode always applies the change to on-screen state regardless of
    // whether the browser could persist it — "not stored" is a storage
    // warning, not a failed operation, so this still resolves `true`.
    const outcome = repository.save(slice, value)
    if (!outcome.ok) {
      toast.error('Saved on screen, but not stored', { description: outcome.message, duration: 9000 })
    }
    return true
  }, [])

  const updateMany = useCallback(async (patch: Partial<AppData>) => {
    setData((current) => {
      const next = { ...current, ...patch }

      for (const slice of Object.keys(patch) as DataSlice[]) {
        const outcome = repository.save(slice, next[slice])
        if (!outcome.ok) {
          toast.error('Saved on screen, but not stored', { description: outcome.message, duration: 9000 })
          break
        }
      }

      return next
    })
    return true
  }, [])

  const reset = useCallback(() => {
    setData(repository.reset())
    toast.success('Sample data restored')
  }, [])

  const clearTransactionalData = useCallback(() => {
    setData((current) => repository.clearTransactionalData(current))
    toast.success('All entries cleared', {
      description: 'Accounts, categories and mesh sizes have been kept.',
    })
  }, [])

  // Kept close to the exact shape SalesPage/PaymentsPage always built inline,
  // just moved here so both the local and API-backed hook expose one call.
  const dataRef = useRef(data)
  dataRef.current = data

  const createSale = useCallback(
    async (input: SaleInput) => {
      const current = dataRef.current
      const stamp = now()
      const saleId = uid()
      const invoiceNo = nextInvoiceNoLocal(current.sales)

      const sale = {
        id: saleId,
        invoiceNo,
        date: input.date,
        customerId: input.customerId,
        truckNo: input.truckNo,
        notes: input.notes,
        paidAtSale: input.paidAtSale ?? 0,
        createdAt: stamp,
      }

      const items = input.items.map((item) => ({
        id: uid(),
        saleId,
        productId: item.productId,
        meshSizeId: item.meshSizeId,
        bags: item.bags,
        ratePerTon: item.ratePerTon,
        actualWeightTon: item.actualWeightTon,
      }))

      const bagKgOf = (meshSizeId: ID) => current.meshSizes.find((m) => m.id === meshSizeId)?.bagKg ?? 0
      const totalAmount = items.reduce((sum, item) => {
        const calculated = (item.bags * bagKgOf(item.meshSizeId)) / 1000
        const weightTon = item.actualWeightTon && item.actualWeightTon > 0 ? item.actualWeightTon : calculated
        return sum + weightTon * item.ratePerTon
      }, 0)

      const ledgerRows: AppData['customerTransactions'] = [
        {
          id: uid(),
          customerId: sale.customerId,
          date: sale.date,
          type: 'sale',
          reference: invoiceNo,
          description: `Sale ${invoiceNo}`,
          debit: totalAmount,
          credit: 0,
          referenceSaleId: saleId,
          createdAt: stamp,
        },
      ]

      // Real cash/bank money received, so — same as a standalone Cash In — it
      // must also land in the Cash & Bank Ledger, via one linked Transaction
      // row (never a second customer-ledger entry). Falls back to the system
      // Cash account when the form didn't send one.
      const accountId = input.accountId ?? defaultCashAccountId(current.accounts)
      const cashLedgerRows: AppData['transactions'] = []

      if (sale.paidAtSale > 0) {
        ledgerRows.push({
          id: uid(),
          customerId: sale.customerId,
          date: sale.date,
          type: 'payment',
          reference: `${invoiceNo}-PD`,
          description: `Paid at sale for ${invoiceNo}`,
          debit: 0,
          credit: sale.paidAtSale,
          referenceSaleId: saleId,
          linkedAccountId: accountId,
          createdAt: stamp,
        })

        if (accountId) {
          cashLedgerRows.push({
            id: uid(),
            date: sale.date,
            details: `Paid at sale — ${invoiceNo}`,
            accountId,
            direction: 'in',
            category: 'Payment at Sale',
            amount: sale.paidAtSale,
            referenceSaleId: saleId,
            createdAt: stamp,
          })
        }
      }

      updateMany({
        sales: [sale, ...current.sales],
        saleItems: [...current.saleItems, ...items],
        customerTransactions: [...ledgerRows, ...current.customerTransactions],
        ...(cashLedgerRows.length > 0 ? { transactions: [...cashLedgerRows, ...current.transactions] } : {}),
      })

      return { invoiceNo }
    },
    [updateMany],
  )

  const deleteSale = useCallback(
    async (saleId: ID) => {
      const current = dataRef.current
      updateMany({
        sales: current.sales.filter((s) => s.id !== saleId),
        saleItems: current.saleItems.filter((i) => i.saleId !== saleId),
        customerTransactions: current.customerTransactions.filter((t) => t.referenceSaleId !== saleId),
        // The linked Cash & Bank row a "paid at sale" amount posted, if any —
        // otherwise deleting the invoice would leave cash-in-hand overstated.
        transactions: current.transactions.filter((t) => t.referenceSaleId !== saleId),
      })
    },
    [updateMany],
  )

  const recordPayment = useCallback(
    async (input: PaymentInput) => {
      const current = dataRef.current
      const stamp = now()
      const reference = nextReferenceLocal('PAY', current.customerTransactions)

      const row = {
        id: uid(),
        customerId: input.customerId,
        date: input.date,
        type: 'payment' as const,
        reference,
        description: `Payment received — ${reference}`,
        debit: 0,
        credit: input.amount,
        linkedAccountId: input.accountId,
        method: input.method,
        createdAt: stamp,
      }

      const patch: Partial<AppData> = { customerTransactions: [row, ...current.customerTransactions] }

      if (input.accountId) {
        patch.transactions = [
          {
            id: uid(),
            date: input.date,
            details: `Cash In (${reference})`,
            accountId: input.accountId,
            direction: 'in',
            category: 'Customer Payment',
            amount: input.amount,
            // Same pairing the API build writes: this cash row *is* the
            // customer's payment, so the register can name them and the two
            // rows can be removed together rather than one being orphaned.
            customerId: input.customerId,
            customerTransactionId: row.id,
            createdAt: stamp,
          },
          ...current.transactions,
        ]
      }

      updateMany(patch)
      return { reference }
    },
    [updateMany],
  )

  const updatePayment = useCallback(
    async (transactionId: ID, input: PaymentUpdateInput) => {
      const current = dataRef.current
      const existing = current.customerTransactions.find((t) => t.id === transactionId)
      if (!existing) return

      const customerTransactions = current.customerTransactions.map((t) =>
        t.id === transactionId
          ? { ...t, date: input.date, credit: input.amount, method: input.method, linkedAccountId: input.accountId }
          : t,
      )

      // The linked Cash & Bank row, if any, is the other leg of this same
      // payment — added, updated or removed to match, never left stale or
      // orphaned, exactly as `recordPayment` writes it in the first place.
      const existingCash = current.transactions.find((t) => t.customerTransactionId === transactionId)
      let transactions = current.transactions

      if (input.accountId) {
        transactions = existingCash
          ? current.transactions.map((t) =>
              t.id === existingCash.id
                ? { ...t, date: input.date, amount: input.amount, accountId: input.accountId! }
                : t,
            )
          : [
              {
                id: uid(),
                date: input.date,
                details: `Cash In (${existing.reference})`,
                accountId: input.accountId,
                direction: 'in' as const,
                category: 'Customer Payment',
                amount: input.amount,
                customerId: existing.customerId,
                customerTransactionId: transactionId,
                createdAt: now(),
              },
              ...current.transactions,
            ]
      } else if (existingCash) {
        transactions = current.transactions.filter((t) => t.id !== existingCash.id)
      }

      updateMany({ customerTransactions, transactions })
    },
    [updateMany],
  )

  const deletePayment = useCallback(
    async (transactionId: ID) => {
      const current = dataRef.current
      updateMany({
        customerTransactions: current.customerTransactions.filter((t) => t.id !== transactionId),
        transactions: current.transactions.filter((t) => t.customerTransactionId !== transactionId),
      })
    },
    [updateMany],
  )

  /**
   * Offline mode has no audit trail (there is no server to record who did
   * what, and no second user to record it about — see `Header.tsx`'s single
   * "Office Admin" identity), so the reason is accepted and ignored here
   * rather than the two builds having different call signatures.
   */
  const updateTransaction = useCallback(
    async (id: ID, input: TransactionUpdateInput | TransferUpdateInput) => {
      const current = dataRef.current
      const existing = current.transactions.find((t) => t.id === id)
      if (!existing) return

      if (existing.transferId && 'fromAccountId' in input) {
        const legs = current.transactions.filter((t) => t.transferId === existing.transferId)
        const outId = legs.find((t) => t.direction === 'out')?.id
        const inId = legs.find((t) => t.direction === 'in')?.id

        update(
          'transactions',
          current.transactions.map((t) => {
            if (t.id === outId) {
              return { ...t, date: input.date, amount: input.amount, accountId: input.fromAccountId, details: input.details ?? t.details }
            }
            if (t.id === inId) {
              return { ...t, date: input.date, amount: input.amount, accountId: input.toAccountId, details: input.details ?? t.details }
            }
            return t
          }),
        )
        return
      }

      if ('category' in input) {
        update(
          'transactions',
          current.transactions.map((t) =>
            t.id === id
              ? {
                  ...t,
                  date: input.date,
                  details: input.details ?? '',
                  accountId: input.accountId,
                  direction: input.direction,
                  category: input.category,
                  amount: input.amount,
                }
              : t,
          ),
        )
      }
    },
    [update],
  )

  const voidTransaction = useCallback(
    async (ids: ID[]) => {
      const current = dataRef.current
      update('transactions', current.transactions.filter((t) => !ids.includes(t.id)))
    },
    [update],
  )

  const setCompanyCostSelection = useCallback(
    async (monthKey: string, categoryId: ID, selected: boolean) => {
      const current = dataRef.current
      const existing = current.companyCostSelections.find(
        (s) => s.monthKey === monthKey && s.categoryId === categoryId,
      )

      if (selected) {
        if (existing) return
        update('companyCostSelections', [
          ...current.companyCostSelections,
          { id: uid(), monthKey, categoryId },
        ])
      } else {
        if (!existing) return
        update(
          'companyCostSelections',
          current.companyCostSelections.filter((s) => s.id !== existing.id),
        )
      }
    },
    [update],
  )

  const setCompanyCostSelections = useCallback(
    async (monthKey: string, categoryIds: ID[]) => {
      const current = dataRef.current
      const keep = current.companyCostSelections.filter(
        (s) => s.monthKey !== monthKey || categoryIds.includes(s.categoryId),
      )
      const already = new Set(keep.filter((s) => s.monthKey === monthKey).map((s) => s.categoryId))
      const added = categoryIds
        .filter((categoryId) => !already.has(categoryId))
        .map((categoryId) => ({ id: uid(), monthKey, categoryId }))
      update('companyCostSelections', [...keep, ...added])
    },
    [update],
  )

  const updateRawMaterialImport = useCallback(
    async (id: ID, input: ShipmentInput) => {
      const current = dataRef.current
      update(
        'rawMaterialImports',
        current.rawMaterialImports.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                date: input.date,
                productId: input.productId,
                shipName: input.shipName?.trim() || undefined,
                serialNo: input.serialNo?.trim() || undefined,
                truckNo: input.truckNo?.trim() || undefined,
                grossWeightKg: input.grossWeightKg,
                tareWeightKg: input.tareWeightKg,
                pricePerTon: input.pricePerTon || undefined,
                notes: input.notes?.trim() || undefined,
              }
            : entry,
        ),
      )
    },
    [update],
  )

  return useMemo<AppDataValue>(
    () => ({
      data,
      loading,
      persistent: storageIsPersistent,
      update,
      updateMany,
      reset,
      clearTransactionalData,
      exportBackup: repository.exportBackup,
      createSale,
      deleteSale,
      recordPayment,
      updatePayment,
      deletePayment,
      updateTransaction,
      voidTransaction,
      setCompanyCostSelection,
      setCompanyCostSelections,
      updateRawMaterialImport,
    }),
    [
      data,
      loading,
      update,
      updateMany,
      reset,
      clearTransactionalData,
      createSale,
      deleteSale,
      recordPayment,
      updatePayment,
      deletePayment,
      updateTransaction,
      voidTransaction,
      setCompanyCostSelection,
      setCompanyCostSelections,
      updateRawMaterialImport,
    ],
  )
}

function nextInvoiceNoLocal(sales: AppData['sales']): string {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const max = sales
    .map((s) => s.invoiceNo)
    .filter((ref) => ref.startsWith(prefix))
    .map((ref) => Number(ref.slice(prefix.length)))
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0)
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

function nextReferenceLocal(prefix: string, transactions: AppData['customerTransactions']): string {
  const max = transactions
    .map((t) => t.reference)
    .filter((ref) => ref.startsWith(`${prefix}-`))
    .map((ref) => Number(ref.slice(prefix.length + 1)))
    .filter((n) => Number.isFinite(n))
    .reduce((m, n) => Math.max(m, n), 0)
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

// ---------------------------------------------------------------- API (normal build)

function useApiAppData(): AppDataValue {
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const dataRef = useRef(data)
  dataRef.current = data

  const refresh = useCallback(async () => {
    try {
      const fresh = await appDataService.fetchAll()
      setData(fresh)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        toast.error('Could not load data from the server', { description: errorMessage(error) })
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    // Re-fetch after a successful login (a fresh token) and after logout (so
    // stale data doesn't linger once RequireAuth sends the user back to
    // /login) — AppDataProvider mounts once, well before either happens.
    return onTokenChange(() => {
      setLoading(true)
      refresh()
    })
  }, [refresh])

  const update = useCallback(
    <K extends DataSlice>(slice: K, value: AppData[K]) =>
      syncSlice(slice, dataRef.current[slice], value, dataRef.current)
        .then(() => refresh().then(() => true))
        .catch((error) => {
          toast.error('Could not save', { description: errorMessage(error) })
          return refresh().then(() => false)
        }),
    [refresh],
  )

  const updateMany = useCallback(
    (patch: Partial<AppData>) => {
      const current = dataRef.current
      return (async () => {
        for (const slice of Object.keys(patch) as DataSlice[]) {
          await syncSlice(slice, current[slice], patch[slice]!, current)
        }
      })()
        .then(() => refresh().then(() => true))
        .catch((error) => {
          toast.error('Could not save', { description: errorMessage(error) })
          return refresh().then(() => false)
        })
    },
    [refresh],
  )

  const reset = useCallback(() => {
    backupService
      .reset()
      .then(() => refresh())
      .then(() => toast.success('Sample data restored'))
      .catch((error) => toast.error('Could not restore sample data', { description: errorMessage(error) }))
  }, [refresh])

  const clearTransactionalData = useCallback(() => {
    backupService
      .clearTransactionalData()
      .then(() => refresh())
      .then(() =>
        toast.success('All entries cleared', { description: 'Accounts, categories and mesh sizes have been kept.' }),
      )
      .catch((error) => toast.error('Could not clear entries', { description: errorMessage(error) }))
  }, [refresh])

  const createSale = useCallback(
    async (input: SaleInput) => {
      try {
        const result = await salesService.create(input)
        await refresh()
        return { invoiceNo: result.invoice_no }
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not record the sale.')
      }
    },
    [refresh],
  )

  const deleteSale = useCallback(
    async (saleId: ID) => {
      await salesService.remove(saleId)
      await refresh()
    },
    [refresh],
  )

  const recordPayment = useCallback(
    async (input: PaymentInput) => {
      try {
        const transaction = await customerService.recordPayment(input.customerId, {
          date: input.date,
          amount: input.amount,
          method: input.method,
          accountId: input.accountId,
        })
        await refresh()
        return { reference: transaction.reference }
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not record the payment.')
      }
    },
    [refresh],
  )

  const updatePayment = useCallback(
    async (transactionId: ID, input: PaymentUpdateInput) => {
      const existing = dataRef.current.customerTransactions.find((t) => t.id === transactionId)
      if (!existing) return

      try {
        await customerService.updatePayment(existing.customerId, transactionId, {
          ...input,
          // What this row looked like when it was loaded. The backend refuses
          // the save if someone else has changed it since (§28).
          expectedUpdatedAt: existing.updatedAt,
        })
        await refresh()
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not update the payment.')
      }
    },
    [refresh],
  )

  const deletePayment = useCallback(
    async (transactionId: ID, reason?: string) => {
      const existing = dataRef.current.customerTransactions.find((t) => t.id === transactionId)
      if (!existing) return

      try {
        await customerService.removePayment(existing.customerId, transactionId, reason)
        await refresh()
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not delete the payment.')
      }
    },
    [refresh],
  )

  const updateTransaction = useCallback(
    async (id: ID, input: TransactionUpdateInput | TransferUpdateInput) => {
      const existing = dataRef.current.transactions.find((t) => t.id === id)
      if (!existing) return

      try {
        if ('fromAccountId' in input) {
          await ledgerService.updateTransfer(id, { ...input, expectedUpdatedAt: existing.updatedAt })
        } else {
          // `category` is a name on the frontend but an id on the wire — the
          // same lookup `sync.ts` does when creating one, and for the same
          // reason: the register has only ever carried the label.
          const category =
            dataRef.current.categories.find((c) => c.name === input.category && c.direction === input.direction) ??
            dataRef.current.categories.find((c) => c.name === input.category)
          if (!category) throw new Error(`Unknown category "${input.category}"`)

          await ledgerService.updateTransaction(id, {
            date: input.date,
            details: input.details,
            accountId: input.accountId,
            direction: input.direction,
            categoryId: category.id,
            amount: input.amount,
            reason: input.reason,
            expectedUpdatedAt: existing.updatedAt,
          })
        }
        await refresh()
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not update the entry.')
      }
    },
    [refresh],
  )

  /**
   * Both legs of a transfer share one void on the backend, so only the first
   * id is sent — passing both would try to void an entry that is already gone
   * and fail the whole action.
   */
  const voidTransaction = useCallback(
    async (ids: ID[], reason?: string) => {
      if (ids.length === 0) return

      try {
        await ledgerService.removeTransaction(ids[0]!, reason)
        await refresh()
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not remove the entry.')
      }
    },
    [refresh],
  )

  const setCompanyCostSelection = useCallback(
    async (monthKey: string, categoryId: ID, selected: boolean) => {
      try {
        await ledgerService.setCompanyCostSelection(monthKey, categoryId, selected)
        await refresh()
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not update the company cost selection.')
      }
    },
    [refresh],
  )

  const setCompanyCostSelections = useCallback(
    async (monthKey: string, categoryIds: ID[]) => {
      try {
        await ledgerService.setCompanyCostSelections(monthKey, categoryIds)
        await refresh()
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not update the company cost selections.')
      }
    },
    [refresh],
  )

  const updateRawMaterialImport = useCallback(
    async (id: ID, input: ShipmentInput) => {
      try {
        await shipmentService.update(id, input)
        await refresh()
      } catch (error) {
        throw new Error(errorMessage(error) ?? 'Could not update the import entry.')
      }
    },
    [refresh],
  )

  return useMemo<AppDataValue>(
    () => ({
      data,
      loading,
      persistent: true,
      update,
      updateMany,
      reset,
      clearTransactionalData,
      exportBackup: backupService.exportBackup,
      createSale,
      deleteSale,
      recordPayment,
      updatePayment,
      deletePayment,
      updateTransaction,
      voidTransaction,
      setCompanyCostSelection,
      setCompanyCostSelections,
      updateRawMaterialImport,
    }),
    [
      data,
      loading,
      update,
      updateMany,
      reset,
      clearTransactionalData,
      createSale,
      deleteSale,
      recordPayment,
      updatePayment,
      deletePayment,
      updateTransaction,
      voidTransaction,
      setCompanyCostSelection,
      setCompanyCostSelections,
      updateRawMaterialImport,
    ],
  )
}

// ---------------------------------------------------------------- provider

function AppDataProviderImpl({ children }: { children: ReactNode }) {
  // `__OFFLINE__` is a build-time constant (see vite.config.ts) — this
  // condition is the same on every render, so calling one hook or the other
  // never violates the rules of hooks for a given build.
  const value = __OFFLINE__ ? useLocalAppData() : useApiAppData() // eslint-disable-line react-hooks/rules-of-hooks

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export const AppDataProvider = AppDataProviderImpl

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext)
  if (!value) throw new Error('useAppData must be used inside an AppDataProvider')
  return value
}
