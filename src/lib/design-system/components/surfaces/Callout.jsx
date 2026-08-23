import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

const TONES = { accent: null, ok: 'frc-callout-ok', warn: 'frc-callout-warn', fault: 'frc-callout-fault', quiet: 'frc-callout-quiet' }

/**
 * Callout - a note that has to out-weigh body copy without becoming a heading.
 * tone: accent | ok | warn | fault | quiet.
 *
 * A SHOP HAZARD IS NOT A CALLOUT. Use SafetyNote: it is a separate component so
 * that scanning a deck for whether safety was covered is a glance, not a read.
 */
export function Callout({ tone = 'accent', icon, as: Tag = 'aside', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  return (
    <Tag className={cx('frc-callout', TONES[tone], className)} data-frc="Callout" data-tone={tone} {...rest}>
      <span className="frc-callout-icon">{icon}</span>
      <div className="frc-callout-body">
        {slotted(slots.title, 'frc-callout-title')}
        {body}
      </div>
    </Tag>
  )
}
