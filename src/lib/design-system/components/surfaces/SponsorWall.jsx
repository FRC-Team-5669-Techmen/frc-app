import { Children, isValidElement } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'
import { Cutout } from './Cutout.jsx'
import { ImageFrame } from './ImageFrame.jsx'

/**
 * SponsorWall / SponsorTier - sponsor marks, tiered.
 *
 * EVERY sponsor mark is a Cutout with ground="none". A sponsor logo is a
 * floating mark: it arrives with an alpha channel, and a contact shadow under a
 * corporate logo reads as a rendering error to the one person in the room most
 * likely to notice. SponsorTier refuses anything else rather than rendering a
 * quietly wrong wall on the closing sheet of an external deck.
 */
export function SponsorWall({ as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: tiers } = pickSlots(children)
  return (
    <Tag className={cx('frc-sponsors', className)} data-frc="SponsorWall" {...rest}>
      {slotted(slots.caption, 'frc-spec-caption')}
      {tiers}
    </Tag>
  )
}

export function SponsorTier({ as: Tag = 'section', className, children, ...rest }) {
  const { slots, rest: marks } = pickSlots(children)
  Children.forEach(marks, (mark) => {
    if (!isValidElement(mark)) return
    if (mark.type === ImageFrame) {
      throw new Error('SponsorTier: a sponsor mark is a Cutout with ground="none", never an ImageFrame. The frame fills the alpha region with its backplate.')
    }
    if (mark.type === Cutout && mark.props.ground !== 'none') {
      throw new Error('SponsorTier: sponsor marks use Cutout ground="none". A contact shadow under a corporate logo reads as a rendering error.')
    }
  })
  return (
    <Tag className={cx('frc-sponsor-tier', className)} data-frc="SponsorTier" {...rest}>
      <header className="frc-sponsor-tier-head">
        {slotted(slots.name, 'frc-sponsor-tier-name')}
        <span className="frc-sponsor-tier-rule" aria-hidden="true" />
      </header>
      <div className="frc-sponsor-row">{marks}</div>
    </Tag>
  )
}
