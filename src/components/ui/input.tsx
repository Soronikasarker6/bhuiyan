import * as React from 'react'
import { cn } from '@/utils/cn'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // Compact — matches the UI5 fields around it: --sapElement_Compact_Height
        // is 1.625rem, so every field on the page (native or UI5) sits at the
        // same height rather than the touch-sized "cozy" default.
        'flex h-[1.625rem] w-full rounded-md border border-input bg-card px-2.5 py-0 text-[0.8125rem] shadow-sm ' +
          'transition-colors placeholder:text-muted-foreground/70 ' +
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ' +
          'disabled:cursor-not-allowed disabled:opacity-60 ' +
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20',
        // Numbers are read in columns, so they are set in tabular figures
        // wherever they are typed as well as wherever they are displayed.
        (type === 'number' || props.inputMode === 'decimal' || props.inputMode === 'numeric') &&
          'font-mono tabular tracking-tight',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'flex min-h-[56px] w-full rounded-md border border-input bg-card px-2.5 py-1 text-[0.8125rem] shadow-sm ' +
        'placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 ' +
        'focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60',
      className,
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Input, Textarea }
