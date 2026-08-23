import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { StepCard } from '../surfaces/StepCard.jsx'

/**
 * AgendaSheet - what this session covers, in order.
 *
 * The items are `Step` children, so the numbering is the StepCard CSS counter:
 * inserting an item renumbers the rest and no printed number can go stale.
 * Every item is visible at rest - an agenda that reveals itself one line at a
 * time tells the room nothing about how long the session is.
 */
export function AgendaSheet({ transition = 'shutter', className, children, ...rest }) {
  const { slots, rest: items } = pickSlots(children)
  return (
    <Sheet kind="agenda" transition={transition} slots={slots} className={className} data-frc="AgendaSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <StepCard>{items}</StepCard>
        {slots.foot ? <div className="frc-sheet-foot">{slots.foot}</div> : null}
      </div>
    </Sheet>
  )
}
