import { ASSETS, ASSET_FILES, MIN_SIZES } from '../../assets.js'
import { cx } from '../cx.js'
import { AssetSlot } from './AssetSlot.jsx'

const VARIANTS = {
  gold:  { asset: 'markGold',  file: ASSET_FILES.markGold },
  white: { asset: 'markWhite', file: ASSET_FILES.markWhite },
  black: { asset: 'markBlack', file: ASSET_FILES.markBlack },
}

/**
 * MarkGlyph — the winged helmet alone. No ring, no lettering.
 * Only where the footer rail already carries the logotype on the same sheet.
 * variant: gold | white | black (the three published versions) | auto.
 * auto renders gold on the dark grounds and black on paper, chosen by the
 * ground scope in CSS, because gold on paper is illegal.
 */
export function MarkGlyph({ variant = 'gold', src, size = 48, alt = 'Techmen mark', className, ...rest }) {
  const s = Math.max(Number(size) || 48, MIN_SIZES.mark.width)
  if (variant === 'auto') {
    return (
      <span className={cx('frc-mark-auto', className)} data-frc="MarkGlyph" data-variant="auto" {...rest}>
        <AssetSlot data-variant="gold"  src={ASSETS.markGold}  file={VARIANTS.gold.file}  width={s} height={s} alt={alt} />
        <AssetSlot data-variant="black" src={ASSETS.markBlack} file={VARIANTS.black.file} width={s} height={s} alt={alt} />
      </span>
    )
  }
  const v = VARIANTS[variant] || VARIANTS.gold
  return (
    <AssetSlot
      src={src ?? ASSETS[v.asset]}
      file={v.file}
      width={s}
      height={s}
      minWidth={MIN_SIZES.mark.width}
      minHeight={MIN_SIZES.mark.height}
      alt={alt}
      className={cx('frc-mark', className)}
      data-frc="MarkGlyph"
      data-variant={variant}
      {...rest}
    />
  )
}
