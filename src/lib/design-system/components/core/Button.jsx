import { forwardRef } from 'react'
import { cx } from '../cx.js'

/**
 * Button — mono, uppercase, wide tracking, 3px radius.
 * Label is the child. Icons are inlined Lucide SVGs passed as elements.
 * Click targets may change emphasis; they may never reveal content.
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon, iconEnd, as, href, type = 'button', className, children, ...rest },
  ref,
) {
  const Tag = as || (href ? 'a' : 'button')
  const tagProps = Tag === 'button' ? { type } : { href }
  return (
    <Tag
      ref={ref}
      className={cx('frc-button', `frc-button-${variant}`, size === 'lg' && 'frc-button-lg', className)}
      data-frc="Button"
      {...tagProps}
      {...rest}
    >
      {icon}
      <span className="frc-button-label">{children}</span>
      {iconEnd}
    </Tag>
  )
})
