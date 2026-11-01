import { kgToTons } from './imports'

/**
 * The one weighbridge calculation, for every sale type — mirrors
 * App\Support\Weighbridge on the backend:
 *
 *     Net Weight (KG)  = Gross Weight (KG) − Tare Weight (KG)
 *     Net Weight (TON) = Net Weight (KG) ÷ 1000
 *
 * A missing gross or tare (null, undefined, or a blank form field) gives no
 * net weight — never 0. Net kg is rounded to the 2 decimals the kg columns
 * hold, which only clears float noise.
 *
 * This is the truck's measured weight. It never replaces the billable ton on
 * a sale's lines, which amounts, the customer ledger, stock and COGS read.
 */

export interface WeighbridgeSlip {
  grossWeightKg?: number | string | null
  tareWeightKg?: number | string | null
}

export interface WeighbridgeWeights {
  /** Each figure is present only if it was recorded. */
  grossKg?: number
  tareKg?: number
  /** Present only when both gross and tare were recorded. */
  netKg?: number
  netTon?: number
}

function recorded(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || String(value).trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function netWeightKgOf(grossKg: number | string | null | undefined, tareKg: number | string | null | undefined): number | undefined {
  const gross = recorded(grossKg)
  const tare = recorded(tareKg)
  if (gross === undefined || tare === undefined) return undefined
  return Math.round((gross - tare) * 100) / 100
}

export function weighbridgeWeights(slip: WeighbridgeSlip): WeighbridgeWeights {
  const netKg = netWeightKgOf(slip.grossWeightKg, slip.tareWeightKg)
  return {
    grossKg: recorded(slip.grossWeightKg),
    tareKg: recorded(slip.tareWeightKg),
    netKg,
    netTon: netKg === undefined ? undefined : kgToTons(netKg),
  }
}
