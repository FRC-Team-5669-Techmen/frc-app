import { ASSETS, ASSET_FILES } from '../../assets.js'
import { cx } from '../cx.js'
import { AssetSlot } from './AssetSlot.jsx'

/**
 * SeasonLockup — season artwork slot + season name + season years.
 * Setting --season on the deck root and dropping artwork into this slot is the
 * entire annual reskin. The rule takes --season (gold by default); on paper it
 * falls back to the bronze accent because the gold default is illegal there.
 * The season name is the child (read aloud → copy). Years are fixed chrome
 * (render 2026-27, never 2026/2027).
 */
export function SeasonLockup({ years, src = ASSETS.seasonArt, artWidth = 240, artHeight = 240, className, children, ...rest }) {
  return (
    <div className={cx('frc-season-lockup', className)} data-frc="SeasonLockup" {...rest}>
      <AssetSlot src={src} file={ASSET_FILES.seasonArt} width={artWidth} height={artHeight} alt="" label="Season artwork" />
      <div className="frc-season-text">
        <p className="frc-season-name">{children}</p>
        <div className="frc-season-rule" />
        {years ? <div className="frc-season-years">{years}</div> : null}
      </div>
    </div>
  )
}
