import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

const TONES = { rank: 'frc-result-rank', win: 'frc-result-win', loss: 'frc-result-loss' }

/**
 * ResultBanner - how a match, a qual run or an inspection came out.
 *
 * The outcome is a WORD in the tag slot; the color agrees with it. Win is --ok
 * and loss is --fault, never alliance red or blue: those two are alliance
 * identity, and using them for an outcome would make a red alliance win look
 * like a loss on the same sheet.
 */
export function ResultBanner({ tone = 'rank', as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag className={cx('frc-result', TONES[tone], className)} data-frc="ResultBanner" data-tone={tone} {...rest}>
      {slotted(slots.tag, 'frc-result-tag')}
      <div>
        {slotted(slots.title, 'frc-result-title', 'h3')}
        {slotted(slots.note, 'frc-result-note')}
      </div>
      {slotted(slots.score, 'frc-result-score frc-numeral')}
      {extra}
    </Tag>
  )
}
