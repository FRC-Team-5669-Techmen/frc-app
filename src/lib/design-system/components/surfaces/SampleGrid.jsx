import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * SampleGrid / Sample - a set of material, finish, print or livery samples.
 * The media well reads from --surface-viewport, the same backplate token
 * ImageFrame uses, so a sample sheet retints with the ground.
 */
export function SampleGrid({ cols = 4, as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: samples } = pickSlots(children)
  return (
    <Tag className={cx('frc-samples', className)} data-frc="SampleGrid" style={{ '--cols': cols }} {...rest}>
      {slotted(slots.caption, 'frc-spec-caption')}
      {samples}
    </Tag>
  )
}

export function Sample({ src, alt = '', as: Tag = 'figure', className, children, ...rest }) {
  const { slots, rest: media } = pickSlots(children)
  return (
    <Tag className={cx('frc-sample', className)} data-frc="Sample" {...rest}>
      <div className="frc-sample-media">
        {src ? <img src={src} alt={alt} /> : null}
        {media}
      </div>
      {slotted(slots.name, 'frc-sample-name')}
      {slotted(slots.note, 'frc-sample-note', 'figcaption')}
    </Tag>
  )
}
