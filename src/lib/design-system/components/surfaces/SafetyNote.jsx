import { cx } from '../cx.js'
import { pickSlots, slotList, slotted } from '../slots.jsx'

/**
 * SafetyNote - the copper shop-hazard note.
 *
 * It is its OWN component rather than a Callout variant because of how it gets
 * read: someone scanning a training deck to answer "did this session cover
 * safety" must be able to answer from the thumbnail rail. A tone prop on a
 * generic callout does not survive that scan, and it lets a hazard be softened
 * to a note by changing one word.
 *
 * The hazard band and the copper frame are not optional and there is no quiet
 * variant.
 */
export function SafetyNote({ as: Tag = 'aside', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  const rules = slotList(slots.rule)
  const ppe = slotList(slots.ppe)
  return (
    <Tag className={cx('frc-safety', className)} data-frc="SafetyNote" role="note" {...rest}>
      <div className="frc-safety-band" aria-hidden="true" />
      <header className="frc-safety-head">
        {slots.title ? slotted(slots.title, 'frc-safety-title', 'h3') : <h3 className="frc-safety-title">Safety</h3>}
      </header>
      {body.length ? <div className="frc-safety-body">{body}</div> : null}
      {rules.length ? <ul className="frc-safety-list">{rules.map((r, i) => slotted(r, null, 'li', i))}</ul> : null}
      {ppe.length ? <div className="frc-safety-ppe">{ppe}</div> : null}
    </Tag>
  )
}
