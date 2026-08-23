import { cx } from '../cx.js'

/**
 * PlatePanel — the panel whose depth treatment is chosen by the ground:
 * SQUADRON plates RISE (top highlight, bottom shade, short drop), FIELD panels
 * RECESS (inset well), paper is a flat hairline. treatment="plate" | "well"
 * forces one. rivets adds the seam along the top edge.
 */
export function PlatePanel({ treatment = 'auto', rivets = false, pad = 'normal', as: Tag = 'section', className, children, ...rest }) {
  const surface = treatment === 'plate' ? 'frc-plate' : treatment === 'well' ? 'frc-well' : 'frc-panel'
  return (
    <Tag
      className={cx(
        'frc-plate-panel',
        surface,
        rivets && 'frc-rivets',
        pad === 'tight' && 'frc-plate-panel-tight',
        pad === 'loose' && 'frc-plate-panel-loose',
        className,
      )}
      data-frc="PlatePanel"
      data-treatment={treatment}
      {...rest}
    >
      {children}
    </Tag>
  )
}
