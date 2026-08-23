import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * Timeline / TimelineItem - a season, a build week, an event day. The rail is
 * drawn by the container; each item carries its own state marker.
 * state: default | done | current | risk
 */
export function Timeline({ as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: items } = pickSlots(children)
  return (
    <Tag className={cx('frc-timeline', className)} data-frc="Timeline" {...rest}>
      {slotted(slots.caption, 'frc-spec-caption')}
      {items}
    </Tag>
  )
}

export function TimelineItem({ state = 'default', as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag className={cx('frc-timeline-item', className)} data-frc="TimelineItem" data-state={state} {...rest}>
      {slotted(slots.when, 'frc-timeline-when')}
      {slotted(slots.title, 'frc-timeline-title', 'h3')}
      {slotted(slots.body, 'frc-timeline-body', 'p')}
      {extra}
    </Tag>
  )
}
