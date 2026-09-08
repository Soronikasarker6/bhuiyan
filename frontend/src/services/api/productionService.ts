import type { ID, MeshStock, ProductionEntry, StockLedgerRow } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export interface ProductionInput {
  date: string
  productId: ID
  meshId: ID
  bags: number
  notes?: string
}

export const productionService = {
  async list(productId?: ID): Promise<ProductionEntry[]> {
    const qs = productId ? `?product_id=${productId}` : ''
    return mapEntities<ProductionEntry>(await http.get(`/production-entries${qs}`))
  },
  async create(data: ProductionInput): Promise<ProductionEntry> {
    return mapEntity<ProductionEntry>(
      await http.post('/production-entries', {
        date: data.date,
        product_id: data.productId,
        mesh_id: data.meshId,
        bags: data.bags,
        notes: data.notes,
      }),
    )
  },
  async remove(id: ID): Promise<void> {
    await http.delete(`/production-entries/${id}`)
  },
  async meshStock(productId: ID): Promise<MeshStock[]> {
    return mapEntities<MeshStock>(await http.get(`/products/${productId}/mesh-stock`))
  },
  async stockLedger(productId: ID, meshId: ID): Promise<{ rows: StockLedgerRow[]; currentStockBags: number }> {
    const raw = await http.get<{ rows: unknown; current_stock_bags: number }>(
      `/products/${productId}/stock-ledger?mesh_id=${meshId}`,
    )
    return { rows: mapEntities(raw.rows), currentStockBags: raw.current_stock_bags }
  },
}
