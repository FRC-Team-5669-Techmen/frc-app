import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { BarChart } from '../data/BarChart.jsx'

/**
 * TargetsSheet - what the team said it would hit, and where it actually is.
 * Transition `boot`.
 *
 * The bars are `Bar` children against one shared scale; `max` and `target` are
 * structural numbers on the sheet, so a target moves in one place. The aside
 * (`slot="aside"`) is where the `BuildCountdown` goes - a target without a date
 * attached to it is a wish.
 */
export function TargetsSheet({ transition = 'boot', max = 100, target = null, className, children, ...rest }) {
  const { slots, rest: bars } = pickSlots(children)
  return (
    <Sheet kind="targets" transition={transition} slots={slots} className={className} data-frc="TargetsSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-targets" style={slots.aside ? undefined : { gridTemplateColumns: '1fr' }}>
          <BarChart max={max} target={target}>{bars}</BarChart>
          {slots.aside ? <div className="frc-targets-aside">{slots.aside}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
