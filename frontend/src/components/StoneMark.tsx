/**
 * The house mark: three stacked stones, narrowing upward. The one icon that
 * stands in for "Bhuiyan Industry" everywhere a monogram would otherwise go
 * (sidebar rail, login card, public landing page) — drawn rather than set as
 * the letters "BI", which reads as a generic placeholder next to how much
 * quarry imagery already carries the brand.
 */
export function StoneMark({ className = 'h-[1.15rem] w-[1.15rem]' }: { className?: string }) {
  return (
    /* Offset left and right rather than stacked on one axis — three centred
       ellipses narrowing upward read as a head and shoulders at this size. */
    <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
      <ellipse cx="12" cy="19" rx="8.5" ry="2.7" fill="currentColor" opacity="0.95" />
      <ellipse cx="10.4" cy="13.6" rx="6.2" ry="2.4" fill="currentColor" opacity="0.72" />
      <ellipse cx="13.4" cy="8.4" rx="4.3" ry="2.1" fill="currentColor" opacity="0.5" />
      <ellipse cx="11.2" cy="4.2" rx="2.4" ry="1.5" fill="currentColor" opacity="0.32" />
    </svg>
  )
}
