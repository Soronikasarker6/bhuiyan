import companySeal from '../../assets/company-seal.png'

/**
 * The company seal stamped faintly behind every printed document.
 *
 * Rendered by `PrintSheet` once per printed page (see `paginate.ts`), centred
 * in that page, so a ten-page ledger carries the seal on all ten in every
 * browser — Safari included, which prints a `position: fixed` element once.
 *
 * Kept deliberately faint (see `.print-watermark img` in print.css) and behind
 * the content (`PrintSheet` lifts its content above it) — a seal marks the
 * paper as the company's, it must never compete with the figures printed over it.
 */
export function PrintWatermark() {
  return (
    <div className="print-watermark" aria-hidden>
      <img src={companySeal} alt="" draggable={false} />
    </div>
  )
}
