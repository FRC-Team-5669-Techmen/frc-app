import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * Cutout - treatment three: anything carrying an ALPHA CHANNEL. A part, a tool,
 * a mark, a sponsor logo, an award.
 *
 * No backplate, no grid, no rectangular overlay, no corner brackets, because a
 * cutout has no rectangle to draw. Every grade is a filter chain on the subject
 * itself, so each layer follows the silhouette instead of the slot.
 *
 * ground:
 *   shadow - a resting part, contact shadow on the silhouette
 *   shelf  - a datum line under the part, drawn as a hairline, never a plate
 *   none   - a floating mark. EVERY sponsor logo is this one: a contact shadow
 *            under a corporate mark reads as a rendering error.
 *
 * fit is always "contain". cover crops the silhouette against the slot edge,
 * which is the one reliable way to make an alpha image look framed again, so
 * passing it is refused rather than quietly corrected.
 */
export function Cutout({
  src,
  alt = '',
  ground = 'shadow',
  fit = 'contain',
  width,
  height,
  file,
  as: Tag = 'figure',
  className,
  children,
  ...rest
}) {
  if (fit !== 'contain') {
    throw new Error('Cutout: fit is always "contain". cover crops the silhouette against the slot edge and makes an alpha image look framed again.')
  }
  const { slots, rest: media } = pickSlots(children)
  const hasMedia = Boolean(src) || media.length > 0
  return (
    <Tag
      className={cx('frc-cutout', `frc-cutout-${ground}`, className)}
      data-frc="Cutout"
      data-ground={ground}
      style={{ width, height }}
      {...rest}
    >
      {hasMedia ? (
        <span className="frc-cutout-subject">
          {src ? <img src={src} alt={alt} /> : null}
          {media}
        </span>
      ) : (
        <span className="frc-frame-empty">{file ? `Empty slot - expected ${file}` : 'Empty cutout slot'}</span>
      )}
      {slotted(slots.caption, 'frc-cutout-caption')}
    </Tag>
  )
}
