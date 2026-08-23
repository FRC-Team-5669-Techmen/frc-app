import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

const TONES = { default: null, ok: 'frc-readout-ok', warn: 'frc-readout-warn', fault: 'frc-readout-fault' }

/**
 * Readout - a telemetry line: key, leader, value. Mono end to end with tabular
 * numerals, so a column of them lines up without a table.
 *   <Readout><span slot="label">Battery</span><span slot="value">12.4 V</span></Readout>
 */
export function Readout({ tone = 'default', as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag className={cx('frc-readout', TONES[tone], className)} data-frc="Readout" data-tone={tone} {...rest}>
      {slotted(slots.label, 'frc-readout-label')}
      <span className="frc-readout-leader" aria-hidden="true" />
      {slotted(slots.value, 'frc-readout-value')}
      {extra}
    </Tag>
  )
}
