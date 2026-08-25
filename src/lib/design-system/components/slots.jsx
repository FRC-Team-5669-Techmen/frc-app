// FRC5669DesignSystem — child slots.
//
// COPY LIVES IN CHILDREN. Text passed as a component prop is not editable on
// the Claude Design canvas, so every string a human would read aloud in the
// room arrives as a child carrying a plain `slot` attribute:
//
//   <SpecRow>
//     <span slot="label">Free speed</span>
//     <span slot="value">18.4 ft/s</span>
//   </SpecRow>
//
// `slot` is a global HTML attribute, so it passes straight through to the DOM
// and stays visible to the canvas. These helpers pick children apart by it and
// paint the system class onto whatever element the author wrote.
//
// EVERY WALK HERE IS HOST-TRANSPARENT. The Claude Design runtime wraps the
// template children of an `x-import` in layout-transparent host nodes, so "the
// element the author wrote" and "the direct child" are not the same node. This
// module is the funnel almost every component reaches children through, which is
// why the mechanism lands here rather than in each component. See
// components/host.jsx for what counts as a host and why looking through one is
// not the same as accepting anything.
import { cloneElement, isValidElement } from 'react'
import { cx } from './cx.js'
import { cloneThroughHost, hostChildren, isHostElement, throughHost } from './host.jsx'

/**
 * Split children into { slots, rest }. A repeated slot name collects an array.
 *
 * Host-transparent: a host with no slot of its own is spliced away so the
 * slotted child inside it is seen, and a host that CARRIES the slot is kept
 * whole and filed under it. The runtime may do either, and both arrive here.
 */
export function pickSlots(children) {
  const slots = {}
  const rest = []
  hostChildren(children).forEach((child) => {
    if (child === null || child === undefined || child === false || child === '') return
    const name = isValidElement(child) ? child.props?.slot : undefined
    if (typeof name === 'string' && name) {
      if (name in slots) slots[name] = [].concat(slots[name], child)
      else slots[name] = child
      return
    }
    rest.push(child)
  })
  return { slots, rest }
}

/** Every child of `children` whose type is one of `types`, in order. */
export function pickType(children, types) {
  const want = [].concat(types)
  const out = []
  hostChildren(children).forEach((child) => {
    const el = throughHost(child)
    if (isValidElement(el) && want.includes(el.type)) out.push(child)
  })
  return out
}

/** Children that are NOT one of `types` and carry no slot. */
export function rejectType(children, types) {
  const want = [].concat(types)
  const out = []
  hostChildren(children).forEach((child) => {
    if (child === null || child === undefined || child === false) return
    if (isValidElement(child) && child.props?.slot) return
    const el = throughHost(child)
    if (isValidElement(el) && want.includes(el.type)) return
    out.push(child)
  })
  return out
}

/**
 * Render a slot: keep the author's element and add the system class to it, so
 * the copy stays exactly where the author typed it. A bare string is wrapped in
 * `Tag` because there is nothing to paint the class onto.
 *
 * The class goes on the element the AUTHOR wrote, never on a host wrapping it:
 * a host is `display: contents`, so it would still inherit color and font and
 * silently drop every box property — the failure that looks almost right.
 *
 * RENDERING A SLOT CONSUMES ITS NAME. `slotted()` is the moment a component says
 * "I have picked this slot and I am putting it HERE", so the `slot` attribute has
 * done its work and is stripped on the way out. Leaving it on is not cosmetic: a
 * painted element frequently lands inside another component that runs its own
 * `pickSlots`, and that component sorts the still-named element into a bucket of
 * its OWN vocabulary — one it very likely does not render. The copy is then
 * dropped silently, with no error and nothing missing from the props.
 *
 * That is not hypothetical. `SubteamStatus` paints its note with
 * `slotted(slots.note, 'frc-card-body', 'p')` and hands it to `Card`; Card
 * re-picked `slot="note"`, has no `note` slot, and every subteam card on
 * `SubteamStatusSheet` rendered with its status line missing. The stray
 * attribute also reached the DOM, where nothing reads it — no rule in the token
 * sheets selects on `[slot]`.
 *
 * A component that genuinely needs to hand a slot DOWN under a different name
 * says so outright — see `Blocker`, which re-slots title -> label and
 * owner -> value with `cloneThroughHost` before passing them to `FocusRow`.
 */
export function slotted(node, className, Tag = 'span', key) {
  if (node === null || node === undefined || node === false || node === '') return null
  if (Array.isArray(node)) return node.map((n, i) => slotted(n, className, Tag, i))
  if (isValidElement(node)) {
    if (isHostElement(node)) {
      const painted = cloneThroughHost(node, (el) => ({ className: cx(className, el.props.className), slot: undefined }))
      // The name can be hoisted onto the host as well as sitting on the child,
      // so it is cleared at both ends — a host that keeps it is re-picked just
      // the same as an author element that keeps it.
      const cleared = isValidElement(painted) ? cloneElement(painted, { slot: undefined }) : painted
      return isValidElement(cleared) && cleared.key == null && key != null
        ? cloneElement(cleared, { key })
        : cleared
    }
    return cloneElement(node, { className: cx(className, node.props.className), slot: undefined, key: node.key ?? key })
  }
  return <Tag className={className} key={key}>{node}</Tag>
}

/** Always an array, so a repeated slot and a single one read the same. */
export function slotList(node) {
  if (node === null || node === undefined || node === false) return []
  return Array.isArray(node) ? node : [node]
}
