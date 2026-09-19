import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

const ADD_NEW = '__add_new__'
const NONE = '__none__'

/**
 * A free-text field backed by whatever values have been used before —
 * Ship Name and Truck No. (§14–§16), the same convenience the Price per
 * Ton field already gives (`ImportEntryForm`'s own price choice), but
 * without a fixed master list: the options here are just prior entries, so
 * there is nothing to manage in Settings and no code change to add one.
 *
 * Starts in "custom" mode when the current value doesn't match a known
 * option — the case for an older record's value, or one already typed —
 * so opening it never hides or discards what was actually saved.
 */
export function ReusableValueField({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  placeholder: string
  onChange: (value: string) => void
}) {
  const [customMode, setCustomMode] = useState(() => value !== '' && !options.includes(value))

  if (customMode) {
    return (
      <Field label={label} htmlFor={id}>
        <div className="flex gap-1.5">
          <Input id={id} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
          {options.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Choose from previous entries"
              title="Choose from previous entries"
              onClick={() => {
                setCustomMode(false)
                onChange('')
              }}
            >
              <ArrowLeft />
            </Button>
          )}
        </div>
      </Field>
    )
  }

  return (
    <Field label={label} htmlFor={id}>
      <Select
        value={value || NONE}
        onValueChange={(next) => {
          if (next === ADD_NEW) {
            setCustomMode(true)
            onChange('')
          } else {
            onChange(next === NONE ? '' : next)
          }
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
          <SelectItem value={ADD_NEW}>+ Add New</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  )
}
