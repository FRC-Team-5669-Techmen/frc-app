import { cx } from '../cx.js'

/**
 * StencilTitle — gold as a stencil or a struck emblem. Display face, hero color
 * (--fg-hero: gold on the dark grounds, bronze ink on paper), rationed glow
 * (zero on paper by alias), and a stencil bridge cut through the letterforms.
 * Sentence case by default per the casing rule; caps is an opt-in.
 */
export function StencilTitle({ as: Tag = 'h1', size = 'h1', caps = false, bridge = true, glow = true, className, children, ...rest }) {
  return (
    <Tag
      className={cx(
        'frc-stencil',
        size === 'display' && 'frc-stencil-display',
        size === 'hero' && 'frc-stencil-hero',
        caps && 'frc-stencil-caps',
        bridge && 'frc-stencil-bridge',
        !glow && 'frc-stencil-flat',
        className,
      )}
      data-frc="StencilTitle"
      {...rest}
    >
      {children}
    </Tag>
  )
}
