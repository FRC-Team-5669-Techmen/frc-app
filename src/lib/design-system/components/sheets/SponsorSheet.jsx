import { pickSlots, slotted } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { FirstName } from '../brand/FirstName.jsx'

/**
 * SponsorSheet - who pays for this, tiered.
 *
 * The child is the `SponsorWall`. Every mark inside it is a `Cutout` with
 * `ground="none"` - a sponsor logo is a floating mark, and a contact shadow
 * under a corporate logo reads as a rendering error to the one person in the
 * room most likely to notice. `SponsorTier` enforces that; this sheet does not
 * have to.
 *
 * `slot="thanks"` is the line that says what the money bought. Sponsors read
 * "your money paid for the practice field" better than they read a logo grid.
 */
export function SponsorSheet({ transition = 'shutter', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  return (
    <Sheet kind="sponsor" transition={transition} slots={slots} className={className} data-frc="SponsorSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-sponsor-main">
          {slotted(slots.thanks, 'frc-sheet-lede', 'p')}
          {body}
          <p className="frc-first-attrib">
            {slots.attribution
              ? slots.attribution
              : <>Techmen, Team 5669, is a registered <FirstName>FIRST Robotics Competition</FirstName> team at Don Bosco Technical Institute.</>}
          </p>
        </div>
      </div>
    </Sheet>
  )
}
