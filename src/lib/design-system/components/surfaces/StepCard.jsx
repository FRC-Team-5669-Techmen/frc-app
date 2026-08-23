import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * StepCard / Step - a numbered procedure. StepCard is the container and numbers
 * its steps with a CSS counter, so inserting a step renumbers the rest and no
 * printed number can go stale.
 * Step state: default | done | current.
 */
export function StepCard({ as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: steps } = pickSlots(children)
  return (
    <Tag className={cx('frc-steps', className)} data-frc="StepCard" {...rest}>
      {slotted(slots.caption, 'frc-spec-caption')}
      {steps}
    </Tag>
  )
}

export function Step({ state = 'default', as: Tag = 'section', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag className={cx('frc-step', className)} data-frc="Step" data-state={state} {...rest}>
      <span className="frc-step-n frc-numeral" aria-hidden="true" />
      <div className="frc-step-body">
        {slotted(slots.title, 'frc-step-title', 'h3')}
        {slotted(slots.text, 'frc-step-text', 'p')}
        {extra}
      </div>
    </Tag>
  )
}
