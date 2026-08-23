import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * FieldSheet - the field from above, with the zones a strategy conversation
 * points at. Transition `boot`.
 *
 * The child is the `FieldDiagram`: zone geometry is structural and stays an
 * array, every zone label is a child. Clicking a zone raises it and dims the
 * others; nothing appears that was not already drawn.
 *
 * `slot="aside"` is for the cycle notes, the `Readout` stack, or the callouts
 * that name what happens in each zone.
 */
export function FieldSheet({ transition = 'boot', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  return (
    <Sheet kind="field" transition={transition} slots={slots} className={className} data-frc="FieldSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-field-main" style={slots.aside ? undefined : { gridTemplateColumns: '1fr' }}>
          <div>{body}</div>
          {slots.aside ? <div className="frc-field-aside">{slots.aside}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
