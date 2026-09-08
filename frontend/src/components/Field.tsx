import type { ReactNode } from 'react'
import { Label } from '@/components/ui/misc'

/**
 * One labelled form field, everywhere in the system.
 *
 * The error and the hint share one line under the control so a validation
 * message never pushes the field below it down the page as it appears.
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  error?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-1.5 block">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="mt-1 text-2xs font-medium text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-2xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  )
}
