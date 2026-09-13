import type { ID, RawMaterialStock, RawStockSummary } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity, toQuery } from './mappers'

export const rawMaterialService = {
  async allStock(): Promise<RawMaterialStock[]> {
    return mapEntities<RawMaterialStock>(await http.get('/raw-materials'))
  },
  async stock(productId: ID): Promise<RawMaterialStock> {
    return mapEntity<RawMaterialStock>(await http.get(`/raw-materials/${productId}/stock`))
  },
  /**
   * Current raw stock per limestone type, optionally narrowed to one type and
   * bounded by a date range (§6) — the server-side counterpart of
   * `allRawStockSummaries` in `utils/rawMaterial.ts`.
   */
  async report(params: { productId?: ID; from?: string; to?: string } = {}): Promise<RawStockSummary[]> {
    const query = toQuery({ product_id: params.productId, from: params.from, to: params.to })
    return mapEntities<RawStockSummary>(await http.get(`/raw-materials/report${query}`))
  },
}
