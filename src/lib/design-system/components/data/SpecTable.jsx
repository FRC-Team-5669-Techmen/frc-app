import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * SpecTable / SpecRow - the spec sheet shape: a label on the left, a measured
 * value on the right, a hairline between. Rows are CHILD COMPONENTS and every
 * string inside them is a slotted child, because copy in a props array is not
 * editable on the canvas.
 */
export function SpecTable({ as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: rows } = pickSlots(children)
  return (
    <Tag className={cx('frc-spec', className)} data-frc="SpecTable" {...rest}>
      {slotted(slots.caption, 'frc-spec-caption')}
      {rows}
    </Tag>
  )
}

export function SpecRow({ emphasis = false, as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag
      className={cx('frc-spec-row', className)}
      data-frc="SpecRow"
      data-emphasis={emphasis ? '' : undefined}
      {...rest}
    >
      {slotted(slots.label, 'frc-spec-label')}
      {slotted(slots.value, 'frc-spec-value')}
      {slotted(slots.note, 'frc-spec-note')}
      {extra}
    </Tag>
  )
}
