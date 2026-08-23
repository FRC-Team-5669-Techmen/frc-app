import { pickSlots } from '../slots.jsx'
import { Sheet, SheetHead } from './Sheet.jsx'

/**
 * SplitSheet - copy on one side, a visual aid on the other. The workhorse of
 * the density floor: two thirds of sheets carry a visual aid, and this is the
 * pattern most of them use.
 *
 * `media="right"` moves the aid; `weight="media" | "copy"` shifts the ratio.
 * At 4:3 there is less horizontal room than a widescreen deck, so the copy side
 * has to stay tight - the pattern will not shrink type to rescue a paragraph.
 *
 * Pass the aid as `slot="media"`: an `ImageFrame`, a `Cutout`, a
 * `CalloutDrawing`, a chart, a `SpecTable`. Everything else you pass is copy.
 */
export function SplitSheet({ transition = 'shutter', media = 'left', weight = 'even', className, children, ...rest }) {
  const { slots, rest: copy } = pickSlots(children)
  return (
    <Sheet kind="split" transition={transition} slots={slots} className={className} data-frc="SplitSheet" {...rest}>
      <SheetHead slots={slots} />
      <div className="frc-sheet-content">
        <div className="frc-split" data-media={media} data-weight={weight === 'even' ? undefined : weight}>
          <div className="frc-split-media">{slots.media}</div>
          <div className="frc-split-copy">{copy}</div>
        </div>
      </div>
    </Sheet>
  )
}
