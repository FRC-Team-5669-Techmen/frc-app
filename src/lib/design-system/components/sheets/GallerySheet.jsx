import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'
import { SampleGrid } from '../surfaces/SampleGrid.jsx'

/**
 * GallerySheet - a set: build photos, finishes, liveries, outreach events.
 *
 * Items are `Sample` children, so every tile gets the same media well and the
 * same caption treatment and the set reads as a set. Follow the standing
 * photography direction - dark or neutral background, single light source upper
 * left, straight on, consistent framing - or the grid will show the difference.
 */
export function GallerySheet({ transition = 'shutter', cols = 4, className, children, ...rest }) {
  const { slots, rest: items } = pickSlots(children)
  return (
    <Sheet kind="gallery" transition={transition} slots={slots} className={className} data-frc="GallerySheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-gallery">
          <SampleGrid cols={cols}>{items}</SampleGrid>
        </div>
      </div>
    </Sheet>
  )
}
