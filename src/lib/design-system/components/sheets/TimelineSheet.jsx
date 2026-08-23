import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { Timeline } from '../data/Timeline.jsx'

/**
 * TimelineSheet - the arc of a season, a build, or an event day.
 *
 * Items are `TimelineItem` children, each carrying its own state: `done`,
 * `current`, `risk`. Transition `shutter`, because a timeline is narrative
 * content - a timetable of clock times is a `ScheduleSheet`, and that one boots.
 *
 * No dates in the sheet title. A date belongs in `slot="when"` on the item,
 * where moving a meeting costs one edit.
 */
export function TimelineSheet({ transition = 'shutter', className, children, ...rest }) {
  const { slots, rest: items } = pickSlots(children)
  return (
    <Sheet kind="timeline" transition={transition} slots={slots} className={className} data-frc="TimelineSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-timeline-main" data-columns={slots.aside ? undefined : '1'}>
          <Timeline>{items}</Timeline>
          {slots.aside ? <div className="frc-procedure-aside">{slots.aside}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
