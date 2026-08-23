import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * MatchBreakdownSheet - one match, taken apart. Transition `boot`.
 *
 * THE FOURTH AND LAST PLACE ALLIANCE RED AND BLUE ARE LEGAL, after
 * `AllianceSplit`, `ScoutTable` and `FieldDiagram`. The colors are alliance
 * DATA, never decoration, and they only resolve inside `.frc-ground-field`; on
 * SQUADRON or paper the panels fall back to structure tones and the RED / BLUE
 * words carry the meaning. That scoping lives in tokens/data.css with the other
 * three, so this sheet never names a ground.
 *
 * `slot="score"` takes the `AllianceSplit`. `slot="clock"` takes the
 * `MatchClock`, which renders a time and never runs one. `slot="red"` and
 * `slot="blue"` take the per-alliance breakdown - a `SpecTable` each - and the
 * child is the scouting table or the notes.
 */
export function MatchBreakdownSheet({ transition = 'boot', className, children, ...rest }) {
  const { slots, rest: body } = pickSlots(children)
  return (
    <Sheet kind="match" transition={transition} slots={slots} className={className} data-frc="MatchBreakdownSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-match">
          <div className="frc-match-head">
            <div>{slots.score}</div>
            {slots.clock ? <div>{slots.clock}</div> : null}
          </div>
          {slots.red || slots.blue ? (
            <div className="frc-match-detail">
              <div className="frc-match-side" data-alliance="red">{slots.red}</div>
              <div className="frc-match-side" data-alliance="blue">{slots.blue}</div>
            </div>
          ) : null}
          {body}
        </div>
      </div>
    </Sheet>
  )
}
