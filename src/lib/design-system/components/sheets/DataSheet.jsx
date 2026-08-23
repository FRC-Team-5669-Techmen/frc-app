import { pickSlots, slotList } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * DataSheet - numbers with the chart that explains them. Transition `boot`,
 * the HUD de-blur every data and telemetry sheet uses.
 *
 * `slot="stat"` repeated is the stat strip across the top - pass `StatBlock`
 * children, at most four, with at most one `tone="hero"`. The chart, table or
 * matrix is the child. `slot="aside"` takes the readouts or the callout that
 * says what the number means.
 */
export function DataSheet({ transition = 'boot', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  const stats = slotList(slots.stat)
  return (
    <Sheet kind="data" transition={transition} slots={slots} className={className} data-frc="DataSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        {stats.length ? <div className="frc-data-stats">{stats}</div> : null}
        <div className="frc-data-main" data-aside={slots.aside ? '' : undefined}>
          <div>{body}</div>
          {slots.aside ? <div className="frc-procedure-aside">{slots.aside}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
