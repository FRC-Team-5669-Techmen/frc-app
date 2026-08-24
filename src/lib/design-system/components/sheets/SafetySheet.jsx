import { pickSlots } from '../slots.jsx'
import { containsType } from '../host.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { SafetyNote } from '../surfaces/SafetyNote.jsx'
import { fault } from '../guard.jsx'
import { StepCard } from '../surfaces/StepCard.jsx'

/**
 * SafetySheet - the shop hazard, the rules, and the steps that keep them.
 *
 * IT REFUSES TO RENDER WITHOUT A `SafetyNote`. A safety sheet whose hazard was
 * softened into a normal callout is worse than no safety sheet: the deck still
 * looks like safety was covered when someone scans the thumbnail rail for
 * exactly that. Pass the note as `slot="note"`.
 *
 * The refusal renders a visible rust fault marker and throws only inside the
 * dev harness. See components/guard.jsx for why.
 *
 * THE CHECK LOOKS THROUGH A RUNTIME HOST AND THROUGH NOTHING ELSE. A note the
 * Claude Design runtime wrapped in a transparent host is the note the author
 * wrote, and used to trip this guard — twice, and the second time it cost a
 * whole sheet, hand-built in JavaScript inside the deck rather than expressed
 * as markup. A note softened into a Callout, or buried inside another
 * component, is different content and still fails. See components/host.jsx.
 *
 * Steps are `Step` children; `slot="aside"` takes the drawing or the PPE list.
 */
export function SafetySheet({ transition = 'shutter', className, children, ...rest }) {
  const { slots, rest: steps } = pickSlots(children)
  const missingNote = !containsType(slots.note, SafetyNote)
  const marker = missingNote
    ? fault(
      'SafetySheet',
      'Pass a SafetyNote as slot="note".',
      'Without one this sheet still reads as "safety was covered" from the thumbnail rail.',
    )
    : null
  return (
    <Sheet kind="safety" transition={transition} slots={slots} className={className} data-frc="SafetySheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        {marker}
        <div className="frc-safety-main">
          <div className="frc-safety-side">{slots.note}</div>
          <div className="frc-safety-side">
            {steps.length ? <StepCard>{steps}</StepCard> : null}
            {slots.aside}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
