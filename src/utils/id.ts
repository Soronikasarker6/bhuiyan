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

/** ISO timestamp for `createdAt`, in one place so it is consistent. */
export function now(): string {
  return new Date().toISOString()
}
