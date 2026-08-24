import { Children, isValidElement } from 'react'
import { cx } from '../cx.js'
import { pickSlots, slotted } from '../slots.jsx'
import { cloneThroughHost, hostProps } from '../host.jsx'

/**
 * JumpGrid / JumpCard - the hub sheet. A jump changes which sheet is on screen;
 * it never reveals content that was hidden on this one, and the hub is the one
 * sheet that carries no footer rail.
 */
export function JumpGrid({ cols = 3, as: Tag = 'nav', className, children, ...rest }) {
  const { slots, rest: cards } = pickSlots(children)
  let n = 0
  const numbered = Children.map(cards, (child) => {
    if (!isValidElement(child)) return child
    n += 1
    // Through any runtime host: cloning the WRAPPER hands `index` to something
    // that ignores it, and every card then reads Part 01.
    return cloneThroughHost(child, { index: hostProps(child)?.index ?? n })
  })
  return (
    <Tag className={cx('frc-jumps', className)} data-frc="JumpGrid" style={{ '--cols': cols }} {...rest}>
      {slotted(slots.caption, 'frc-spec-caption')}
      {numbered}
    </Tag>
  )
}

export function JumpCard({ href, index, state = 'default', className, children, ...rest }) {
  const Tag = href ? 'a' : 'div'
  const { slots, rest: extra } = pickSlots(children)
  return (
    <Tag
      className={cx('frc-jump', className)}
      data-frc="JumpCard"
      data-state={state}
      {...(href ? { href } : {})}
      {...rest}
    >
      <span className="frc-jump-n frc-numeral">{`Part ${String(index ?? 1).padStart(2, '0')}`}</span>
      {slotted(slots.title, 'frc-jump-title', 'h3')}
      {slotted(slots.note, 'frc-jump-note', 'p')}
      {extra}
    </Tag>
  )
}
