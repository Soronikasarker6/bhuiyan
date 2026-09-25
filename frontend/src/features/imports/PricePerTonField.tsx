import { useEffect, useMemo, useState } from 'react'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/utils/format'

const CUSTOM_PRICE = '__custom__'
const NO_PRICE = '__none__'

/**
 * Price per Ton, picked from what this product has been priced at before.
 *
 * The same field on both import screens — recording a new receipt and
 * correcting one already recorded — so the two cannot drift into offering
 * different choices for the same question. Extracted for the reason
 * `ReusableValueField` beside it was: a yard buys the same material at the
 * same price for months, and retyping it is how a digit goes missing.
 *
 * A small unit toggle lets a custom figure be typed either per kg or per ton;
 * one canonical per-ton number is what leaves this component either way, so
 * nothing downstream has to know which way it was entered.
 *
 * Controlled on `value`. The only local state is the operator's *intent* to
 * type a custom figure — what is shown as selected is derived from `value`
 * itself, so a parent clearing the price (on a product change, or after a
 * save) is reflected here without the two having to agree about it first.
 */
export function PricePerTonField({
  idPrefix,
  value,
  previousPrices,
  seedKey,
  onChange,
}: {
  /** Prefixes every input id, so the create form and the edit dialog never collide. */
  idPrefix: string
  /** The current price in ৳ per ton, or undefined for "not priced yet". */
  value: number | undefined
  /** Every distinct price/ton previously used for this product, newest first. */
  previousPrices: number[]
  /**
   * Changing this puts the field back to its default shape — used when the
   * record being priced changes: a different product, a different import, a
   * fresh form after a save. It never touches `value`; the parent owns that.
   */
  seedKey: string
  onChange: (value: number | undefined) => void
}) {
  const [custom, setCustom] = useState(false)
  const [unit, setUnit] = useState<'ton' | 'kg'>('ton')
  const [text, setText] = useState('')

  // A price already saved against this record may not be in the list — it can
  // predate it, or belong to a product the entry has since been moved to — and
  // a Select whose value matches no item renders blank. Including it keeps
  // what was actually saved both visible and selected.
  const options = useMemo(() => {
    const all = [...previousPrices]
    if (value && value > 0 && !all.includes(value)) all.unshift(value)
    return all
  }, [previousPrices, value])

  useEffect(() => {
    setCustom(false)
    setUnit('ton')
    setText('')
  }, [seedKey])

  const selected = custom ? CUSTOM_PRICE : value && value > 0 ? String(value) : NO_PRICE

  const choose = (next: string) => {
    if (next === CUSTOM_PRICE) {
      setCustom(true)
      setText('')
      onChange(undefined)
      return
    }

    setCustom(false)
    onChange(next === NO_PRICE ? undefined : Number(next))
  }

  const typeCustom = (nextText: string, nextUnit: 'ton' | 'kg') => {
    setText(nextText)
    setUnit(nextUnit)

    const typed = Number(nextText)
    if (!nextText.trim() || !Number.isFinite(typed) || typed <= 0) {
      onChange(undefined)
      return
    }

    // One canonical per-ton figure, whichever way it was typed.
    onChange(nextUnit === 'kg' ? typed * 1000 : typed)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
      <Field label="Price per Ton (optional)" htmlFor={`${idPrefix}-price-choice`}>
        <Select value={selected} onValueChange={choose}>
          <SelectTrigger id={`${idPrefix}-price-choice`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_PRICE}>Not priced yet</SelectItem>
            {options.map((price) => (
              <SelectItem key={price} value={String(price)}>
                {formatCurrency(price)} / Ton (previously used)
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_PRICE}>Custom price…</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {custom && (
        <>
          <Field label="Unit" htmlFor={`${idPrefix}-price-unit`}>
            <Select value={unit} onValueChange={(next) => typeCustom(text, next as 'ton' | 'kg')}>
              <SelectTrigger id={`${idPrefix}-price-unit`} className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ton">৳ / Ton</SelectItem>
                <SelectItem value="kg">৳ / KG</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field
            label={`Price (৳ / ${unit === 'ton' ? 'Ton' : 'KG'})`}
            htmlFor={`${idPrefix}-price-custom`}
          >
            <Input
              id={`${idPrefix}-price-custom`}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={text}
              onChange={(event) => typeCustom(event.target.value, unit)}
            />
          </Field>
        </>
      )}
    </div>
  )
}
