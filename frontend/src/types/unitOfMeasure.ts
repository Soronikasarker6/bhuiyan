import type { ID } from './common'

/**
 * A unit a product is sold/counted in — Ton, KG, Bag, Piece, … A small,
 * user-managed reference list, exactly like `Category`: a product's own
 * `unit` field stores the picked name directly (a plain string, not an id
 * reference), so renaming or removing a unit here never has to rewrite any
 * product that already used it.
 */
export interface UnitOfMeasure {
  id: ID
  name: string
  createdAt: string
}
