import * as React from 'react'
import { DateRangePicker as UI5DateRangePicker } from '@ui5/webcomponents-react/DateRangePicker'
import { cn } from '@/utils/cn'

/**
 * One delimited value in, one delimited value out — chosen instead of UI5's
 * default "-" specifically because `valueFormat="yyyy-MM-dd"` already uses
 * "-" inside each date; reusing it as the delimiter would make the combined
 * string ambiguous to split back apart.
 */
const DELIMITER = ' to '

/**
 * A single UI5 date-range field standing in for a separate From/To
 * `DatePicker` pair — one popup calendar, one control. ISO (`yyyy-MM-dd`)
 * `from`/`to` strings in, the same two strings out via `onChange` — every
 * call site keeps the exact `from`/`to` state it already had; this is the one
 * place that joins/splits UI5's single delimited value.
 */
export const DateRangePicker = React.forwardRef<
  HTMLElement,
  {
    id?: string
    from?: string
    to?: string
    onChange: (from: string, to: string) => void
    min?: string
    max?: string
    disabled?: boolean
    className?: string
    'aria-label'?: string
  }
>(function DateRangePicker({ id, from, to, onChange, min, max, disabled, className, 'aria-label': ariaLabel }, ref) {
  const value = from || to ? `${from ?? ''}${DELIMITER}${to ?? ''}` : ''

  return (
    <UI5DateRangePicker
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      id={id}
      value={value}
      valueFormat="yyyy-MM-dd"
      delimiter={DELIMITER}
      minDate={min}
      maxDate={max}
      disabled={disabled}
      accessibleName={ariaLabel}
      className={cn('w-full', className)}
      onChange={(e) => {
        const [start, end] = (e.detail.value ?? '').split(DELIMITER)
        onChange((start ?? '').trim(), (end ?? '').trim())
      }}
    />
  )
})
