import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'

const TONES = { default: null, hero: 'frc-stat-hero', ok: 'frc-stat-ok', warn: 'frc-stat-warn', fault: 'frc-stat-fault' }

/**
 * StatBlock - one number said loudly, with the label that makes it mean
 * something. Numerals are hero material; glow is rationed to tone="hero" and is
 * zero on paper by alias.
 *   <StatBlock tone="hero">
 *     <span slot="value">412</span><span slot="unit">hrs</span>
 *     <span slot="label">Shop hours this season</span>
 *   </StatBlock>
 */
export function StatBlock({ tone = 'default', size = 'md', as: Tag = 'div', className, children, ...rest }) {
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag
      className={cx('frc-stat', TONES[tone], size === 'sm' && 'frc-stat-sm', className)}
      data-frc="StatBlock"
      data-tone={tone}
      {...rest}
    >
      <p className="frc-stat-value frc-numeral">
        {slotted(slots.value, 'frc-stat-figure')}
        {slotted(slots.unit, 'frc-stat-unit')}
      </p>
      {slotted(slots.label, 'frc-stat-label')}
      {slotted(slots.note, 'frc-stat-note')}
      {extra}
    </Tag>
  )
}
