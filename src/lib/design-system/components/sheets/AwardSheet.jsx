import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * AwardSheet - what the team won and what it was for. Transition `banner`: an
 * award sheet is a statement, not a data sheet.
 *
 * `slot="plate"` takes the `AwardPlate`. The side takes what the award actually
 * means - a `QuoteBlock` from the judges, a `ResultBanner`, a `Readout` stack -
 * as ordinary children.
 *
 * The award name is the one place a sheet may run centered hero type. On paper
 * the accent flattens to bronze ink and the glow to nothing, by alias, so this
 * pattern needs no print variant.
 */
export function AwardSheet({ transition = 'banner', className, children, ...rest }) {
  const { slots, rest: side } = pickSlots(children)
  return (
    <Sheet kind="award" transition={transition} slots={slots} className={className} data-frc="AwardSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content frc-sheet-content-center">
        <div className="frc-award-main">
          <div>{slots.plate}</div>
          <div className="frc-award-side">{side}</div>
        </div>
      </div>
    </Sheet>
  )
}
