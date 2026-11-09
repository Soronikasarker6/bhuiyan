/**
 * Amounts in words, the way a Bangladeshi cheque or bill-book writes them:
 * `25500` → "Twenty-Five Thousand Five Hundred Taka Only", grouped in the
 * South Asian system (Thousand, Lakh, Crore), not million and billion.
 *
 * One function for every printed document, so a ledger and a register never
 * spell the same figure two different ways.
 */

const ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

/** 0–99. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  const tens = TENS[Math.floor(n / 10)]
  return n % 10 ? `${tens}-${ONES[n % 10]}` : tens
}

/** 0–999, empty for 0. */
function threeDigits(n: number): string {
  const parts: string[] = []
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} Hundred`)
  if (n % 100) parts.push(twoDigits(n % 100))
  return parts.join(' ')
}

/**
 * A non-negative whole number in words. Above 99 crore the crore count is
 * itself spelled recursively ("One Hundred Crore"), as is the convention.
 */
export function integerToWords(value: number): string {
  let n = Math.floor(Math.abs(value))
  if (n === 0) return ONES[0]

  const parts: string[] = []
  const crore = Math.floor(n / 1_00_00_000)
  n %= 1_00_00_000
  const lakh = Math.floor(n / 1_00_000)
  n %= 1_00_000
  const thousand = Math.floor(n / 1_000)
  n %= 1_000

  if (crore) parts.push(`${integerToWords(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (n) parts.push(threeDigits(n))

  return parts.join(' ')
}

export interface AmountInWordsOptions {
  /**
   * Keep paisa (two decimals) — the private bookkeeping ledger records them.
   * Off by default: the operational screens show whole Taka
   * (`formatCurrency`), and the words must say what the figure beside them says.
   */
  paisa?: boolean
}

/**
 * `25500` → "Twenty-Five Thousand Five Hundred Taka Only".
 * `1250.5, { paisa: true }` → "One Thousand Two Hundred Fifty Taka and Fifty Paisa Only".
 *
 * The sign is ignored — whether a figure is owed or paid ahead is said by
 * the label beside it (Due / Advance), never by "Minus".
 */
export function amountToWords(value: number | null | undefined, options: AmountInWordsOptions = {}): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.abs(value) : 0

  // Work in whole paisa so 0.1 + 0.2 style noise can't produce "Twenty-Nine Paisa".
  const totalPaisa = options.paisa ? Math.round(n * 100) : Math.round(n) * 100
  const taka = Math.floor(totalPaisa / 100)
  const paisa = totalPaisa % 100

  if (paisa === 0) return `${integerToWords(taka)} Taka Only`
  if (taka === 0) return `${twoDigits(paisa)} Paisa Only`
  return `${integerToWords(taka)} Taka and ${twoDigits(paisa)} Paisa Only`
}

export interface BalanceSummary {
  /** "Due Amount" or "Advance Amount" — which way the balance points. */
  label: 'Due Amount' | 'Advance Amount'
  amount: number
  words: string
}

/**
 * The one closing balance a statement states, resolved to Due or Advance.
 * Positive = the customer owes (Due); negative = paid ahead (Advance).
 * Zero reads as "Due Amount · Zero Taka Only" — nothing owed.
 */
export function balanceSummary(balance: number, options: AmountInWordsOptions = {}): BalanceSummary {
  const amount = Math.abs(balance)
  const threshold = options.paisa ? 0.005 : 0.5
  const isAdvance = balance < 0 && amount >= threshold

  return {
    label: isAdvance ? 'Advance Amount' : 'Due Amount',
    amount: amount < threshold ? 0 : amount,
    words: amountToWords(amount, options),
  }
}
