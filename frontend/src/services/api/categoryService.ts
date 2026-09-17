import type { Category, Direction, ExpenseType } from '@/types'
import { http } from './httpClient'
import { mapEntities, mapEntity } from './mappers'

export const categoryService = {
  async list(): Promise<Category[]> {
    return mapEntities<Category>(await http.get('/categories'))
  },
  async create(name: string, direction: Direction, expenseType?: ExpenseType | null): Promise<Category> {
    return mapEntity<Category>(await http.post('/categories', { name, direction, expense_type: expenseType }))
  },
  async update(id: string, name: string, direction: Direction, expenseType?: ExpenseType | null): Promise<Category> {
    return mapEntity<Category>(await http.put(`/categories/${id}`, { name, direction, expense_type: expenseType }))
  },
  async remove(id: string): Promise<void> {
    await http.delete(`/categories/${id}`)
  },
}
