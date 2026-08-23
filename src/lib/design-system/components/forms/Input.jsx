import { forwardRef, useId } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * Input - a single-line control (or a textarea with as="textarea").
 *
 * The label and the hint are copy and arrive as slotted children; the control
 * itself takes the ordinary input props. A deck rarely collects typing, but a
 * pit checklist, a scouting mockup and a training worksheet all need a control
 * that belongs to this system rather than to the browser.
 *
 *   <Input name="team"><span slot="label">Team number</span><span slot="hint">Digits only</span></Input>
 */
export const Input = forwardRef(function Input(
  { as: Tag = 'input', type = 'text', mono = false, size = 'md', invalid = false, id, className, children, ...rest },
  ref,
) {
  const auto = useId()
  const controlId = id || auto
  const { slots } = pickSlots(children)
  return (
    <div className={cx('frc-control', className)} data-frc="Input" data-invalid={invalid ? '' : undefined}>
      {slots.label ? slotted(slots.label, 'frc-control-label', 'label', undefined) : null}
      <Tag
        ref={ref}
        id={controlId}
        className={cx('frc-input', mono && 'frc-input-mono', size === 'lg' && 'frc-input-lg')}
        aria-invalid={invalid ? true : undefined}
        {...(Tag === 'input' ? { type } : {})}
        {...rest}
      />
      {slotted(slots.hint, 'frc-control-hint')}
    </div>
  )
})
