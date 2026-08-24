import { Children, createContext, isValidElement, useContext, useId, useState } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'
import { cloneThroughHost, hostProps, throughHost } from '../host.jsx'

const PinCtx = createContext(null)

/**
 * CalloutDrawing / CalloutPin - numbered pins over a drawing or photograph.
 *
 * Every pin label is rendered AT REST at reduced opacity. Clicking a pin raises
 * the label it already drew; it never creates one. That is the interaction rule
 * the whole system is built on: base state shows everything, so the print, the
 * PDF and the reduced-motion render are complete, and a sophomore presenting
 * this deck never has to know that an unmarked region is clickable.
 *
 * Pin coordinates are percentages of the media box: geometry, not copy.
 */
export function CalloutDrawing({ defaultActive = null, as: Tag = 'figure', className, children, ...rest }) {
  const [active, setActive] = useState(defaultActive)
  const { slots, rest: content } = pickSlots(children)
  let n = 0
  const numbered = Children.map(content, (child) => {
    // A pin is recognised through any runtime host — see components/host.jsx.
    const pin = throughHost(child)
    if (!isValidElement(pin) || pin.type?.frcPin !== true) return child
    n += 1
    return cloneThroughHost(child, { index: hostProps(child)?.index ?? n })
  })
  return (
    <PinCtx.Provider value={{ active, setActive }}>
      <Tag className={cx('frc-drawing', className)} data-frc="CalloutDrawing" {...rest}>
        <div className="frc-drawing-media">{numbered}</div>
        {slotted(slots.caption, 'frc-frame-caption', 'figcaption')}
      </Tag>
    </PinCtx.Provider>
  )
}

export function CalloutPin({ x = 50, y = 50, id, index, side = 'right', className, children, onClick, ...rest }) {
  const ctx = useContext(PinCtx)
  const auto = useId()
  const key = id ?? auto
  const { slots } = pickSlots(children)
  const active = ctx ? ctx.active === key : false
  return (
    <button
      type="button"
      className={cx('frc-pin', side === 'left' && 'frc-pin-left', className)}
      data-frc="CalloutPin"
      data-active={active ? '' : undefined}
      style={{ '--x': x, '--y': y }}
      onClick={(e) => {
        if (ctx) ctx.setActive(ctx.active === key ? null : key)
        if (onClick) onClick(e)
      }}
      {...rest}
    >
      <span className="frc-pin-dot frc-numeral">{index ?? 1}</span>
      {slotted(slots.label, 'frc-pin-label')}
    </button>
  )
}
CalloutPin.frcPin = true
