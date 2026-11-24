import { useId } from 'react'

/**
 * Slate grey (#1f2937) at 7% over white paper, pre-mixed into one solid
 * colour. Deliberately NOT an `opacity` on the SVG: any opacity puts the
 * seal in a transparency layer, and Chrome then paints a `position: fixed`
 * element on the last printed page only instead of on every page.
 */
const SEAL_TINT = '#eff0f1'

/**
 * The company seal stamped faintly behind every printed document.
 *
 * Rendered once by `PrintSheet`; `print.css` pins it with `position: fixed`,
 * which browsers repeat on every printed page, so a ten-page ledger carries
 * the seal on all ten without the document knowing how many pages it has.
 *
 * Kept deliberately faint (see `SEAL_TINT`) and behind the content (`PrintSheet` lifts its content above
 * it) — a seal marks the paper as the company's, it must never compete with
 * the figures printed over it.
 */
export function PrintWatermark({
  title = 'BHUIYAN INDUSTRY',
  subtitle = 'LIMESTONE MANUFACTURING',
}: {
  title?: string
  subtitle?: string
}) {
  // Unique path ids: `<textPath>` resolves by document-wide id.
  const uid = useId().replace(/:/g, '')
  const topArc = `seal-top-${uid}`
  const bottomArc = `seal-bottom-${uid}`

  return (
    <div className="print-watermark" aria-hidden>
      <svg viewBox="0 0 400 400" width="100%" height="100%" focusable="false">
        <defs>
          {/* Over the top, left to right: glyphs stand outward from the centre. */}
          <path id={topArc} d="M 50 200 A 150 150 0 0 1 350 200" fill="none" />
          {/* Under the bottom, left to right: glyphs stand inward, upright. */}
          <path id={bottomArc} d="M 28 200 A 172 172 0 0 0 372 200" fill="none" />
        </defs>

        <g
          fill={SEAL_TINT}
          stroke={SEAL_TINT}
          fontFamily='Georgia, "Times New Roman", serif'
          textAnchor="middle"
        >
          {/* Two thin concentric borders. */}
          <circle cx="200" cy="200" r="195" fill="none" strokeWidth="2.5" />
          <circle cx="200" cy="200" r="185" fill="none" strokeWidth="1" />

          <text fontSize="31" fontWeight="700" letterSpacing="5" stroke="none">
            <textPath href={`#${topArc}`} startOffset="50%">
              {title}
            </textPath>
          </text>

          <text fontSize="17" fontWeight="600" letterSpacing="4.5" stroke="none">
            <textPath href={`#${bottomArc}`} startOffset="50%">
              {subtitle}
            </textPath>
          </text>

          {/* Dividers where the two arcs of lettering meet. */}
          <circle cx="36" cy="200" r="4" stroke="none" />
          <circle cx="364" cy="200" r="4" stroke="none" />

          {/* Centre: the house mark (StoneMark's stones). */}
          <g transform="translate(200 200) scale(6.2) translate(-12 -12)" stroke="none">
            <ellipse cx="12" cy="19" rx="8.5" ry="2.7" />
            <ellipse cx="10.4" cy="13.6" rx="6.2" ry="2.4" />
            <ellipse cx="13.4" cy="8.4" rx="4.3" ry="2.1" />
            <ellipse cx="11.2" cy="4.2" rx="2.4" ry="1.5" />
          </g>
        </g>
      </svg>
    </div>
  )
}
