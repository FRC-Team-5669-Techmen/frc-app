import { cx } from '../cx.js'

const TONES = {
  default: null,
  ok: 'frc-badge-ok',
  warn: 'frc-badge-warn',
  fault: 'frc-badge-fault',
  accent: 'frc-badge-accent',
  program: 'frc-badge-program',
}

/**
 * Badge - a status, spoken in WORDS on a colored pill. Never an emoji, never a
 * bare colored dot with no label: the word is what survives a projector, a
 * grayscale print and a colorblind reader. The state dot is the one circular
 * token the small-radius rule exempts.
 * The label is the child.
 */
/** The badge contract as PROPS, so a slot can be painted with a badge instead of
 *  wrapped in one. See `slottedWith` in slots.jsx for why that matters. */
export function badgeProps({ tone = 'default', solid = false, dot = true, className } = {}) {
  return {
    className: cx('frc-badge', TONES[tone], solid && 'frc-badge-solid', !dot && 'frc-badge-plain', className),
    'data-frc': 'Badge',
    'data-tone': tone,
  }
}

export function Badge({ tone = 'default', solid = false, dot = true, as: Tag = 'span', className, children, ...rest }) {
  return (
    <Tag
      className={cx('frc-badge', TONES[tone], solid && 'frc-badge-solid', !dot && 'frc-badge-plain', className)}
      data-frc="Badge"
      data-tone={tone}
      {...rest}
    >
      {children}
    </Tag>
  )
}
