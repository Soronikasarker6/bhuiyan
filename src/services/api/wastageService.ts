import type { ID, WastageEntry } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export interface WastageInput {
  date: string
  productId: ID
  quantityKg: number
  reason?: string
}

export const wastageService = {
  async list(productId?: ID): Promise<WastageEntry[]> {
    const qs = productId ? `?product_id=${productId}` : ''
    return mapEntities<WastageEntry>(await http.get(`/wastage-entries${qs}`))
  },
  async create(data: WastageInput): Promise<WastageEntry> {
    return mapEntity<WastageEntry>(
      await http.post('/wastage-entries', {
        date: data.date,
        product_id: data.productId,
        quantity_kg: data.quantityKg,
        reason: data.reason,
      }),
    )
  },
  async remove(id: ID): Promise<void> {
    await http.delete(`/wastage-entries/${id}`)
  },
}
