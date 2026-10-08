import { useMemo, useState } from 'react'
import { compareCreated } from '@/utils/id'

export type SortDirection = 'asc' | 'desc'

/**
 * `defaultSortKey` for "newest created on top" — the default for every entry
 * register, so a row just added (even one back-dated) appears first. No
 * column header is highlighted for it; clicking a header sorts by that column
 * as before. Rows must carry `id` and, ideally, `createdAt`.
 */
export const CREATED = '__created'

/**
 * Search + column sort for a table, in one hook.
 *
 * Every list screen in the system (§17) needs both; this is the one place
 * that logic lives, rather than being rebuilt slightly differently on each
 * table. Filtering happens first, so the row count shown always matches what
 * is on screen, then sorting — both cheap enough to redo on every keystroke
 * for the table sizes this system deals in.
 */
export function useSortableSearch<T>({
  rows,
  searchText,
  sorters,
  defaultSortKey,
  defaultDirection = 'desc',
}: {
  rows: T[]
  searchText: (row: T) => string
  sorters: Record<string, (a: T, b: T) => number>
  defaultSortKey?: string
  defaultDirection?: SortDirection
}) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState(defaultSortKey ?? Object.keys(sorters)[0] ?? '')
  const [direction, setDirection] = useState<SortDirection>(defaultDirection)

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setDirection('asc')
    }
  }

  const rowsOut = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const filtered = needle ? rows.filter((r) => searchText(r).toLowerCase().includes(needle)) : rows

    const sorter = sortKey === CREATED ? (compareCreated as (a: T, b: T) => number) : sorters[sortKey]
    if (!sorter) return filtered

    const sorted = [...filtered].sort(sorter)
    return direction === 'asc' ? sorted : sorted.reverse()
  }, [rows, search, sortKey, direction, searchText, sorters])

  return { search, setSearch, sortKey, direction, toggleSort, rows: rowsOut }
}
