import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { JumpGrid } from '../surfaces/JumpGrid.jsx'

/**
 * HubSheet - the map of the deck, with one card per part.
 *
 * THE ONE SHEET WITH NO FOOTER RAIL. The format exempts the hub from persistent
 * chrome, so this pattern passes `footer={false}` and reclaims the reserved
 * band. That also means the hub carries no FIRST logo zone - which is correct,
 * because the team identification that a FIRST mark requires lives in the rail
 * this sheet does not have.
 *
 * A jump changes which sheet is on screen. It never reveals content hidden on
 * this one.
 */
export function HubSheet({ transition = 'shutter', cols = 3, className, children, ...rest }) {
  const { slots, rest: cards } = pickSlots(children)
  return (
    <Sheet kind="hub" transition={transition} slots={slots} footer={false} className={className} data-frc="HubSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <JumpGrid cols={cols}>{cards}</JumpGrid>
      </div>
    </Sheet>
  )
}
