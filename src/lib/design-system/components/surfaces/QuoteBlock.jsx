import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * QuoteBlock - a student, mentor, judge or sponsor said this. Display face at
 * sub scale rather than hero, because a quote is read, not chanted.
 * No decorative quotation glyph: the rule and the attribution do that work, and
 * a giant punctuation mark is the one piece of chrome that dates a deck fastest.
 */
export function QuoteBlock({ as: Tag = 'figure', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag className={cx('frc-quote', className)} data-frc="QuoteBlock" {...rest}>
      <span className="frc-quote-rule" aria-hidden="true" />
      {slotted(slots.text, 'frc-quote-text', 'blockquote')}
      <figcaption className="frc-quote-attr">
        {slotted(slots.attr, 'frc-quote-name')}
        {slotted(slots.role, 'frc-quote-role')}
      </figcaption>
      {extra}
    </Tag>
  )
}
