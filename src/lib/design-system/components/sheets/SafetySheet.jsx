import { Children, isValidElement } from 'react'
import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { SafetyNote } from '../surfaces/SafetyNote.jsx'
import { StepCard } from '../surfaces/StepCard.jsx'

function hasSafetyNote(nodes) {
  let found = false
  Children.forEach(nodes, (child) => {
    if (isValidElement(child) && child.type === SafetyNote) found = true
  })
  return found
}

/**
 * SafetySheet - the shop hazard, the rules, and the steps that keep them.
 *
 * IT REFUSES TO RENDER WITHOUT A `SafetyNote`. A safety sheet whose hazard was
 * softened into a normal callout is worse than no safety sheet: the deck still
 * looks like safety was covered when someone scans the thumbnail rail for
 * exactly that. Pass the note as `slot="note"`.
 *
 * Steps are `Step` children; `slot="aside"` takes the drawing or the PPE list.
 */
export function SafetySheet({ transition = 'shutter', className, children, ...rest }) {
  const { slots, rest: steps } = pickSlots(children)
  if (!hasSafetyNote(slots.note)) {
    throw new Error('SafetySheet: pass a SafetyNote as slot="note". A safety sheet without one still reads as "safety was covered" from the thumbnail rail.')
  }
  return (
    <Sheet kind="safety" transition={transition} slots={slots} className={className} data-frc="SafetySheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
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
