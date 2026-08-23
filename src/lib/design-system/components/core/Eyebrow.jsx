import { cx } from '../cx.js'

/**
 * Eyebrow — mono label above a title. UPPERCASE, wide tracking, leading tick.
 * tone: default (ash) | accent (gold tick, body text) | live (pulsing gold dot) | plain (no tick)
 * Gold is never the text color here: the tick carries it.
 */
export function Eyebrow({ tone = 'default', as: Tag = 'p', className, children, ...rest }) {
  return (
    <Tag
      className={cx(
        'frc-eyebrow',
        tone === 'accent' && 'frc-eyebrow-accent',
        tone === 'live' && 'frc-eyebrow-live frc-pulse',
        tone === 'plain' && 'frc-eyebrow-plain',
        className,
      )}
      data-frc="Eyebrow"
      {...rest}
    >
      {children}
    </Tag>
  )
}
