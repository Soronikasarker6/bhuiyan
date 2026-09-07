import type { ID, RawMaterialStock } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export const rawMaterialService = {
  async allStock(): Promise<RawMaterialStock[]> {
    return mapEntities<RawMaterialStock>(await http.get('/raw-materials'))
  },
  async stock(productId: ID): Promise<RawMaterialStock> {
    return mapEntity<RawMaterialStock>(await http.get(`/raw-materials/${productId}/stock`))
  },
}
