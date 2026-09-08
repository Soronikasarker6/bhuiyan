import type { UnitOfMeasure } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export const unitOfMeasureService = {
  async list(): Promise<UnitOfMeasure[]> {
    return mapEntities<UnitOfMeasure>(await http.get('/units-of-measure'))
  },
  async create(name: string): Promise<UnitOfMeasure> {
    return mapEntity<UnitOfMeasure>(await http.post('/units-of-measure', { name }))
  },
  async update(id: string, name: string): Promise<UnitOfMeasure> {
    return mapEntity<UnitOfMeasure>(await http.put(`/units-of-measure/${id}`, { name }))
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/units-of-measure/${id}`)
  },
}
