import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * RosterSheet - who is on this team and what they are cleared to run.
 *
 * Members are `RoleCard` children, which carry subteams from the one shared
 * vocabulary and certifications in the app model (certified / in progress,
 * safety-critical flagged) - as props and children, never as a query.
 *
 * Four cards is the ceiling at 4:3. A full roster is several sheets, or a
 * `SpecTable` of names with a `SubteamBadge` per row.
 */
export function RosterSheet({ transition = 'shutter', cols = 2, className, children, ...rest }) {
  const { slots, rest: cards } = pickSlots(children)
  return (
    <Sheet kind="roster" transition={transition} slots={slots} className={className} data-frc="RosterSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-roster" style={{ '--cols': cols }}>{cards}</div>
        {slots.foot ? <div className="frc-sheet-foot">{slots.foot}</div> : null}
      </div>
    </Sheet>
  )
}
