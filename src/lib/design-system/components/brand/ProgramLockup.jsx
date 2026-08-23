import { ASSETS, ASSET_FILES, MIN_SIZES } from '../../assets.js'
import { cx } from '../cx.js'
import { AssetSlot } from './AssetSlot.jsx'

const PROGRAMS = {
  frc: { label: 'FRC', token: 'var(--program-frc)', horizontal: 'frcHorizontalReverse', vertical: 'frcVerticalReverse' },
  ftc: { label: 'FTC', token: 'var(--program-ftc)', horizontal: 'ftcHorizontalReverse', vertical: 'ftcVerticalReverse' },
  fll: { label: 'FLL', token: 'var(--program-fll)', horizontal: 'fllHorizontalReverse', vertical: 'fllVerticalReverse' },
}

/**
 * ProgramLockup — the program logo (full-color reverse, used as supplied) over
 * a --program rail with the team identification that permitted use requires.
 * --program colors the rail only. It never colors content.
 * Minimums are the published digital floors: 60px horizontal, 120px vertical.
 */
export function ProgramLockup({ program = 'frc', orientation = 'horizontal', src, className, style, ...rest }) {
  const p = PROGRAMS[program] || PROGRAMS.frc
  const vertical = orientation === 'vertical'
  const key = vertical ? p.vertical : p.horizontal
  const minH = vertical ? MIN_SIZES.programVertical.height : MIN_SIZES.programHorizontal.height
  const w = vertical ? 160 : 320
  const h = vertical ? 120 : 60
  return (
    <div
      className={cx('frc-program-lockup', className)}
      style={{ '--program': p.token, ...style }}
      data-frc="ProgramLockup"
      data-program={program}
      {...rest}
    >
      <AssetSlot
        first
        src={src ?? ASSETS[key]}
        file={ASSET_FILES[key]}
        width={w}
        height={h}
        minHeight={minH}
        alt={`FIRST ${p.label} program logo`}
        label={`${p.label} ${orientation}, reverse`}
      />
      <div className="frc-program-rail" />
      <div className="frc-program-team">
        <span className="frc-label">Team</span>
        <span className="frc-numeral">5669</span>
      </div>
    </div>
  )
}
