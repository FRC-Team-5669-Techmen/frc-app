import { pickSlots, slotList } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * BOMSheet - what a mechanism is made of and what it costs. Transition `boot`.
 *
 * Parts are `PartCallout` children: vendor, part number, price, and a `Cutout`
 * of the vendor art - never an `ImageFrame`, because vendor art arrives with an
 * alpha channel and framing it draws the discolored box.
 *
 * `slot="totals"` takes the `SpecTable` of subtotal, shipping and total, and
 * `slot="aside"` the note about lead times. A BOM sheet without a total is a
 * parts list.
 */
export function BOMSheet({ transition = 'boot', className, children, ...rest }) {
  const { slots, rest: parts } = pickSlots(children)
  const aside = [...slotList(slots.totals), ...slotList(slots.aside)]
  return (
    <Sheet kind="bom" transition={transition} slots={slots} className={className} data-frc="BOMSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-bom" style={aside.length ? undefined : { gridTemplateColumns: '1fr' }}>
          <div className="frc-bom-parts">{parts}</div>
          {aside.length ? <div className="frc-bom-aside">{aside}</div> : null}
        </div>
      </div>
    </Sheet>
  )
}
