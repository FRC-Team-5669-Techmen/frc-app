import { isValidElement } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'
import { throughHost } from '../host.jsx'
import { fault } from '../guard.jsx'
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
 *
 * The refusal renders a visible rust fault marker and throws only inside the
 * dev harness. See components/guard.jsx for why.
 *
 * The mark is read THROUGH any runtime host wrapping it. Left as a direct-child
 * type check this guard did not trip on a hosted deck, it stopped guarding —
 * failing open, which is the worse of the two failures.
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
  let bad = null
  marks.forEach((node) => {
    if (bad) return
    const mark = throughHost(node)
    if (!isValidElement(mark)) return
    if (mark.type === ImageFrame) {
      bad = 'An ImageFrame fills the alpha region with its backplate. Use Cutout ground="none".'
    } else if (mark.type === Cutout && mark.props.ground !== 'none') {
      bad = `A sponsor mark is a floating mark; ground="${mark.props.ground}" puts a contact shadow under a corporate logo.`
    }
  })
  if (bad) return fault('SponsorTier', 'Every sponsor mark is a Cutout with ground="none".', bad)
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
