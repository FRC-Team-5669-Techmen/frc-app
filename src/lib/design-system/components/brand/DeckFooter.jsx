import { ASSETS, ASSET_FILES, MIN_SIZES } from '../../assets.js'
import { cx } from '../cx.js'
import { AssetSlot } from './AssetSlot.jsx'
import { SealMark } from './SealMark.jsx'
import { Logotype } from './Logotype.jsx'
import { MarkGlyph } from './MarkGlyph.jsx'

/**
 * Rail mark height, in CSS px on the 1920x1440 stage.
 *
 * WAS 32, which is 2.2% of the frame height — right at the usual 1/50
 * projection floor, and that floor is for plain type, not for artwork with
 * hairline strokes and tight counters. On a classroom projector the logotype
 * read as a gold smudge. 56px is 3.9% of the frame, and it still fits the rail
 * cleanly: the rail is --rail-h 96px with 8px of bottom padding, so 56 leaves
 * 16px of clearance above and below. It also lands the logotype at 205px wide
 * (LOGOTYPE_RATIO 3.6556), a near match for the 200px FIRST zone in the same
 * rail, and stays UNDER that zone's 60px height so the FIRST lockup is never
 * out-sized by a team mark on an external deck.
 */
const RAIL_MARK_H = 56

/**
 * DeckFooter — the persistent footer rail: the LOGOTYPE, 5669, deck name
 * (+ part), logical sheet number, and the per-part progress rail along the
 * bottom edge.
 *
 * THE RAIL MARK IS THE LOGOTYPE, not the seal. It is horizontal, so it survives
 * rail scale, and it does not duplicate the team number the rail already sets
 * in type — the seal carries 5669 and TECHMEN inside its own ring. `mark="seal"`
 * stays available for a rail on a cover or closing sheet whose sheet body is not
 * already carrying one, and `mark="mark"` puts the winged helmet alone in the
 * rail — no lettering — for a sheet whose body already sets the team name.
 *
 * On .frc-audience-external (deck root, section, or this footer via the
 * audience prop) it adds the FIRST full-color-reverse horizontal logo zone on
 * a flat plate. Ambient layers are clipped out of the whole rail band in
 * surfaces.css, so a FIRST mark never sits on a busy background. The zone
 * enforces the published 30px floor.
 *
 * The footer numbers the LOGICAL sheet: every state of a build chain carries
 * the same number. Props here are short fixed chrome, which is the one case
 * copy is allowed in a prop.
 */
export function DeckFooter({
  deckName,
  part,
  parts = [],
  partIndex = 0,
  sheet,
  total,
  audience,
  mark = 'logotype',
  sealSrc,
  firstLogoSrc = ASSETS.firstHorizontalReverse,
  className,
  ...rest
}) {
  const partName = part ?? parts[partIndex]
  return (
    <footer
      className={cx('frc-footer', audience === 'external' && 'frc-audience-external', className)}
      data-frc="DeckFooter"
      {...rest}
    >
      <div className="frc-footer-seal">
        {mark === 'seal'
          ? <SealMark size={64} src={sealSrc} />
          : mark === 'mark'
            ? <MarkGlyph variant="auto" size={RAIL_MARK_H} />
            : <Logotype variant="auto" height={RAIL_MARK_H} />}
      </div>
      <div className="frc-footer-team" aria-label="Team 5669">5669</div>
      <div className="frc-footer-deck">
        {deckName}
        {partName ? <span className="frc-footer-part">{partName}</span> : null}
      </div>
      <div className="frc-footer-first">
        <AssetSlot
          first
          src={firstLogoSrc}
          file={ASSET_FILES.firstHorizontalReverse}
          width={200}
          height={60}
          minHeight={MIN_SIZES.firstHorizontal.height}
          alt="FIRST"
          label="FIRST horizontal, reverse"
        />
      </div>
      <div className="frc-footer-sheet">
        {sheet}
        {total != null ? <span className="frc-footer-sheet-total"> / {total}</span> : null}
      </div>
      {parts.length > 0 ? (
        <ol className="frc-footer-rail" aria-hidden="true">
          {parts.map((name, i) => (
            <li key={`${i}-${name}`} title={name} data-done={i < partIndex ? '' : undefined} data-current={i === partIndex ? '' : undefined} />
          ))}
        </ol>
      ) : null}
    </footer>
  )
}
