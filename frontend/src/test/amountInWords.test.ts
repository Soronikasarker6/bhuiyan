import { describe, expect, it } from 'vitest'
import { amountToWords, balanceSummary, integerToWords } from '@/utils/amountInWords'
import { customerPartyPrint, dueOrAdvancePrint } from '@/utils/customerLedger'

describe('amountToWords', () => {
  it('spells the examples from the brief', () => {
    expect(amountToWords(1000)).toBe('One Thousand Taka Only')
    expect(amountToWords(25500)).toBe('Twenty-Five Thousand Five Hundred Taka Only')
    expect(amountToWords(100000)).toBe('One Lakh Taka Only')
  })

  it('uses the Bangladesh system — Thousand, Lakh, Crore', () => {
    expect(amountToWords(1234567)).toBe('Twelve Lakh Thirty-Four Thousand Five Hundred Sixty-Seven Taka Only')
    expect(amountToWords(10000000)).toBe('One Crore Taka Only')
    expect(amountToWords(123456789)).toBe(
      'Twelve Crore Thirty-Four Lakh Fifty-Six Thousand Seven Hundred Eighty-Nine Taka Only',
    )
    expect(integerToWords(1000000000)).toBe('One Hundred Crore')
    expect(amountToWords(10101)).toBe('Ten Thousand One Hundred One Taka Only')
  })

  it('handles zero, negatives and junk', () => {
    expect(amountToWords(0)).toBe('Zero Taka Only')
    expect(amountToWords(-500)).toBe('Five Hundred Taka Only')
    expect(amountToWords(NaN)).toBe('Zero Taka Only')
    expect(amountToWords(null)).toBe('Zero Taka Only')
  })

  it('rounds to whole Taka by default, like formatCurrency', () => {
    expect(amountToWords(1500.4)).toBe('One Thousand Five Hundred Taka Only')
    expect(amountToWords(1500.5)).toBe('One Thousand Five Hundred One Taka Only')
  })

  it('keeps paisa when asked', () => {
    expect(amountToWords(1250.5, { paisa: true })).toBe('One Thousand Two Hundred Fifty Taka and Fifty Paisa Only')
    expect(amountToWords(0.75, { paisa: true })).toBe('Seventy-Five Paisa Only')
    expect(amountToWords(0.1 + 0.2, { paisa: true })).toBe('Thirty Paisa Only')
    expect(amountToWords(99.999, { paisa: true })).toBe('One Hundred Taka Only')
  })
})

describe('balanceSummary / dueOrAdvancePrint', () => {
  it('reads a positive balance as Due', () => {
    expect(balanceSummary(25500)).toEqual({ label: 'Due Amount', amount: 25500, words: 'Twenty-Five Thousand Five Hundred Taka Only' })
  })

  it('reads a negative balance as Advance', () => {
    expect(balanceSummary(-10000)).toEqual({ label: 'Advance Amount', amount: 10000, words: 'Ten Thousand Taka Only' })
  })

  it('reads zero as nothing due', () => {
    expect(balanceSummary(0)).toEqual({ label: 'Due Amount', amount: 0, words: 'Zero Taka Only' })
    expect(balanceSummary(-0.001, { paisa: true }).label).toBe('Due Amount')
  })

  it('resolves the statement totals to the applicable balance only', () => {
    expect(dueOrAdvancePrint({ totalDue: 25500, availableAdvance: 0 })).toEqual({
      label: 'Due Amount',
      amount: '৳ 25,500',
      words: 'Twenty-Five Thousand Five Hundred Taka Only',
    })
    expect(dueOrAdvancePrint({ totalDue: 0, availableAdvance: 100000 })).toEqual({
      label: 'Advance Amount',
      amount: '৳ 1,00,000',
      words: 'One Lakh Taka Only',
    })
    expect(dueOrAdvancePrint({ totalDue: 0, availableAdvance: 0 }).words).toBe('Zero Taka Only')
  })
})

describe('customerPartyPrint', () => {
  it('heads with the company, listing name, phone and address, skipping blanks and a duplicated name', () => {
    expect(customerPartyPrint({ name: 'Rahim Traders', company: 'Rahim Traders', phone: '01700', address: ' ' })).toEqual({
      name: 'Rahim Traders',
      details: ['01700'],
    })
    expect(customerPartyPrint({ name: 'Rahim', company: 'Rahim Traders Ltd', address: 'Sylhet' })).toEqual({
      name: 'Rahim Traders Ltd',
      details: ['Rahim', 'Sylhet'],
    })
    expect(customerPartyPrint({ name: 'Rahim', phone: '01700' })).toEqual({
      name: 'Rahim',
      details: ['01700'],
    })
  })
})
