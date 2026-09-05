import * as React from 'react'
import { Select as UI5Select } from '@ui5/webcomponents-react/Select'
import { Option } from '@ui5/webcomponents-react/Option'
import { cn } from '@/utils/cn'

/**
 * The house Select, now backed by UI5's `ui5-select`.
 *
 * UI5's Select is a single element — it IS its own trigger, with no
 * separate popover-content piece the way Radix's compound
 * `Select`/`SelectTrigger`/`SelectContent`/`SelectItem` API has. Rather than
 * touch the ~20 call sites using that compound API, `Select` here reads its
 * children in the same shape (`<SelectTrigger>` for the trigger's `id`/
 * `className`, `<SelectContent>` holding `<SelectItem>`s) and renders one
 * real `ui5-select` with `ui5-option`s from it — every existing call site
 * keeps working unchanged. `SelectTrigger`/`SelectValue`/`SelectContent`/
 * `SelectItem` below are inert markers read by `Select`, never rendered on
 * their own.
 *
 * Simplification: `SelectValue`'s `placeholder` is not carried over — UI5's
 * Select has no placeholder concept, and every call site in this app always
 * selects a real option (often a `"__all__"`-style sentinel value), so
 * there has never actually been a genuinely empty Select to show one in.
 */

interface SelectItemElement extends React.ReactElement {
  props: { value: string; children?: React.ReactNode }
}

function isSelectItem(node: React.ReactNode): node is SelectItemElement {
  return React.isValidElement(node) && node.type === SelectItem
}

const Select = React.forwardRef<
  HTMLElement,
  {
    value?: string
    onValueChange?: (value: string) => void
    disabled?: boolean
    children?: React.ReactNode
    className?: string
  }
>(function Select({ value, onValueChange, disabled, children, className }, ref) {
  let triggerId: string | undefined
  let triggerClassName: string | undefined
  const items: SelectItemElement[] = []

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return

    if (child.type === SelectTrigger) {
      const triggerProps = child.props as { id?: string; className?: string }
      triggerId = triggerProps.id
      triggerClassName = triggerProps.className
    }

    if (child.type === SelectContent) {
      const contentProps = child.props as { children?: React.ReactNode }
      React.Children.forEach(contentProps.children, (item) => {
        if (isSelectItem(item)) items.push(item)
      })
    }
  })

  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <UI5Select
      ref={ref as any}
      id={triggerId}
      // ui5-select has no default width (it inherits the shared Input base's
      // `:host{width:var(--_ui5_input_width)}`, an intrinsic size, not
      // 100%) — every call site here expects it to fill its grid/flex cell
      // the way a native <select> would, so that's the default unless a
      // narrower one is explicitly given (e.g. the KG/Ton unit picker).
      className={cn('w-full', triggerClassName, className)}
      disabled={disabled}
      value={value}
      onChange={(e) => onValueChange?.(e.detail.selectedOption.value ?? '')}
    >
      {items.map((item) => (
        <Option key={item.props.value} value={item.props.value}>
          {item.props.children}
        </Option>
      ))}
    </UI5Select>
  )
})

/** Inert — read by `Select` above for its `id`/`className`, never rendered. */
function SelectTrigger({ children }: { children?: React.ReactNode; id?: string; className?: string }) {
  return <>{children}</>
}

/** Inert — placeholder text is not carried over (see file doc comment). */
function SelectValue(_props: { placeholder?: string }) {
  return null
}

/** Inert — read by `Select` above for its `SelectItem` children, never rendered. */
function SelectContent({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

/** Inert — data read by `Select` above, never rendered. */
function SelectItem({ children }: { value: string; children?: React.ReactNode; disabled?: boolean }) {
  return <>{children}</>
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
