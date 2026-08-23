import { ASSETS, ASSET_FILES, MIN_SIZES } from '../../assets.js'
import { cx } from '../cx.js'
import { AssetSlot } from './AssetSlot.jsx'

const VARIANTS = {
  gold:  { asset: 'typeGold',  file: ASSET_FILES.typeGold },
  white: { asset: 'typeWhite', file: ASSET_FILES.typeWhite },
  black: { asset: 'typeBlack', file: ASSET_FILES.typeBlack },
}

/**
 * Logotype — the mark locked up with the TECHMEN wordmark. Footer rail use.
 * variant: gold | white | black | auto (gold on dark grounds, black on paper).
 * The slot is height-driven; its width is a placeholder until Type-*.svg
 * supplies the real aspect ratio.
 */
export function Logotype({ variant = 'gold', src, height = 48, width, alt = 'Techmen logotype', className, ...rest }) {
  const h = Math.max(Number(height) || 48, MIN_SIZES.logotype.height)
  const w = width ?? Math.round(h * 5)
  if (variant === 'auto') {
    return (
      <span className={cx('frc-mark-auto', className)} data-frc="Logotype" data-variant="auto" {...rest}>
        <AssetSlot data-variant="gold"  src={ASSETS.typeGold}  file={VARIANTS.gold.file}  width={w} height={h} alt={alt} />
        <AssetSlot data-variant="black" src={ASSETS.typeBlack} file={VARIANTS.black.file} width={w} height={h} alt={alt} />
      </span>
    )
  }
  const v = VARIANTS[variant] || VARIANTS.gold
  return (
    <AssetSlot
      src={src ?? ASSETS[v.asset]}
      file={v.file}
      width={w}
      height={h}
      minWidth={MIN_SIZES.logotype.width}
      minHeight={MIN_SIZES.logotype.height}
      alt={alt}
      className={cx('frc-logotype', className)}
      data-frc="Logotype"
      data-variant={variant}
      {...rest}
    />
  )
}
