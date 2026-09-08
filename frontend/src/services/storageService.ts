/**
 * The only thing in the application that touches persistence.
 *
 * Every read and write goes through this module, which is what makes the swap
 * to a REST backend a change to *one file* rather than a search through fifty
 * components. `repository.ts` above it speaks in domain terms; nothing below
 * this line knows what a mesh or a transaction is.
 *
 * Failure is not silent. `localStorage` throws in a private window, when the
 * quota is full, and when a browser is set to block site data — and a factory
 * office that thinks its entries are saved when they are not is far worse off
 * than one that is told. Writes report their outcome; the UI surfaces it.
 */

const NAMESPACE = 'bhuiyan'

export type StorageOutcome =
  | { ok: true }
  | { ok: false; reason: 'unavailable' | 'quota' | 'unknown'; message: string }

export interface StorageDriver {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): StorageOutcome
  remove(key: string): StorageOutcome
  keys(): string[]
}

function namespaced(key: string): string {
  return `${NAMESPACE}.${key}`
}

/** Probe once rather than wrapping every call in a try that always fails. */
function storageAvailable(): boolean {
  try {
    const probe = `${NAMESPACE}.__probe__`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * The fallback when the browser refuses to store anything.
 *
 * Data survives navigation within the session but not a reload. The UI says so
 * plainly rather than pretending the write succeeded.
 */
function createMemoryDriver(): StorageDriver {
  const store = new Map<string, string>()

  return {
    get<T>(key: string): T | null {
      const raw = store.get(namespaced(key))
      return raw === undefined ? null : (JSON.parse(raw) as T)
    },
    set<T>(key: string, value: T): StorageOutcome {
      store.set(namespaced(key), JSON.stringify(value))
      return { ok: true }
    },
    remove(key: string): StorageOutcome {
      store.delete(namespaced(key))
      return { ok: true }
    },
    keys(): string[] {
      return [...store.keys()].map((k) => k.slice(NAMESPACE.length + 1))
    },
  }
}

function createLocalDriver(): StorageDriver {
  return {
    get<T>(key: string): T | null {
      try {
        const raw = window.localStorage.getItem(namespaced(key))
        if (raw === null) return null
        return JSON.parse(raw) as T
      } catch {
        // Corrupt JSON is treated as absent rather than crashing the page.
        // A single unreadable key must not take the whole system down.
        return null
      }
    },

    set<T>(key: string, value: T): StorageOutcome {
      try {
        window.localStorage.setItem(namespaced(key), JSON.stringify(value))
        return { ok: true }
      } catch (error) {
        const quota =
          error instanceof DOMException &&
          (error.name === 'QuotaExceededError' || error.code === 22)

        return quota
          ? {
              ok: false,
              reason: 'quota',
              message:
                'The browser has run out of storage space. Export a backup and ' +
                'clear old data before entering anything more.',
            }
          : {
              ok: false,
              reason: 'unknown',
              message:
                'The entry could not be saved to this browser. It is on screen, ' +
                'but it will be lost if the page is reloaded.',
            }
      }
    },

    remove(key: string): StorageOutcome {
      try {
        window.localStorage.removeItem(namespaced(key))
        return { ok: true }
      } catch {
        return { ok: false, reason: 'unknown', message: 'Could not remove the stored value.' }
      }
    },

    keys(): string[] {
      try {
        return Object.keys(window.localStorage)
          .filter((k) => k.startsWith(`${NAMESPACE}.`))
          .map((k) => k.slice(NAMESPACE.length + 1))
      } catch {
        return []
      }
    },
  }
}

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

export const storageIsPersistent = isBrowser && storageAvailable()

const driver: StorageDriver = storageIsPersistent ? createLocalDriver() : createMemoryDriver()

export const storageService = {
  get: <T>(key: string): T | null => driver.get<T>(key),
  set: <T>(key: string, value: T): StorageOutcome => driver.set<T>(key, value),
  remove: (key: string): StorageOutcome => driver.remove(key),
  keys: (): string[] => driver.keys(),

  /** Everything, for the backup/export feature. */
  exportAll(): Record<string, unknown> {
    return driver.keys().reduce<Record<string, unknown>>((all, key) => {
      all[key] = driver.get(key)
      return all
    }, {})
  },
}
