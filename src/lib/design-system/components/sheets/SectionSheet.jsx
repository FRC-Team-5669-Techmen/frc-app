import { pickSlots, slotted } from '../slots.jsx'
import { Sheet } from './Sheet.jsx'
import { eyebrowClass } from '../core/Eyebrow.jsx'
import { ChevronRail } from '../core/ChevronRail.jsx'
import { stencilClass } from '../brand/StencilTitle.jsx'

/**
 * SectionSheet - the divider between parts. Transition `banner`.
 *
 * The part index is chrome and stays a prop; the part NAME is copy and is a
 * child. The chevron rail under the title is SQUADRON's rule element, and it is
 * legal on every ground here because it is the pattern's structure rather than
 * a substitute for a divider.
 */
export function SectionSheet({ transition = 'banner', index, className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Sheet kind="section" transition={transition} slots={slots} className={className} data-frc="SectionSheet" {...rest}>
      <div className="frc-section-main">
        {index != null ? <span className="frc-section-index frc-numeral">{`Part ${String(index).padStart(2, '0')}`}</span> : null}
        {slotted(slots.eyebrow, eyebrowClass(), 'p')}
        {slotted(slots.title, stencilClass({ size: 'display' }), 'h2')}
        <ChevronRail className="frc-section-rail" />
        {slotted(slots.lede, 'frc-sheet-lede', 'p')}
        {extra}
      </div>
    </Sheet>
  )
}
