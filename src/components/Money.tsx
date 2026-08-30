import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/utils/cn'
import { formatBags, formatCurrency, formatNumber, formatPercent, formatTons } from '@/utils/format'

/**
 * Every figure in the system is drawn by one of these.
 *
 * Two rules, applied without exception:
 *
 *   - Tabular numerals. In a proportional font the digits have different
 *     widths, the decimal points wander, and a column of money stops being
 *     scannable — which is the entire purpose of a column of money.
 *   - Colour carries meaning, never decoration. Maroon is a figure going the
 *     wrong way; green is one going the right way; everything else is ink.
 */

type Tone = 'auto' | 'neutral' | 'positive' | 'negative' | 'muted'

const toneClass: Record<Exclude<Tone, 'auto'>, string> = {
  neutral: 'text-foreground',
  positive: 'text-success-700',
  negative: 'text-primary-700',
  muted: 'text-muted-foreground',
}

function resolveTone(tone: Tone, value: number): string {
  if (tone !== 'auto') return toneClass[tone]
  if (value < 0) return toneClass.negative
  return toneClass.neutral
}

export function Money({
  value,
  tone = 'auto',
  className,
  size = 'base',
  weight = 'medium',
}: {
  value: number
  tone?: Tone
  className?: string
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl'
  weight?: 'normal' | 'medium' | 'semibold' | 'bold'
}) {
  const sizes = {
    xs: 'text-xs',
    sm: 'text-[0.8125rem]',
    base: 'text-sm',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl sm:text-[1.75rem]',
  }

  const weights = {
    normal: 'font-normal',
    medium: 'font-medium',
    semibold: 'font-semibold',
    bold: 'font-bold',
  }

  return (
    <span
      className={cn(
        'font-mono tabular tracking-tight whitespace-nowrap',
        sizes[size],
        weights[weight],
        resolveTone(tone, value),
        className,
      )}
    >
      {formatCurrency(value)}
    </span>
  )
}

/** A plain quantity — bags, entry counts. No currency symbol. */
export function Num({
  value,
  suffix,
  tone = 'neutral',
  className,
  size = 'base',
}: {
  value: number
  suffix?: string
  tone?: Tone
  className?: string
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl'
}) {
  const sizes = {
    xs: 'text-xs',
    sm: 'text-[0.8125rem]',
    base: 'text-sm',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl sm:text-[1.75rem]',
  }

  return (
    <span
      className={cn(
        'font-mono tabular tracking-tight whitespace-nowrap',
        sizes[size],
        resolveTone(tone, value),
        className,
      )}
    >
      {formatNumber(value)}
      {suffix && <span className="ml-1 font-sans text-[0.85em] text-muted-foreground">{suffix}</span>}
    </span>
  )
}

/**
 * Bags with their ton equivalent underneath.
 *
 * Both, always. The floor counts bags and the office reports tons, and showing
 * one without the other means somebody does the conversion in their head —
 * which is where the wrong bag weight gets applied.
 */
export function BagTon({
  bags,
  tons,
  className,
  size = 'base',
  inline = false,
  tone = 'neutral',
}: {
  bags: number
  tons: number
  className?: string
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl'
  inline?: boolean
  tone?: Tone
}) {
  const sizes = {
    xs: 'text-xs',
    sm: 'text-[0.8125rem]',
    base: 'text-sm',
    lg: 'text-lg',
    xl: 'text-xl',
  }

  if (inline) {
    return (
      <span className={cn('whitespace-nowrap font-mono tabular', sizes[size], className)}>
        <span className={resolveTone(tone, bags)}>{formatBags(bags)}</span>
        <span className="ml-1 font-sans text-[0.85em] text-muted-foreground">Bag</span>
        <span className="ml-1.5 font-sans text-[0.8em] text-muted-foreground/80">
          ({formatTons(tons)} t)
        </span>
      </span>
    )
  }

  return (
    <span className={cn('inline-flex flex-col items-end leading-tight', className)}>
      <span className={cn('font-mono tabular tracking-tight', sizes[size], resolveTone(tone, bags))}>
        {formatBags(bags)}
        <span className="ml-1 font-sans text-[0.8em] font-normal text-muted-foreground">Bag</span>
      </span>
      <span className="font-mono tabular text-2xs text-muted-foreground">
        {formatTons(tons)} Ton
      </span>
    </span>
  )
}

/**
 * A change against a baseline.
 *
 * Returns nothing at all when there is no baseline to compare against — a
 * "+0.0%" against a month that did not exist is worse than silence.
 */
export function Delta({
  value,
  label,
  invert = false,
  className,
}: {
  value: number | null
  label?: string
  /** For cost figures, where a rise is bad news. */
  invert?: boolean
  className?: string
}) {
  if (value === null || !Number.isFinite(value)) {
    return label ? (
      <span className={cn('text-2xs text-muted-foreground', className)}>{label}</span>
    ) : null
  }

  const good = invert ? value < 0 : value > 0
  const flat = Math.abs(value) < 0.05

  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-2xs font-medium',
        flat ? 'text-muted-foreground' : good ? 'text-success-700' : 'text-primary-700',
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="font-mono tabular">{formatPercent(value)}</span>
      {label && <span className="font-sans font-normal text-muted-foreground">{label}</span>}
    </span>
  )
}
