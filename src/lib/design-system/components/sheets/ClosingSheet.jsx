import { pickSlots, slotted } from '../slots.jsx'
import { Sheet } from './Sheet.jsx'
import { eyebrowClass } from '../core/Eyebrow.jsx'
import { SealMark } from '../brand/SealMark.jsx'
import { stencilClass } from '../brand/StencilTitle.jsx'
import { FirstName } from '../brand/FirstName.jsx'

/**
 * ClosingSheet - the last beat. Transition `cut`, because the end of a deck is
 * a deliberate stillness rather than another wipe.
 *
 * Seal, one closing line, and what happens next. AUDIENCE CHROME, not content:
 * on `.frc-audience-external` the sponsor rail appears (pass a `SponsorWall` as
 * `slot="sponsors"`) along with the FIRST attribution line. The switch is CSS
 * on the deck root; this component takes no audience prop.
 */
export function ClosingSheet({ transition = 'cut', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Sheet kind="closing" transition={transition} slots={slots} className={className} data-frc="ClosingSheet" {...rest}>
      <div className="frc-closing-main">
        <div className="frc-closing-mark">
          <SealMark size={160} />
          {slotted(slots.eyebrow, eyebrowClass({ tone: 'accent' }), 'p')}
        </div>
        {slotted(slots.title, stencilClass({ size: 'display' }), 'h2')}
        {slotted(slots.lede, 'frc-sheet-lede', 'p')}
        {slots.next ? <div className="frc-closing-next">{slots.next}</div> : null}
        {extra}
      </div>
      <div className="frc-closing-foot">
        {slots.sponsors ? <div className="frc-audience-only-external">{slots.sponsors}</div> : null}
        <p className="frc-first-attrib">
          {slots.attribution
            ? slots.attribution
            : <>Techmen, Team 5669, is a registered <FirstName>FIRST Robotics Competition</FirstName> team at Don Bosco Technical Institute.</>}
        </p>
      </div>
    </Sheet>
  )
}
