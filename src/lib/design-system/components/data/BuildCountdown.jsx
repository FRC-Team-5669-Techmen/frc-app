import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * BuildCountdown - days to a milestone, at hero scale. Copper inside the
 * warning window, rust once it is due. `unit` is short fixed chrome and is
 * allowed as a prop; the label under it is copy and is a slotted child.
 *
 * It takes a NUMBER, never a date: a deck rendered from a date would read
 * differently in the shop on Tuesday than in the PDF a mentor printed Monday.
 */
export function BuildCountdown({ value = 0, unit = 'days', warnAt = 14, dueAt = 0, as: Tag = 'div', className, children, ...rest }) {
  const state = value <= dueAt ? 'due' : value <= warnAt ? 'warn' : 'rest'
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag className={cx('frc-countdown', className)} data-frc="BuildCountdown" data-state={state} {...rest}>
      <div className="frc-countdown-row">
        <span className="frc-countdown-value frc-numeral">{value}</span>
        <span className="frc-countdown-unit">{unit}</span>
      </div>
      {slotted(slots.label, 'frc-countdown-label')}
      {extra}
    </Tag>
  )
}
