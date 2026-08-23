import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

/**
 * AllianceSplit - two alliances, one score line.
 *
 * ONE OF THE THREE components allowed to use --alliance-red / --alliance-blue.
 * They are alliance DATA, never decoration, and they only resolve inside
 * .frc-ground-field; on SQUADRON or paper both sides fall back to structure
 * tones and the RED / BLUE word does the work. That is why the tag is a
 * required slot and not a colour swatch.
 *
 * outcome: "red" | "blue" | null - which side won, marked in --ok, never by
 * making one side louder in its own alliance colour.
 */
export function AllianceSplit({ outcome = null, as: Tag = 'div', className, children, ...rest }) {
  const { slots } = pickSlots(children)
  return (
    <Tag className={cx('frc-alliance', className)} data-frc="AllianceSplit" data-outcome={outcome || undefined} {...rest}>
      <section
        className="frc-alliance-side frc-alliance-red"
        data-outcome={outcome ? (outcome === 'red' ? 'win' : 'loss') : undefined}
      >
        {slotted(slots['red-tag'], 'frc-alliance-tag')}
        {slotted(slots['red-score'], 'frc-alliance-score frc-numeral', 'p')}
        {slotted(slots['red-teams'], 'frc-alliance-teams')}
      </section>
      {slotted(slots.vs, 'frc-alliance-vs')}
      <section
        className="frc-alliance-side frc-alliance-blue"
        data-outcome={outcome ? (outcome === 'blue' ? 'win' : 'loss') : undefined}
      >
        {slotted(slots['blue-tag'], 'frc-alliance-tag')}
        {slotted(slots['blue-score'], 'frc-alliance-score frc-numeral', 'p')}
        {slotted(slots['blue-teams'], 'frc-alliance-teams')}
      </section>
    </Tag>
  )
}
