import type { RawMaterialImport, ShipmentCycleRow, ShipmentStatus, ID } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity, toQuery } from './mappers'

export interface ShipmentInput {
  date: string
  productId: ID
  shipName?: string
  serialNo?: string
  truckNo?: string
  grossWeightKg: number
  tareWeightKg: number
  pricePerTon?: number
  notes?: string
}

function toPayload(data: ShipmentInput) {
  return {
    date: data.date,
    product_id: data.productId,
    ship_name: data.shipName,
    serial_no: data.serialNo,
    truck_no: data.truckNo,
    gross_weight_kg: data.grossWeightKg,
    tare_weight_kg: data.tareWeightKg,
    price_per_ton: data.pricePerTon,
    notes: data.notes,
  }
}

export const shipmentService = {
  async list(filters: { productId?: ID; status?: ShipmentStatus } = {}): Promise<RawMaterialImport[]> {
    const qs = toQuery({ product_id: filters.productId, status: filters.status })
    return mapEntities<RawMaterialImport>(await http.get(`/shipments${qs}`))
  },
  async create(data: ShipmentInput): Promise<RawMaterialImport> {
    return mapEntity<RawMaterialImport>(await http.post('/shipments', toPayload(data)))
  },
  async update(id: ID, data: ShipmentInput): Promise<RawMaterialImport> {
    return mapEntity<RawMaterialImport>(await http.put(`/shipments/${id}`, toPayload(data)))
  },
  async remove(id: ID): Promise<void> {
    await http.delete(`/shipments/${id}`)
  },
  async close(id: ID): Promise<RawMaterialImport> {
    return mapEntity<RawMaterialImport>(await http.post(`/shipments/${id}/close`))
  },
  async reopen(id: ID): Promise<RawMaterialImport> {
    return mapEntity<RawMaterialImport>(await http.post(`/shipments/${id}/reopen`))
  },
  async cycles(productId?: ID): Promise<ShipmentCycleRow[]> {
    const qs = toQuery({ product_id: productId })
    return mapEntities<ShipmentCycleRow>(await http.get(`/shipment-cycles${qs}`))
  },
}
