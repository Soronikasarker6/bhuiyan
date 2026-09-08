import type { ID } from './common'

/**
 * A product/stone type the business trades in.
 *
 * Nothing about the system hard-codes "Vietnam White Limestone" or any other
 * name — every product on screen came from this list, added the same way the
 * first three were.
 */
export interface Product {
  id: ID
  name: string
  code: string
  description?: string
  /** How it is sold — "Ton" for every product today, but not assumed anywhere. */
  unit: string
  /** Retired products vanish from entry forms but keep their history. */
  active: boolean
  createdAt: string
}

/**
 * A configurable production/sale attribute — mesh size, grind, or grade.
 *
 * A global catalog: "250 Mesh" carries one bag weight shared across every
 * limestone type, rather than each product configuring its own. Adding
 * "1200" later, or changing what a bag of "250" weighs, is a Settings
 * action, never a code change.
 */
export interface MeshSize {
  id: ID
  name: string
  /** kg per bag — the one fact both Production and Sales convert through. */
  bagKg: number
  active: boolean
  createdAt: string
}
