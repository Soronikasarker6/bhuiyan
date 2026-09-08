import type { ID } from './common'

export interface Customer {
  id: ID
  name: string
  phone?: string
  address?: string
  company?: string
  /** Positive = the customer already owed this before the ledger started. */
  openingBalance: number
  notes?: string
  active: boolean
  createdAt: string
}
