import type { MeshSize } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export interface MeshSizeInput {
  name: string
  bagKg: number
  active: boolean
}

export const meshSizeService = {
  async list(): Promise<MeshSize[]> {
    return mapEntities<MeshSize>(await http.get('/mesh-sizes'))
  },
  async create(data: MeshSizeInput): Promise<MeshSize> {
    return mapEntity<MeshSize>(await http.post('/mesh-sizes', { name: data.name, bag_kg: data.bagKg, active: data.active }))
  },
  async update(id: string, data: MeshSizeInput): Promise<MeshSize> {
    return mapEntity<MeshSize>(
      await http.put(`/mesh-sizes/${id}`, { name: data.name, bag_kg: data.bagKg, active: data.active }),
    )
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/mesh-sizes/${id}`)
  },
}
