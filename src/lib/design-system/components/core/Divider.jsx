import { cx } from '../cx.js'
import { ChevronRail } from './ChevronRail.jsx'

/**
 * Divider — the rule between blocks.
 * variant auto (default): a hairline everywhere except SQUADRON, where chevrons
 * replace the generic divider. Both are rendered; the ground scope picks one in
 * CSS, so the choice is made by construction and needs no JS.
 * variant line | chevron forces one.
 */
export function Divider({ variant = 'auto', strong = false, tone = 'accent', className, ...rest }) {
  return (
    <div
      role="separator"
      className={cx(
        'frc-divider',
        variant === 'auto' ? 'frc-divider-auto' : `frc-divider-force-${variant}`,
        strong && 'frc-divider-strong',
        className,
      )}
      data-frc="Divider"
      {...rest}
    >
      <div className="frc-divider-line" />
      <div className="frc-divider-chevron">
        <ChevronRail tone={tone} height={10} />
      </div>
    </div>
  )
}
