import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * ComparisonSheet - two options, one decision.
 *
 * Pass a `CompareSplit` (criteria down the side) or a `DecisionMatrix`
 * (weighted scoring) as the child; the sheet supplies the head, the rhythm and
 * the verdict line. `slot="verdict"` is where the `Badge`, `Callout` or
 * `ResultBanner` that names the decision goes.
 *
 * Both options stay fully rendered. A comparison that dims the loser to nothing
 * is an argument, not a comparison.
 */
export function ComparisonSheet({ transition = 'shutter', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  return (
    <Sheet kind="comparison" transition={transition} slots={slots} className={className} data-frc="ComparisonSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-comparison">
          {body}
          {slots.verdict ? <div className="frc-comparison-verdict">{slots.verdict}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
