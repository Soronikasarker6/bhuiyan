/**
 * The domain, as types.
 *
 * Everything the application knows about is declared here and nowhere else —
 * "here" now meaning this folder, one file per domain area, re-exported from
 * this barrel so every existing `import type { X } from '@/types'` call site
 * keeps working unchanged. Conventions worth stating up front:
 *
 *   - Raw material import weight is always in KG (gross/tare/net, as the
 *     weighbridge reports it); `netWeightKg` is never stored — it is always
 *     `grossWeightKg - tareWeightKg`, computed through one function, so a
 *     typed net figure can never disagree with the two weights behind it.
 *   - Production and stock are always counted in bags first; kg and tons are
 *     always `bags × bagKg` / `.../1000`, computed, never stored. Sales
 *     quantity is entered in bags for the same reason — it's what a sale
 *     actually deducts from stock — and its ton weight is derived the same
 *     way.
 *   - Money is a number of Taka, rounded for display through one function.
 *   - A customer's balance, due, and available advance are never stored —
 *     they are derived from the `CustomerTransaction` log, the same way an
 *     account balance is derived from `Transaction`s. A stored balance is a
 *     second source of truth, and the two will eventually disagree.
 */

export * from './common'
export * from './product'
export * from './rawMaterialImport'
export * from './production'
export * from './customer'
export * from './sale'
export * from './customerLedger'
export * from './ledger'
export * from './profit'
export * from './appData'
export * from './report'
