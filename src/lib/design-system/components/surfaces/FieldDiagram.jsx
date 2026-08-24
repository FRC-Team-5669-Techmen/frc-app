import { useState } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotList } from '../slots.jsx'
import { hostProps } from '../host.jsx'

/**
 * FieldDiagram - the field from above, with zones a strategy conversation can
 * point at.
 *
 * ZONE GEOMETRY STAYS AN ARRAY. A polygon is structure, not copy: nobody reads
 * a point list aloud, and splitting one into children moves the endpoints
 * further apart rather than closer to the canvas. Every zone LABEL is a slotted
 * child, matched to its polygon by data-zone.
 *
 * THE THIRD AND LAST component allowed to use --alliance-red / --alliance-blue,
 * and only inside .frc-ground-field. Elsewhere the zones fall back to structure
 * tones; the legend words still say which side is which.
 *
 * Clicking a zone raises it and dims the others. Nothing appears that was not
 * already drawn.
 */
export function FieldDiagram({
  zones = [],
  viewBox = '0 0 1600 800',
  grid = 8,
  defaultActive = null,
  as: Tag = 'figure',
  className,
  children,
  ...rest
}) {
  const [active, setActive] = useState(defaultActive)
  const { slots } = pickSlots(children)
  const labels = slotList(slots.zone)
  const keys = slotList(slots.key)
  const [, , w, h] = String(viewBox).split(/\s+/).map(Number)
  const step = grid > 0 ? w / grid : 0
  const lines = []
  for (let i = 1; i < grid; i++) lines.push(i * step)
  return (
    <Tag
      className={cx('frc-field-diagram', className)}
      data-frc="FieldDiagram"
      data-focus={active != null ? '' : undefined}
      {...rest}
    >
      <div className="frc-fd-stage">
        <svg viewBox={viewBox} role="img">
          <g className="frc-fd-grid">
            {lines.map((x, i) => <line key={`v${i}`} x1={x} y1="0" x2={x} y2={h} />)}
            {lines.map((x, i) => <line key={`h${i}`} x1="0" y1={(x / w) * h} x2={w} y2={(x / w) * h} />)}
          </g>
          {zones.map((z) => (
            <polygon
              key={z.id}
              className="frc-fd-zone"
              points={z.points}
              data-zone={z.id}
              data-alliance={z.alliance}
              data-active={active === z.id ? '' : undefined}
              onClick={() => setActive(active === z.id ? null : z.id)}
            />
          ))}
        </svg>
        {labels.map((l, i) => {
          // Read through any runtime host: on a hosted deck `data-zone` is not
          // on the wrapper, and every zone label was dropped without a word.
          const lp = hostProps(l)
          const id = lp ? lp['data-zone'] : undefined
          const zone = zones.find((z) => z.id === id)
          if (!zone || !zone.at) return null
          return (
            <span
              key={id || i}
              className={cx('frc-fd-label', lp.className)}
              style={{ '--x': zone.at[0], '--y': zone.at[1] }}
              data-zone={id}
              data-active={active === id ? '' : undefined}
              slot="zone"
            >
              {lp.children}
            </span>
          )
        })}
      </div>
      {keys.length ? <div className="frc-fd-legend">{keys}</div> : null}
    </Tag>
  )
}
