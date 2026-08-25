import { pickSlots, slotted } from '../slots.jsx'
import { Sheet } from './Sheet.jsx'
import { eyebrowClass } from '../core/Eyebrow.jsx'
import { Divider } from '../core/Divider.jsx'
import { stencilClass } from '../brand/StencilTitle.jsx'

/**
 * StatementSheet - one thing, said once. Transition `banner`.
 *
 * A statement is the only sheet that may run display type with nothing to
 * support it, so the room reads the sentence rather than skimming a layout.
 * Keep it to one sentence; two sentences is a `SplitSheet`.
 */
export function StatementSheet({ transition = 'banner', size = 'display', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Sheet kind="statement" transition={transition} slots={slots} className={className} data-frc="StatementSheet" {...rest}>
      <div className="frc-statement-main">
        {slotted(slots.eyebrow, eyebrowClass({ tone: 'accent' }), 'p')}
        {slotted(slots.title, stencilClass({ size }), 'p')}
        {slots.attribution ? <Divider variant="line" /> : null}
        {slotted(slots.attribution, 'frc-sheet-note')}
        {extra}
      </div>
    </Sheet>
  )
}
