import { forwardRef, useId } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * Select - a choice control. The options are ordinary <option> children, so the
 * choices stay editable copy; the label and hint are slotted children.
 *
 * The caret is the mono geometric glyph, never an icon file and never an emoji.
 *
 *   <Select><span slot="label">Subteam</span><option>Mechanical</option></Select>
 */
export const Select = forwardRef(function Select(
  { invalid = false, id, className, children, ...rest },
  ref,
) {
  const auto = useId()
  const controlId = id || auto
  const { slots, rest: options } = pickSlots(children)
  return (
    <div className={cx('frc-control', className)} data-frc="Select" data-invalid={invalid ? '' : undefined}>
      {slots.label ? slotted(slots.label, 'frc-control-label', 'label', undefined) : null}
      <span className="frc-select-wrap">
        <select ref={ref} id={controlId} className="frc-select" aria-invalid={invalid ? true : undefined} {...rest}>
          {options}
        </select>
        <span className="frc-select-caret" aria-hidden="true">{'\u25BE'}</span>
      </span>
      {slotted(slots.hint, 'frc-control-hint')}
    </div>
  )
})
