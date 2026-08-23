import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/** What the image IS decides the treatment, not where it sits. */
const SHAPE_FOR_KIND = {
  photo: 'rect',
  screenshot: 'rect',
  render: 'brackets',
  equipment: 'brackets',
  drawing: 'brackets',
  portrait: 'round',
}

/**
 * ImageFrame - treatment one: OPAQUE content, edge to edge. Photographs,
 * screenshots, CAD renders, drawings.
 *
 * A TRANSPARENT PNG NEVER GOES IN HERE. The frame fills the alpha region with
 * its backplate and grades it as a rectangle, which is exactly the discolored
 * box around the subject. Use Cutout.
 *
 * The backplate reads from --surface-viewport so a ground scope can retint it.
 * It is never a literal in this component: that is the ground-alias freeze bug
 * reappearing one level down, and it is how a light sheet keeps a dark box.
 *
 * bleed feathers the frame edge into the ground on the named side and drops the
 * rim ring and the corner brackets automatically. It is REFUSED on a
 * screenshot: a feathered interface capture reads as a rendering fault, and the
 * hard edge is what tells the room it is looking at a screen.
 */
export function ImageFrame({
  src,
  alt = '',
  kind = 'photo',
  shape,
  bleed = false,
  ratio,
  height,
  file,
  as: Tag = 'figure',
  className,
  children,
  ...rest
}) {
  if (bleed && kind === 'screenshot') {
    throw new Error('ImageFrame: never bleed a screenshot. The hard edge is what tells the room it is looking at a screen.')
  }
  const side = bleed === true ? 'right' : bleed || null
  const form = shape || SHAPE_FOR_KIND[kind] || 'rect'
  const { slots, rest: media } = pickSlots(children)
  const hasMedia = Boolean(src) || media.length > 0
  return (
    <Tag
      className={cx(
        'frc-frame',
        !side && form === 'brackets' && 'frc-frame-brackets',
        form === 'round' && 'frc-frame-round',
        side && 'frc-frame-bleed',
        side && `frc-frame-bleed-${side}`,
        className,
      )}
      data-frc="ImageFrame"
      data-kind={kind}
      data-shape={form}
      data-bleed={side || undefined}
      {...rest}
    >
      <div className="frc-frame-plate" style={{ aspectRatio: ratio, height }}>
        {src ? <img className="frc-frame-media" src={src} alt={alt} /> : null}
        {media}
        {hasMedia ? null : (
          <div className="frc-frame-empty">{file ? `Empty slot - expected ${file}` : 'Empty image slot'}</div>
        )}
      </div>
      {slotted(slots.caption, 'frc-frame-caption', 'figcaption')}
    </Tag>
  )
}
