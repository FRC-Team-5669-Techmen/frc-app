import { useId } from 'react'
import { cx } from '../cx.js'

/**
 * ChevronRail — a row of right-pointing chevrons. The SQUADRON rule element.
 * Drawn as an SVG pattern on currentColor so it takes any ground alias.
 * tone: accent | dim | structure. height in px (structural).
 */
export function ChevronRail({ tone = 'accent', height = 12, className, style, ...rest }) {
  const id = useId().replace(/:/g, '')
  const h = Number(height) || 12
  const half = h / 2
  const pitch = h + h / 3
  const d = `M0 0 L${half} 0 L${h} ${half} L${half} ${h} L0 ${h} L${half} ${half} Z`
  return (
    <div
      className={cx('frc-chevron-rail', tone === 'dim' && 'frc-chevron-rail-dim', tone === 'structure' && 'frc-chevron-rail-structure', className)}
      style={{ height: h, ...style }}
      data-frc="ChevronRail"
      aria-hidden="true"
      {...rest}
    >
      <svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
        <defs>
          <pattern id={`frc-chev-${id}`} patternUnits="userSpaceOnUse" width={pitch} height={h}>
            <path d={d} fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#frc-chev-${id})`} />
      </svg>
    </div>
  )
}
