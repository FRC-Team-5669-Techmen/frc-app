import { pickSlots, slotList } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * SeasonSheet - the season, named and framed. Transition `banner`.
 *
 * `slot="lockup"` takes the `SeasonLockup`. Setting `--season` on the deck root
 * and dropping artwork into that lockup is the entire annual reskin - nothing
 * else in the system changes when the season does, which is the point of
 * isolating it.
 *
 * `slot="stat"` repeated is the side column: `StatBlock` children for the
 * numbers that define the season. Season years render `2026-27`, never
 * `2026/2027`.
 */
export function SeasonSheet({ transition = 'banner', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  const stats = slotList(slots.stat)
  return (
    <Sheet kind="season" transition={transition} slots={slots} className={className} data-frc="SeasonSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content frc-sheet-content-center">
        <div className="frc-season-main">
          <div>{slots.lockup}</div>
          <div className="frc-season-side">
            {stats}
            {extra}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
