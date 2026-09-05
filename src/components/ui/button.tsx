import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Button as UI5Button } from '@ui5/webcomponents-react/Button'
import type { ButtonPropTypes } from '@ui5/webcomponents-react/Button'
import { cn } from '@/utils/cn'
import styles from './button.module.css'

/**
 * The house button, now a UI5 `ui5-button` underneath.
 *
 * `variant`/`size` are unchanged from before — every existing call site
 * (`<Button variant="success" size="sm">`) keeps working. `variant` maps to
 * UI5's own `design` (`Emphasized`/`Positive`/`Negative`/…); `size` maps to
 * a small CSS-part override (`button.module.css`) since a plain height/
 * padding utility class can't reach inside a web component's shadow root.
 *
 * `asChild` is the one deliberate exception: it stays on Radix's `Slot` (a
 * tiny composition primitive, not a UI kit) rather than UI5, because it
 * exists specifically to render a real `<Link>` as the button for
 * navigation — a UI5 custom element can't "become" a different element the
 * way `Slot` lets a plain styled one. Those call sites get the same
 * `buttonVariants` Tailwind classes as before, unchanged.
 */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ' +
    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
    'focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ' +
    '[&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary-700 text-primary-foreground shadow-sm hover:bg-primary-800',
        success: 'bg-success-700 text-white shadow-sm hover:bg-success-800',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-card shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/70',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary-700 underline-offset-4 hover:underline',
      },
      size: {
        // Compact — 1.625rem matches --sapElement_Compact_Height, the same
        // control height every UI5 field around these buttons renders at.
        default: 'h-[1.625rem] px-3 text-[0.8125rem]',
        sm: 'h-[1.375rem] rounded-md px-2 text-[0.75rem]',
        lg: 'h-[1.75rem] rounded-md px-4 text-[0.8125rem]',
        icon: 'h-[1.625rem] w-[1.625rem]',
        'icon-sm': 'h-[1.375rem] w-[1.375rem]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

/** `variant` → UI5 `ButtonDesign`. Plain string literals — no enum import needed. */
const DESIGN: Record<NonNullable<ButtonProps['variant']>, ButtonPropTypes['design']> = {
  default: 'Emphasized',
  success: 'Positive',
  destructive: 'Negative',
  outline: 'Default',
  secondary: 'Default',
  ghost: 'Transparent',
  link: 'Transparent',
}

/** `size` → the CSS-part override class in `button.module.css`. */
const SIZE_CLASS: Record<NonNullable<ButtonProps['size']>, string> = {
  default: styles.default!,
  sm: styles.sm!,
  lg: styles.lg!,
  icon: styles.icon!,
  'icon-sm': styles.iconSm!,
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'type'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
  onClick?: (event: React.SyntheticEvent) => void
}

const Button = React.forwardRef<HTMLElement, ButtonProps>(function Button(
  {
    className,
    variant = 'default',
    size = 'default',
    asChild = false,
    loading = false,
    children,
    disabled,
    type = 'button',
    'aria-label': ariaLabel,
    ...props
  },
  ref,
) {
  if (asChild) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref as any} {...props}>
        {children}
      </Slot>
    )
  }

  return (
    <UI5Button
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      // The lucide icon passed as a child projects through ui5-button's
      // default slot but stays a light-DOM node, so this selector still
      // reaches it — without it, an unconstrained lucide `<svg>` renders at
      // its own default size (24px) inside a button barely taller than
      // that, which is exactly the "oversized icon" look this fixes.
      className={cn('[&_svg]:size-3.5 [&_svg]:shrink-0', SIZE_CLASS[size ?? 'default'], className)}
      design={DESIGN[variant ?? 'default']}
      disabled={disabled}
      loading={loading}
      type={type === 'submit' ? 'Submit' : type === 'reset' ? 'Reset' : 'Button'}
      accessibleName={ariaLabel}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(props as any)}
    >
      {children}
    </UI5Button>
  )
})
Button.displayName = 'Button'

export { Button, buttonVariants }
