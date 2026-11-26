import companySeal from '@/assets/company-seal.png'

/**
 * The house mark: the company seal — the same one stamped behind every printed
 * page (`PrintWatermark`) and set in the printed letterhead, so the app, the
 * landing page and the paper all carry one mark.
 */
export function StoneMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <img
      src={companySeal}
      alt=""
      aria-hidden
      draggable={false}
      className={`${className} shrink-0 rounded-full bg-white object-contain`}
    />
  )
}
