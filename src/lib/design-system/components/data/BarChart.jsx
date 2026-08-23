import { createContext, useContext } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

const BarCtx = createContext({ max: 100, target: null })
const TONES = { default: null, ok: 'frc-bar-ok', warn: 'frc-bar-warn', fault: 'frc-bar-fault', quiet: 'frc-bar-quiet' }

/**
 * BarChart / Bar - horizontal bars against a shared scale. `max` and `target`
 * are structure and live on the chart as numbers; every label is a slotted
 * child. The value number is structure too, but the printed value string is
 * copy, so it can be overridden with <span slot="value">.
 */
export function BarChart({ max = 100, target = null, as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: bars } = pickSlots(children)
  return (
    <BarCtx.Provider value={{ max, target }}>
      <Tag className={cx('frc-bars', className)} data-frc="BarChart" {...rest}>
        {slotted(slots.caption, 'frc-spec-caption')}
        {bars}
      </Tag>
    </BarCtx.Provider>
  )
}

export function Bar({ value = 0, tone = 'default', className, children, ...rest }) {
  const { max, target } = useContext(BarCtx)
  const { slots } = pickSlots(children)
  const span = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const mark = target != null && max > 0 ? Math.max(0, Math.min(100, (target / max) * 100)) : null
  return (
    <div className={cx('frc-bar', TONES[tone], className)} data-frc="Bar" data-tone={tone} {...rest}>
      {slotted(slots.label, 'frc-bar-label')}
      <div className="frc-bar-track">
        <div className="frc-bar-fill" style={{ '--pct': span }} />
        {mark != null ? <div className="frc-bar-target" style={{ '--target': mark }} /> : null}
      </div>
      {slots.value ? slotted(slots.value, 'frc-bar-value') : <span className="frc-bar-value frc-numeral">{value}</span>}
    </div>
  )
}
