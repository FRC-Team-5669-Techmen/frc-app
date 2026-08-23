import { createContext, useContext } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotList, slotted } from '../slots.jsx'

const GanttCtx = createContext({ today: null })
const STATES = { default: null, done: 'frc-gantt-bar-done', risk: 'frc-gantt-bar-risk', blocked: 'frc-gantt-bar-blocked' }

/**
 * GanttChart / GanttBar - the build schedule. Column count and the today marker
 * are structure (numbers); the scale ticks and every row label are slotted
 * children:
 *   <GanttChart cols={6} today={48}>
 *     <span slot="tick">Wk 1</span> ...
 *     <GanttBar start={0} span={34} state="done"><span slot="label">Drivetrain</span></GanttBar>
 *   </GanttChart>
 * start and span are percentages of the whole span, so a schedule can be
 * re-scaled without touching a single string.
 */
export function GanttChart({ cols = 6, today = null, as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: rows } = pickSlots(children)
  const ticks = slotList(slots.tick)
  return (
    <GanttCtx.Provider value={{ today }}>
      <Tag className={cx('frc-gantt', className)} data-frc="GanttChart" style={{ '--cols': cols }} {...rest}>
        <div className="frc-gantt-head">
          <span />
          <div className="frc-gantt-scale">{ticks.map((t, i) => slotted(t, 'frc-gantt-tick', 'span', i))}</div>
        </div>
        {rows}
      </Tag>
    </GanttCtx.Provider>
  )
}

export function GanttBar({ start = 0, span = 10, state = 'default', className, children, ...rest }) {
  const { today } = useContext(GanttCtx)
  const { slots } = pickSlots(children)
  return (
    <div className={cx('frc-gantt-row', className)} data-frc="GanttBar" data-state={state} {...rest}>
      {slotted(slots.label, 'frc-gantt-label')}
      <div className="frc-gantt-lane">
        <div className={cx('frc-gantt-bar', STATES[state])} style={{ '--start': start, '--span': span }}>
          {slotted(slots.bar, null)}
        </div>
        {today != null ? <div className="frc-gantt-today" style={{ '--at': today }} /> : null}
      </div>
    </div>
  )
}
