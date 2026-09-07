import type { Product } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export interface ProductInput {
  name: string
  code: string
  description?: string
  unit: string
  active: boolean
}

export const productService = {
  async list(): Promise<Product[]> {
    return mapEntities<Product>(await http.get('/products'))
  },
  async create(data: ProductInput): Promise<Product> {
    return mapEntity<Product>(await http.post('/products', data))
  },
  async update(id: string, data: ProductInput): Promise<Product> {
    return mapEntity<Product>(await http.put(`/products/${id}`, data))
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/products/${id}`)
  },
}
