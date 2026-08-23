import { ASSETS, ASSET_FILES, MIN_SIZES } from '../../assets.js'
import { cx } from '../cx.js'
import { AssetSlot } from './AssetSlot.jsx'
import { SealMark } from './SealMark.jsx'
import { Logotype } from './Logotype.jsx'

/**
 * DeckFooter — the persistent footer rail: seal, 5669, deck name (+ part),
 * logical sheet number, and the per-part progress rail along the bottom edge.
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
  mark = 'seal',
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
        {mark === 'logotype' ? <Logotype variant="auto" height={32} /> : <SealMark size={64} src={sealSrc} />}
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
