import * as React from 'react'
import { DatePicker as UI5DatePicker } from '@ui5/webcomponents-react/DatePicker'
import { cn } from '@/utils/cn'

/**
 * A date field — ISO (`yyyy-MM-dd`) in, ISO out, matching every date string
 * already used throughout the app (`todayISO()`, `formatDate`, a `Sale.date`,
 * …) exactly, via UI5's own `valueFormat` — no conversion layer needed
 * anywhere this is used.
 *
 * Not a native `<input type="date">` any more (browsers render that
 * inconsistently — no calendar on some, a bare mm/dd/yyyy popup on others).
 * `react-hook-form`'s `register()` doesn't reach a UI5 element, so this is
 * always wired as a controlled field: `value={watch('date')}` +
 * `onChange={(v) => setValue('date', v)}` — the exact pattern this codebase
 * already uses for every `Select` field, just applied here too.
 */
export const DatePicker = React.forwardRef<
  HTMLElement,
  {
    id?: string
    value?: string
    onChange: (value: string) => void
    min?: string
    max?: string
    disabled?: boolean
    className?: string
    'aria-label'?: string
  }
>(function DatePicker({ id, value, onChange, min, max, disabled, className, 'aria-label': ariaLabel }, ref) {
  return (
    <UI5DatePicker
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      id={id}
      value={value}
      valueFormat="yyyy-MM-dd"
      minDate={min}
      maxDate={max}
      disabled={disabled}
      accessibleName={ariaLabel}
      className={cn('w-full', className)}
      onChange={(e) => onChange(e.detail.value)}
    />
  )
})
