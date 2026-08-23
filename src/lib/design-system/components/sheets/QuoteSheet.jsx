import { pickSlots } from '../slots.jsx'
import { Sheet } from './Sheet.jsx'
import { QuoteBlock } from '../surfaces/QuoteBlock.jsx'

/**
 * QuoteSheet - a student, mentor, judge or sponsor said this. Transition
 * `banner`.
 *
 * The quote itself is a `QuoteBlock`, so the rule, the display face and the
 * attribution treatment are the component's, not this sheet's. An optional
 * portrait sits beside it: pass a `Cutout` (alpha) or a round `ImageFrame`
 * (opaque) as `slot="portrait"`.
 */
export function QuoteSheet({ transition = 'banner', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Sheet kind="quote" transition={transition} slots={slots} className={className} data-frc="QuoteSheet" {...rest}>
      <div className="frc-quote-main" data-portrait={slots.portrait ? '' : undefined}>
        {slots.portrait}
        <QuoteBlock>
          {slots.text}
          {slots.attr}
          {slots.role}
        </QuoteBlock>
        {extra}
      </div>
    </Sheet>
  )
}
