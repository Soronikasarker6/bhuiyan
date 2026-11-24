import { useId, useMemo } from 'react'

/**
 * Slate grey (#1f2937) at 7% over white paper, pre-mixed into one solid
 * colour rather than an `opacity` on the SVG: a solid colour needs no
 * transparency layer, which print drivers and PDF viewers handle unevenly.
 */
const SEAL_TINT = '#eff0f1'

const SEAL_FONT = 'Georgia, "Times New Roman", serif'

/**
 * Each arc of lettering at its full size, and how much of its arc it may use.
 * The arcs are half-circles (top r=150, bottom r=172, so about 471 and 540
 * units long); the limits leave room for the divider dots at either end.
 */
const TOP_LINE = { size: 31, weight: 700, spacing: 5, maxLength: 420 }
const BOTTOM_LINE = { size: 17, weight: 600, spacing: 4.5, maxLength: 470 }

let measureContext: CanvasRenderingContext2D | null | undefined

/**
 * The font size (and matching letter spacing) at which `text` fits its arc:
 * the full size when it already fits, otherwise scaled down just enough.
 * Measured with a canvas in the seal's own font, so it works while the sheet
 * is hidden; without a canvas (tests) the text keeps its full size.
 */
function fitToArc(text: string, line: typeof TOP_LINE): { size: number; spacing: number } {
  if (measureContext === undefined) {
    measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (!measureContext) return { size: line.size, spacing: line.spacing }

  measureContext.font = `${line.weight} ${line.size}px ${SEAL_FONT}`
  const width = measureContext.measureText(text).width + line.spacing * text.length
  // Size and spacing shrink together, so the width shrinks in proportion.
  const scale = width > line.maxLength ? line.maxLength / width : 1
  return { size: line.size * scale, spacing: line.spacing * scale }
}

/**
 * The company seal stamped faintly behind every printed document.
 *
 * Rendered by `PrintSheet` once per printed page (see `paginate.ts`), centred
 * in that page, so a ten-page ledger carries the seal on all ten in every
 * browser — Safari included, which prints a `position: fixed` element once.
 *
 * Kept deliberately faint (see `SEAL_TINT`) and behind the content
 * (`PrintSheet` lifts its content above it) — a seal marks the paper as the
 * company's, it must never compete with the figures printed over it.
 */
export function PrintWatermark({
  title = 'BHUIYAN INDUSTRY',
  subtitle = 'Agro-Based Limestone Manufacturing Company',
}: {
  title?: string
  subtitle?: string
}) {
  // Unique path ids: `<textPath>` resolves by document-wide id.
  const uid = useId().replace(/:/g, '')
  const topArc = `seal-top-${uid}`
  const bottomArc = `seal-bottom-${uid}`
  const top = useMemo(() => fitToArc(title, TOP_LINE), [title])
  const bottom = useMemo(() => fitToArc(subtitle, BOTTOM_LINE), [subtitle])

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
          fontFamily={SEAL_FONT}
          textAnchor="middle"
        >
          {/* Two thin concentric borders. */}
          <circle cx="200" cy="200" r="195" fill="none" strokeWidth="2.5" />
          <circle cx="200" cy="200" r="185" fill="none" strokeWidth="1" />

          <text fontSize={top.size} fontWeight={TOP_LINE.weight} letterSpacing={top.spacing} stroke="none">
            <textPath href={`#${topArc}`} startOffset="50%">
              {title}
            </textPath>
          </text>

          <text fontSize={bottom.size} fontWeight={BOTTOM_LINE.weight} letterSpacing={bottom.spacing} stroke="none">
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
