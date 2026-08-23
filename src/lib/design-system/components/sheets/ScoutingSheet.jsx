import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * ScoutingSheet - what the scouts saw. Transition `boot`.
 *
 * The child is the `ScoutTable`; clicking a row dims its siblings and reveals
 * nothing, so the sheet is complete on paper and in a PDF. `slot="aside"` takes
 * the `FocusTable` of rankings, the `Readout` stack, or the `Callout` that says
 * what the room should do with the numbers.
 *
 * Alliance colors here belong to `ScoutTable` and resolve only on the FIELD
 * ground, which is where a scouting sheet lives anyway.
 */
export function ScoutingSheet({ transition = 'boot', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  return (
    <Sheet kind="scouting" transition={transition} slots={slots} className={className} data-frc="ScoutingSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-scouting" style={slots.aside ? undefined : { gridTemplateColumns: '1fr' }}>
          <div>{body}</div>
          {slots.aside ? <div className="frc-scouting-aside">{slots.aside}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
