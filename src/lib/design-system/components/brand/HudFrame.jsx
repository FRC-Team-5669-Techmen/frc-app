import { cx } from '../cx.js'

/**
 * HudFrame — a framed drawing: 2px hairline with four corner brackets in the
 * active hairline, an optional mono label tab (top-left) and readout (top-right).
 * Label and readout are short fixed chrome (figure label, unit label); the
 * drawing is the child.
 */
export function HudFrame({ label, readout, as: Tag = 'figure', className, children, ...rest }) {
  return (
    <Tag className={cx('frc-hud', (label || readout) && 'frc-hud-labelled', className)} data-frc="HudFrame" {...rest}>
      {label ? <span className="frc-hud-label">{label}</span> : null}
      {readout ? <span className="frc-hud-readout">{readout}</span> : null}
      {children}
    </Tag>
  )
}
