import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { StepCard } from '../surfaces/StepCard.jsx'

/**
 * ProcedureSheet - how a job is done, in order. This is the training sheet a
 * sophomore runs a session from, so every step is on the sheet at rest and
 * nothing waits for a click.
 *
 * Steps are `Step` children. The aside (`slot="aside"`) is where the drawing,
 * the `SafetyNote` or the tool list goes. A procedure that involves a shop
 * hazard belongs on a `SafetySheet`, which cannot be built without one.
 */
export function ProcedureSheet({ transition = 'shutter', className, children, ...rest }) {
  const { slots, rest: steps } = pickSlots(children)
  return (
    <Sheet kind="procedure" transition={transition} slots={slots} className={className} data-frc="ProcedureSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-procedure" data-aside={slots.aside ? undefined : 'none'}>
          <StepCard>{steps}</StepCard>
          {slots.aside ? <div className="frc-procedure-aside">{slots.aside}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
