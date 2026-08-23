import { pickSlots } from '../slots.jsx'
import { cx } from '../cx.js'
import { Sheet, SheetHead } from './Sheet.jsx'
import { FocusTable, FocusRow } from '../data/FocusTable.jsx'
import { Badge } from '../data/Badge.jsx'

/**
 * BlockerSheet - what is stopping work, who owns it, and what it needs.
 * Transition `boot`.
 *
 * Rows are `Blocker` children in a `FocusTable`, so clicking one dims its
 * siblings while the whole list stays on the sheet. A blocker list that hides
 * rows is how a blocker survives a meeting.
 *
 * `slot="aside"` is for the `Callout` naming the decision the room has to make.
 */
export function BlockerSheet({ transition = 'boot', className, children, ...rest }) {
  const { slots, rest: rows } = pickSlots(children)
  return (
    <Sheet kind="blocker" transition={transition} slots={slots} className={className} data-frc="BlockerSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-blockers" style={slots.aside ? undefined : { gridTemplateColumns: '1fr' }}>
          <FocusTable>{rows}</FocusTable>
          {slots.aside ? <div className="frc-blockers-aside">{slots.aside}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}

/**
 * Blocker - one blocker. `severity` picks the badge tone: `fault` for blocked,
 * `warn` for at risk, `ok` for cleared. Every string is a child.
 */
export function Blocker({ severity = 'fault', id, className, children, ...rest }) {
  const { slots } = pickSlots(children)
  return (
    <FocusRow id={id} className={cx('frc-blocker', className)} data-frc="Blocker" {...rest}>
      <span slot="rank">{slots.state ? <Badge tone={severity}>{slots.state}</Badge> : null}</span>
      {slots.title}
      {slots.owner}
    </FocusRow>
  )
}
