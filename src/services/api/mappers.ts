/**
 * Shapes API JSON (snake_case, numeric ids) into exactly what the existing
 * frontend types expect (camelCase, string ids) — so every `src/utils/*.ts`
 * derivation function keeps working completely unchanged against data that
 * came from the backend instead of localStorage.
 *
 * This is deliberately one generic, recursive pass rather than a hand-written
 * mapper per entity: the backend's field names already match the frontend's
 * one-for-one once snake_case is converted to camelCase (`gross_weight_kg` →
 * `grossWeightKg`, `mesh_size_id` → `meshSizeId`, …), so the only real work is
 * that conversion plus turning id-shaped fields into strings. The one field
 * that doesn't line up mechanically (`category_name` → `category`) is fixed
 * up as a small named exception below.
 */

const ID_KEY = /(^id$|Id$)/

function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(camelize)
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [rawKey, rawValue] of Object.entries(value as Record<string, unknown>)) {
      const key = toCamel(rawKey)
      let next = camelize(rawValue)

      if (ID_KEY.test(key) && (typeof next === 'number' || typeof next === 'string')) {
        next = String(next)
      }

      out[key] = next
    }
    return out
  }

  return value
}

/** Renames that don't fall out of a mechanical snake_case → camelCase pass. */
function renameFields(value: unknown, renames: Record<string, string>): unknown {
  if (value === null || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const out: Record<string, unknown> = { ...record }

  for (const [from, to] of Object.entries(renames)) {
    if (from in out) {
      out[to] = out[from]
      delete out[from]
    }
  }

  return out
}

/** Generic mapper — use for entities with no naming exceptions. */
export function mapEntity<T>(json: unknown): T {
  return camelize(json) as T
}

export function mapEntities<T>(json: unknown): T[] {
  return (camelize(json) as T[]) ?? []
}

/** `Transaction.category` is a plain label; the backend stores it as `category_name`. */
export function mapTransaction<T>(json: unknown): T {
  return renameFields(camelize(json), { categoryName: 'category' }) as T
}

export function mapTransactions<T>(json: unknown): T[] {
  return ((camelize(json) as Record<string, unknown>[]) ?? []).map(
    (row) => renameFields(row, { categoryName: 'category' }) as T,
  )
}

/** Builds a `?a=1&b=2` query string, dropping undefined/null/empty values. */
export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}
