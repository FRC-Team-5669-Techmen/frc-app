import { pickSlots, slotted } from '../slots.jsx'
import { hostProps } from '../host.jsx'
import { cx } from '../cx.js'
import { Sheet, SheetHead } from './Sheet.jsx'
import { Card } from '../surfaces/Card.jsx'
import { SubteamBadge } from '../data/SubteamBadge.jsx'
import { Badge } from '../data/Badge.jsx'
import { BarChart, Bar } from '../data/BarChart.jsx'

/**
 * SubteamStatusSheet - where every subteam stands, on one sheet. The weekly
 * meeting sheet. Transition `boot`.
 *
 * Rows are `SubteamStatus` children. Every subteam that exists appears, whether
 * or not it has news: a subteam missing from the grid reads as a subteam nobody
 * is tracking, which is the exact failure this sheet is meant to catch.
 */
export function SubteamStatusSheet({ transition = 'boot', cols = 3, className, children, ...rest }) {
  const { slots, rest: cards } = pickSlots(children)
  return (
    <Sheet kind="subteam" transition={transition} slots={slots} className={className} data-frc="SubteamStatusSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-subteam-grid" style={{ '--cols': cols }}>{cards}</div>
        {slots.foot ? <div className="frc-sheet-foot">{slots.foot}</div> : null}
      </div>
    </Sheet>
  )
}

/**
 * SubteamStatus - one subteam: its name, a status word, progress, and the one
 * line that says what is actually happening.
 * `progress` and `max` are structural numbers; every string is a child.
 */
export function SubteamStatus({ tone = 'default', progress, max = 100, className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Card className={cx('frc-subteam-card', className)} data-frc="SubteamStatus" {...rest}>
      <div className="frc-subteam-card-head">
        {slots.subteam ? <SubteamBadge>{hostProps(slots.subteam)?.children ?? slots.subteam}</SubteamBadge> : null}
        {slots.status ? <Badge tone={tone}>{slots.status}</Badge> : null}
      </div>
      {progress != null ? (
        <BarChart max={max}>
          <Bar value={progress} tone={tone === 'default' ? 'quiet' : tone}>
            {slots.metric ? slots.metric : <span slot="label">Progress</span>}
          </Bar>
        </BarChart>
      ) : null}
      {slotted(slots.note, 'frc-card-body', 'p')}
      {extra}
    </Card>
  )
}
