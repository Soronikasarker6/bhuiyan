/**
 * Identifiers.
 *
 * `crypto.randomUUID` where the browser has it; a time-prefixed random string
 * otherwise. The time prefix is not decoration — ids sort in creation order,
 * which gives the ledger a stable tiebreak for two entries made on the same
 * date without needing a separate sequence.
 */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Oldest-created first — reverse it for "newest on top". Uses `createdAt`
 * when both rows have it, then the server's auto-increment id (newer rows get
 * bigger ids), so two rows saved in the same second still come out in the
 * order they were made.
 */
export function compareCreated(a: { id: string; createdAt?: string }, b: { id: string; createdAt?: string }): number {
  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
    return Date.parse(a.createdAt) - Date.parse(b.createdAt)
  }
  const na = Number(a.id)
  const nb = Number(b.id)
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** A copy of `rows`, most recently created first — for lists that show new entries on top. */
export function newestFirst<T extends { id: string; createdAt?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareCreated(b, a))
}

/** ISO timestamp for `createdAt`, in one place so it is consistent. */
export function now(): string {
  return new Date().toISOString()
}
