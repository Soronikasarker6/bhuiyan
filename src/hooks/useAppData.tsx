import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { toast } from 'sonner'
import type { AppData } from '@/types'
import { repository, type DataSlice } from '@/services/repository'
import { storageIsPersistent } from '@/services/storageService'

/**
 * The application's data, in one place.
 *
 * The ordering rule this provider exists to enforce: **state updates first,
 * persistence second**. A new entry appears in the table the instant it is
 * saved, whether or not the write to storage succeeds — and if the write
 * fails, the user is told plainly that the row is on screen but not saved,
 * rather than discovering it after a reload. A system that silently loses a
 * day's entries is worse than one that admits it cannot save.
 */

interface AppDataValue {
  data: AppData
  loading: boolean
  /** False when the browser refuses to persist — a private window, say. */
  persistent: boolean
  update: <K extends DataSlice>(slice: K, value: AppData[K]) => void
  /** Several slices at once, as one atomic screen update. */
  updateMany: (patch: Partial<AppData>) => void
  reset: () => void
  clearTransactionalData: () => void
  exportBackup: () => string
}

const AppDataContext = createContext<AppDataValue | null>(null)

const EMPTY: AppData = {
  products: [],
  meshSizes: [],
  productionEntries: [],
  customers: [],
  sales: [],
  saleItems: [],
  customerTransactions: [],
  accounts: [],
  categories: [],
  transactions: [],
  pnl: [],
  ledgerClosings: [],
  seeded: false,
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY)
  const [loading, setLoading] = useState(true)

  // Load once. The skeletons the pages show during this are not decoration —
  // they are what stops the layout jumping when the data lands.
  useEffect(() => {
    const loaded = repository.load()

    // A short, honest delay so the skeleton is seen rather than flashing.
    // Reading localStorage is instantaneous; a 0ms transition reads as a
    // flicker, which looks like a bug.
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
    // Screen first.
    setData((current) => ({ ...current, [slice]: value }))

    // Storage second, and loudly if it fails.
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
          toast.error('Saved on screen, but not stored', {
            description: outcome.message,
            duration: 9000,
          })
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

  const value = useMemo<AppDataValue>(
    () => ({
      data,
      loading,
      persistent: storageIsPersistent,
      update,
      updateMany,
      reset,
      clearTransactionalData,
      exportBackup: repository.exportBackup,
    }),
    [data, loading, update, updateMany, reset, clearTransactionalData],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData(): AppDataValue {
  const value = useContext(AppDataContext)
  if (!value) throw new Error('useAppData must be used inside an AppDataProvider')
  return value
}
