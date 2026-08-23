import { pickSlots, slotted } from '../slots.jsx'
import { Sheet } from './Sheet.jsx'
import { Eyebrow } from '../core/Eyebrow.jsx'
import { SealMark } from '../brand/SealMark.jsx'
import { StencilTitle } from '../brand/StencilTitle.jsx'
import { ProgramLockup } from '../brand/ProgramLockup.jsx'
import { FirstName } from '../brand/FirstName.jsx'

/**
 * CoverSheet - the deck opens here. Transition defaults to `banner`: a cover is
 * the opening statement of a deck, not general content.
 *
 * The SEAL goes here (covers, closing sheets, and anything printed or worn),
 * never the mark alone, because the footer rail is the logotype's zone.
 *
 * AUDIENCE CHROME, not content: on `.frc-audience-external` the cover adds a
 * ProgramLockup and the FIRST attribution line. That switch is CSS on the deck
 * root, so this component takes no audience prop and no deck ever has to
 * remember it. Both modes carry 5669 - in the footer rail, and again inside the
 * program lockup - which is the team identification the FIRST marks require.
 */
export function CoverSheet({ transition = 'banner', program = 'frc', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Sheet kind="cover" transition={transition} slots={slots} className={className} data-frc="CoverSheet" {...rest}>
      <div className="frc-cover-main">
        <div className="frc-cover-mark">
          <SealMark size={200} />
          {slots.eyebrow ? <Eyebrow tone="accent">{slots.eyebrow}</Eyebrow> : null}
        </div>
        {slots.title ? <StencilTitle as="h1" size="display" className="frc-cover-title">{slots.title}</StencilTitle> : null}
        {slotted(slots.subtitle, 'frc-cover-sub', 'p')}
        {slots.meta ? <div className="frc-cover-meta">{slots.meta}</div> : null}
        {extra}
      </div>
      <div className="frc-cover-foot">
        <div className="frc-audience-only-external">
          <ProgramLockup program={program} />
        </div>
        <p className="frc-first-attrib">
          {slots.attribution
            ? slots.attribution
            : <>Techmen, Team 5669, is a registered <FirstName>FIRST Robotics Competition</FirstName> team at Don Bosco Technical Institute.</>}
        </p>
      </div>
    </Sheet>
  )
}
