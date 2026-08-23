import { ASSETS, ASSET_FILES, MIN_SIZES } from '../../assets.js'
import { cx } from '../cx.js'
import { AssetSlot } from './AssetSlot.jsx'

/**
 * SealMark — the team seal (helmet + wings inside the gear ring, 5669 / TECHMEN).
 * Covers, closing sheets, anything printed or worn. Used as supplied.
 * Renders an empty slot until assets/team/5669-Seal.svg lands.
 */
export function SealMark({ src = ASSETS.seal, size = 160, alt = 'FRC Team 5669 Techmen seal', className, ...rest }) {
  const s = Math.max(Number(size) || 160, MIN_SIZES.seal.width)
  return (
    <AssetSlot
      src={src}
      file={ASSET_FILES.seal}
      width={s}
      height={s}
      minWidth={MIN_SIZES.seal.width}
      minHeight={MIN_SIZES.seal.height}
      alt={alt}
      label="5669-Seal.svg"
      className={cx('frc-seal', className)}
      data-frc="SealMark"
      {...rest}
    />
  )
}
