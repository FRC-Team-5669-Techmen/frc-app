import { cx } from '../cx.js'

/**
 * StencilTitle — gold as a stencil or a struck emblem. Display face, hero color
 * (--fg-hero: gold on the dark grounds, bronze ink on paper) and rationed glow
 * (zero on paper by alias). Sentence case by default per the casing rule; caps
 * is an opt-in.
 *
 * `bridge` DEFAULTS TO OFF. It draws a hairline of the surface across the
 * letterforms, and the first rendered captures of this system showed why that
 * cannot be the default: at display size, across a whole sentence, it reads as
 * a strikethrough rather than as a stencil. A real stencil bridge is a short
 * gap that keeps a counter from falling out, not a rule through the middle of a
 * title. It stays available for a single struck word, which is what it is for.
 */
export function StencilTitle({ as: Tag = 'h1', size = 'h1', caps = false, bridge = false, glow = true, className, children, ...rest }) {
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
