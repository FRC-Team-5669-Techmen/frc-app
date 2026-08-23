import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * PartCallout - a COTS part for a BOM or a training sheet: what it is, who
 * sells it, the part number to type into a cart, and what it costs.
 *
 * The part number is mono and untracked so it can be read out digit by digit,
 * and the price is display-face because a budget conversation is a numerals
 * conversation. The image is a Cutout, never an ImageFrame: vendor art arrives
 * with an alpha channel, and framing it draws the discolored box.
 */
export function PartCallout({ as: Tag = 'article', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag className={cx('frc-part', className)} data-frc="PartCallout" {...rest}>
      <div className="frc-part-media">{slots.media}</div>
      <div className="frc-part-body">
        {slotted(slots.name, 'frc-part-name', 'h3')}
        {slotted(slots.vendor, 'frc-part-vendor')}
        <div className="frc-part-spec">
          {slotted(slots.pn, 'frc-part-pn')}
          {slotted(slots.price, 'frc-part-price frc-numeral')}
        </div>
        {slotted(slots.note, 'frc-part-note', 'p')}
        {extra}
      </div>
    </Tag>
  )
}
