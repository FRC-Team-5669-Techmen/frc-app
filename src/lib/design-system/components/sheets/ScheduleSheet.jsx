import { pickSlots, slotList } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * ScheduleSheet - who is where, when. Meeting weeks, an event day, a build
 * calendar. Transition `boot`: a schedule is read as data, not as narrative.
 *
 * Pass a `GanttChart` (or a `SpecTable` of times) as the child. `slot="key"`
 * repeated is the legend - `Chip` or `Badge` children naming what a lane state
 * means. `slot="foot"` takes the note about what changes if a meeting moves.
 */
export function ScheduleSheet({ transition = 'boot', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  const keys = slotList(slots.key)
  return (
    <Sheet kind="schedule" transition={transition} slots={slots} className={className} data-frc="ScheduleSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-schedule-main">
          {body}
          {keys.length ? <div className="frc-schedule-legend">{keys}</div> : null}
          {slots.foot ? <div className="frc-sheet-foot">{slots.foot}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
