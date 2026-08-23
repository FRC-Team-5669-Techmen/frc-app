import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * Card - the general panel. It takes the ground depth treatment: SQUADRON
 * plates rise above the black, FIELD panels recess into the instrument, paper
 * is a flat hairline. Title, meta and footer are slotted children; everything
 * else you pass is the body.
 */
export function Card({ flush = false, as: Tag = 'section', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  return (
    <Tag className={cx('frc-card', flush && 'frc-card-flush', className)} data-frc="Card" {...rest}>
      {slots.title || slots.meta ? (
        <header className="frc-card-head">
          {slotted(slots.title, 'frc-card-title', 'h3')}
          {slotted(slots.meta, 'frc-card-meta')}
        </header>
      ) : null}
      {body}
      {slots.foot ? <footer className="frc-card-foot">{slots.foot}</footer> : null}
    </Tag>
  )
}
