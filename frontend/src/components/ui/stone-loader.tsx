import styles from './stone-loader.module.css'

/**
 * The house busy indicator — three irregular gravel chips tumbling in
 * sequence, in place of a generic spinner or dot row. Uses `currentColor`
 * so it always matches whatever text color its container already has
 * (white on a destructive/emphasized button, muted-foreground elsewhere).
 */
export function StoneLoader({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-flex items-end gap-[3px] ${className ?? ''}`}
    >
      <svg viewBox="0 0 12 10" className={`h-[9px] w-[10px] ${styles.stone}`}>
        <path
          d="M1.2 7.4C.2 5.9.9 3.9 2.7 3.1c1.4-.6 3-.5 4 .6 1.1 1.2 1 3-.2 4.1C5 9.2 2.3 9.1 1.2 7.4Z"
          fill="currentColor"
        />
      </svg>
      <svg viewBox="0 0 12 10" className={`h-[10px] w-[11px] ${styles.stone}`}>
        <path
          d="M1 6.8C-.1 4.9.9 2.6 3 1.8c1.7-.6 3.7-.2 4.7 1.2 1 1.4.7 3.4-.8 4.4-1.7 1.2-4.7 1.1-5.9-.6Z"
          fill="currentColor"
        />
      </svg>
      <svg viewBox="0 0 12 10" className={`h-[8px] w-[9px] ${styles.stone}`}>
        <path
          d="M1.4 6.9C.4 5.5 1 3.6 2.6 2.9c1.3-.6 2.8-.4 3.7.7 1 1.1.9 2.8-.3 3.7-1.3 1-3.6.9-4.6-.4Z"
          fill="currentColor"
        />
      </svg>
    </span>
  )
}
