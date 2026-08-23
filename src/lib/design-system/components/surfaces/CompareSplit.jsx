import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * CompareSplit / CompareRow - two options down a shared list of criteria. At
 * 4:3 there is less horizontal room than a widescreen deck, so the copy in each
 * cell has to stay tight; the component does not shrink type to make it fit.
 * lead="a" | "b" marks which side wins THAT row, in hero color, not by hiding
 * the other.
 */
export function CompareSplit({ as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: rows } = pickSlots(children)
  return (
    <Tag className={cx('frc-compare', className)} data-frc="CompareSplit" {...rest}>
      <div className="frc-compare-head">
        {slotted(slots.label, 'frc-compare-label')}
        {slotted(slots['option-a'], 'frc-compare-option')}
        {slotted(slots['option-b'], 'frc-compare-option')}
      </div>
      {rows}
    </Tag>
  )
}

export function CompareRow({ lead, as: Tag = 'div', className, children, ...rest }) {
  const { slots } = pickSlots(children)
  return (
    <Tag className={cx('frc-compare-row', className)} data-frc="CompareRow" data-lead={lead} {...rest}>
      {slotted(slots.label, 'frc-compare-label')}
      {slotted(slots.a, 'frc-compare-cell')}
      {slotted(slots.b, 'frc-compare-cell')}
    </Tag>
  )
}
