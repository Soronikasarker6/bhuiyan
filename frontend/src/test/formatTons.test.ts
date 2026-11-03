import { describe, expect, it } from 'vitest'
import { formatTons } from '@/utils/format'

describe('formatTons', () => {
  it('keeps at least two decimals', () => {
    expect(formatTons(155)).toBe('155.00')
    expect(formatTons(2.35)).toBe('2.35')
  })

  it('never rounds away a fractional quantity', () => {
    // 5,137.35 kg raw sale = 5.13735 Ton; 175 − that = 169.86265 Ton
    expect(formatTons(5.13735)).toBe('5.13735')
    expect(formatTons(169.86265)).toBe('169.86265')
    expect(formatTons(0.08)).toBe('0.08')
  })

  it('drops only floating-point noise, and marks negatives', () => {
    expect(formatTons(0.1 + 0.2)).toBe('0.30')
    expect(formatTons(-1.23456)).toBe('−1.23456')
  })
})
