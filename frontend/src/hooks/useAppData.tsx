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
import { salesService } from '@/services/api/salesService'
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

interface AppDataValue {
  data: AppData
  loading: boolean
  /** False when the browser refuses to persist (local mode) — a private window, say. */
  persistent: boolean
  update: <K extends DataSlice>(slice: K, value: AppData[K]) => void
  /** Several slices at once, as one atomic screen update. */
  updateMany: (patch: Partial<AppData>) => void
  reset: () => void
  clearTransactionalData: () => void
  exportBackup: () => string | Promise<string>
  createSale: (input: SaleInput) => Promise<{ invoiceNo: string }>
  deleteSale: (saleId: ID) => Promise<void>
  recordPayment: (input: PaymentInput) => Promise<{ reference: string }>
}

const AppDataContext = createContext<AppDataValue | null>(null)

const EMPTY: AppData = {
  products: [],
  meshSizes: [],
  unitsOfMeasure: [],
  rawMaterialImports: [],
  productionEntries: [],
  customers: [],
  sales: [],
  saleItems: [],
  customerTransactions: [],
  accounts: [],
  categories: [],
  transactions: [],
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

  const update = useCallback(<K extends DataSlice>(slice: K, value: AppData[K]) => {
    setData((current) => ({ ...current, [slice]: value }))

    const outcome = repository.save(slice, value)
    if (!outcome.ok) {
      toast.error('Saved on screen, but not stored', { description: outcome.message, duration: 9000 })
    }
  }, [])

  const updateMany = useCallback((patch: Partial<AppData>) => {
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
    }),
    [data, loading, update, updateMany, reset, clearTransactionalData, createSale, deleteSale, recordPayment],
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
    <K extends DataSlice>(slice: K, value: AppData[K]) => {
      syncSlice(slice, dataRef.current[slice], value, dataRef.current)
        .then(refresh)
        .catch((error) => {
          toast.error('Could not save', { description: errorMessage(error) })
          refresh()
        })
    },
    [refresh],
  )

  const updateMany = useCallback(
    (patch: Partial<AppData>) => {
      const current = dataRef.current
      ;(async () => {
        for (const slice of Object.keys(patch) as DataSlice[]) {
          await syncSlice(slice, current[slice], patch[slice]!, current)
        }
      })()
        .then(refresh)
        .catch((error) => {
          toast.error('Could not save', { description: errorMessage(error) })
          refresh()
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
    }),
    [data, loading, update, updateMany, reset, clearTransactionalData, createSale, deleteSale, recordPayment],
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
