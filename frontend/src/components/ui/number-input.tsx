import * as React from 'react'
import { Input as UI5Input } from '@ui5/webcomponents-react/Input'
import { cn } from '@/utils/cn'

/**
 * A numeric field backed by UI5's `ui5-input` (`type="Number"`) — used
 * wherever a value needs real decimal precision (bags, rate, and the
 * actual/billable ton override on a sale line), per the sales-invoice
 * decimal-ton work.
 *
 * UI5's `Input` always deals in strings (`value`, `onInput` both give back
 * a string) — a native HTML `type="number"` input underneath still accepts
 * free-typed decimals regardless of `step`, so nothing here rounds or
 * truncates what's typed.
 */
export const NumberInput = React.forwardRef<
  HTMLElement,
  {
    id?: string
    value: number | string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    className?: string
    invalid?: boolean
  }
>(function NumberInput({ id, value, onChange, placeholder, disabled, className, invalid }, ref) {
  const stringValue = value === '' || value === undefined || value === null || Number.isNaN(value as number) ? '' : String(value)

  return (
    <UI5Input
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      id={id}
      type="Number"
      value={stringValue}
      placeholder={placeholder}
      disabled={disabled}
      valueState={invalid ? 'Negative' : 'None'}
      className={cn('w-full', className)}
      onInput={(e) => onChange(e.target.value ?? '')}
    />
  )
})
