/**
 * Test-environment setup, loaded before every test file (vite.config.ts →
 * test.setupFiles).
 *
 * Node 22+ defines its own `localStorage` / `sessionStorage` on the global
 * object, and without `--localstorage-file` they read as `undefined`. That
 * global shadows the Storage jsdom provides, so `window.localStorage.clear()`
 * throws and any test touching auth/session storage fails before it starts.
 * When the global one is not usable, install a plain in-memory Storage in its
 * place. On a Node that leaves jsdom's alone, this does nothing.
 */

class MemoryStorage implements Storage {
  private items = new Map<string, string>()

  get length(): number {
    return this.items.size
  }

  clear(): void {
    this.items.clear()
  }

  getItem(key: string): string | null {
    return this.items.has(key) ? this.items.get(key)! : null
  }

  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.items.delete(key)
  }

  setItem(key: string, value: string): void {
    this.items.set(key, String(value))
  }
}

function usable(storage: Storage | undefined): boolean {
  try {
    return typeof storage?.getItem === 'function' && typeof storage.clear === 'function'
  } catch {
    return false
  }
}

for (const name of ['localStorage', 'sessionStorage'] as const) {
  if (!usable(globalThis[name])) {
    Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true })
  }
}
