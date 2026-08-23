import { cx } from '../cx.js'

/**
 * TeamWordmark — the typeset TECHMEN · 5669 wordmark for text contexts.
 * It is NOT the logotype: the published Type-*.svg is the mark; this is type.
 * Copy is fixed chrome (the team name and number).
 */
export function TeamWordmark({ number = true, size, as: Tag = 'span', className, style, ...rest }) {
  return (
    <Tag
      className={cx('frc-wordmark', className)}
      style={size ? { fontSize: size, ...style } : style}
      data-frc="TeamWordmark"
      {...rest}
    >
      <span className="frc-wordmark-name">Techmen</span>
      {number ? (
        <>
          <span className="frc-wordmark-sep" aria-hidden="true">·</span>
          <span className="frc-wordmark-number">5669</span>
        </>
      ) : null}
    </Tag>
  )
}
