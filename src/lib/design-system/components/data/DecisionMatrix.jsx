import { cx } from '../cx.js'
import { pickSlots, slotList, slotted } from '../slots.jsx'

/**
 * DecisionMatrix - weighted criteria against options, with the totals computed
 * rather than typed, so a weight change cannot leave a stale winner on the
 * sheet.
 *
 * `weights` and `scores` stay ARRAY-ONLY on purpose. They are structure, not
 * copy: nobody reads a weight vector aloud, and splitting a matrix of numbers
 * into children moves the endpoints further apart instead of closer to the
 * canvas. Every string - criterion names, option names, the caption - is a
 * slotted child.
 *
 *   <DecisionMatrix weights={[3, 2, 1]} scores={[[4, 3, 5], [5, 2, 2]]}>
 *     <span slot="criterion">Cycle time</span> ...
 *     <span slot="option">Over the bumper</span> ...
 *   </DecisionMatrix>
 */
export function DecisionMatrix({ weights = [], scores = [], className, children, ...rest }) {
  const { slots } = pickSlots(children)
  const criteria = slotList(slots.criterion)
  const options = slotList(slots.option)
  const totals = options.map((_, oi) => (scores[oi] || []).reduce((sum, s, ci) => sum + (Number(s) || 0) * (weights[ci] ?? 1), 0))
  const best = totals.length ? totals.indexOf(Math.max(...totals)) : -1
  return (
    <table className={cx('frc-matrix', className)} data-frc="DecisionMatrix" {...rest}>
      {slots.caption ? <caption className="frc-matrix-caption">{slots.caption}</caption> : null}
      <thead>
        <tr>
          <th>{slots.corner ? slots.corner : null}</th>
          {criteria.map((c, i) => (
            <th key={i} scope="col">
              {c}
              <span className="frc-matrix-weight">{`x${weights[i] ?? 1}`}</span>
            </th>
          ))}
          <th scope="col">{slots.total ? slots.total : 'Total'}</th>
        </tr>
      </thead>
      <tbody>
        {options.map((o, oi) => (
          <tr key={oi} data-winner={oi === best && best >= 0 ? '' : undefined}>
            <th scope="row">{o}</th>
            {criteria.map((_, ci) => <td key={ci}>{scores[oi] && scores[oi][ci] != null ? scores[oi][ci] : ''}</td>)}
            <td className="frc-matrix-total">{totals[oi]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
