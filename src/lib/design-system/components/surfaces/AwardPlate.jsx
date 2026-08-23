import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * AwardPlate - one award, struck rather than printed: a raised plate, a hero
 * name, the event and the year underneath.
 * The award name is the one place a sheet may run hero type centered; on paper
 * the accent flattens to bronze ink and the glow to nothing, by alias.
 */
export function AwardPlate({ as: Tag = 'section', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag className={cx('frc-award', className)} data-frc="AwardPlate" {...rest}>
      {slotted(slots.eyebrow, 'frc-award-eyebrow')}
      {slotted(slots.name, 'frc-award-name', 'h3')}
      {slotted(slots.event, 'frc-award-event')}
      {slotted(slots.year, 'frc-award-year')}
      {extra}
    </Tag>
  )
}
