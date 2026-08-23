import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * Field - a label and its value. Both are copy, so both are children:
 *   <Field><span slot="label">Weight</span><span slot="value">118 lb</span></Field>
 */
export function Field({ inline = false, mono = false, as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag
      className={cx('frc-field', inline && 'frc-field-inline', mono && 'frc-field-mono', className)}
      data-frc="Field"
      {...rest}
    >
      {slotted(slots.label, 'frc-field-label')}
      {slotted(slots.value, 'frc-field-value')}
      {extra}
    </Tag>
  )
}
