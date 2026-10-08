import { describe, expect, it } from 'vitest'
import { compareCreated, newestFirst } from '@/utils/id'
import { productionRowsForProduct } from '@/utils/productionStock'

/** New entries show on top of every register — by when they were recorded, not the date typed on them. */
describe('newest created first', () => {
  it('puts a back-dated entry recorded just now on top', () => {
    const rows = [
      { id: '1', date: '2026-10-08', createdAt: '2026-10-08T09:00:00.000Z' },
      { id: '2', date: '2026-10-01', createdAt: '2026-10-09T09:00:00.000Z' }, // recorded today, dated last week
    ]
    expect(newestFirst(rows).map((r) => r.id)).toEqual(['2', '1'])
  })

  it('breaks a same-second tie by the server id, numerically', () => {
    const at = '2026-10-09T09:00:00.000Z'
    expect(newestFirst([{ id: '9', createdAt: at }, { id: '10', createdAt: at }]).map((r) => r.id)).toEqual(['10', '9'])
  })

  it('falls back to the id when a row has no createdAt', () => {
    expect(compareCreated({ id: '3' }, { id: '12' })).toBeLessThan(0)
  })

  it('does not mutate the input', () => {
    const rows = [{ id: '1' }, { id: '2' }]
    newestFirst(rows)
    expect(rows.map((r) => r.id)).toEqual(['1', '2'])
  })

  it('production entries list newest-recorded first', () => {
    const entries = [
      { id: '1', date: '2026-10-08', productId: 'p1', meshId: 'm', bags: 1, createdAt: '2026-10-08T09:00:00.000Z' },
      { id: '2', date: '2026-10-02', productId: 'p1', meshId: 'm', bags: 1, createdAt: '2026-10-09T09:00:00.000Z' },
    ]
    expect(productionRowsForProduct('p1', entries).map((e) => e.id)).toEqual(['2', '1'])
  })
})
