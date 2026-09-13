import * as React from 'react'
import { ComboBox as UI5ComboBox } from '@ui5/webcomponents-react/ComboBox'
import { ComboBoxItem } from '@ui5/webcomponents-react/ComboBoxItem'
import { cn } from '@/utils/cn'

export interface ComboBoxOption {
  value: string
  label: string
  /** Shown greyed beside the label in the list — a phone number, a company, a balance. */
  description?: string
}

/**
 * A type-to-filter picker backed by UI5's `ui5-combobox`, for lists that grow
 * past the point where scrolling a plain `Select` is reasonable — a customer
 * register, in particular.
 *
 * UI5's ComboBox is text-first: its `value` is whatever is *typed*, and a
 * selection arrives separately as `selection-change` carrying the chosen item.
 * Every call site here wants the opposite — an option's stable id in, the same
 * id out — so this wrapper is the one place that translates:
 *
 *  - the selected option's id is rendered as its label,
 *  - `selection-change` reads the id back off the item's `data-value`,
 *  - clearing the field to empty reports `''`.
 *
 * Free text that matches nothing is not a selection, so it is discarded and
 * the field snaps back to the current option. That snap-back has to be done
 * against the DOM element rather than by re-rendering: the typing happened
 * inside the custom element, so React's `value` prop never changed and a
 * re-render alone would leave the stale text sitting there.
 */
export const ComboBox = React.forwardRef<
  HTMLElement,
  {
    id?: string
    /** The selected option's `value`, or `''` for nothing selected. */
    value?: string
    options: ComboBoxOption[]
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    className?: string
    'aria-label'?: string
  }
>(function ComboBox(
  { id, value, options, onChange, placeholder, disabled, className, 'aria-label': ariaLabel },
  ref,
) {
  const innerRef = React.useRef<HTMLElement & { value?: string }>(null)
  const selectedLabel = options.find((option) => option.value === value)?.label ?? ''

  React.useImperativeHandle(ref, () => innerRef.current as HTMLElement, [])

  // Keep the element's own text in step with the selected option — after a
  // selection, after the selection is changed from outside, and after typing
  // that matched nothing and was discarded.
  React.useEffect(() => {
    const element = innerRef.current
    if (element && element.value !== selectedLabel) element.value = selectedLabel
  })

  const commit = (text: string) => {
    if (text.trim() === '') {
      onChange('')
      return
    }

    const match = options.find((option) => option.label.toLowerCase() === text.trim().toLowerCase())
    if (match) {
      onChange(match.value)
      return
    }

    // Not a real option — put the current selection's text back.
    const element = innerRef.current
    if (element) element.value = selectedLabel
  }

  return (
    <UI5ComboBox
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={innerRef as any}
      id={id}
      value={selectedLabel}
      placeholder={placeholder}
      disabled={disabled}
      accessibleName={ariaLabel}
      className={cn('w-full', className)}
      onSelectionChange={(event) => {
        const item = event.detail.item
        if (!item) {
          onChange('')
          return
        }
        onChange(item.getAttribute('data-value') ?? '')
      }}
      onChange={(event) => commit((event.target as HTMLElement & { value?: string }).value ?? '')}
    >
      {options.map((option) => (
        <ComboBoxItem
          key={option.value}
          data-value={option.value}
          text={option.label}
          additionalText={option.description}
        />
      ))}
    </UI5ComboBox>
  )
})
