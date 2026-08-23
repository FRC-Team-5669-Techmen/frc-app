import { Children, cloneElement, isValidElement } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

const STATES = { default: null, done: null, current: null, blocked: null }

/**
 * ProcessPipeline / PipelineStep - a left-to-right process: design, cut,
 * assemble, wire, test. Chevron-shaped steps, the last one squared off so the
 * chain reads as finished rather than cut off.
 * Step numbers come from position, so reordering cannot leave a wrong number.
 */
export function ProcessPipeline({ as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: steps } = pickSlots(children)
  let n = 0
  const numbered = Children.map(steps, (child) => {
    if (!isValidElement(child)) return child
    n += 1
    return cloneElement(child, { index: child.props.index ?? n })
  })
  return (
    <Tag className={cx('frc-pipeline', className)} data-frc="ProcessPipeline" {...rest}>
      {slotted(slots.caption, 'frc-spec-caption')}
      {numbered}
    </Tag>
  )
}

export function PipelineStep({ state = 'default', index, as: Tag = 'section', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  const known = state in STATES ? state : 'default'
  return (
    <Tag className={cx('frc-pipeline-step', className)} data-frc="PipelineStep" data-state={known} {...rest}>
      <span className="frc-pipeline-n frc-numeral">{String(index ?? 1).padStart(2, '0')}</span>
      {slotted(slots.title, 'frc-pipeline-title', 'h3')}
      {slotted(slots.note, 'frc-pipeline-note')}
      {extra}
    </Tag>
  )
}
