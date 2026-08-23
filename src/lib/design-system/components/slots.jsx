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
import { Children, cloneElement, isValidElement } from 'react'
import { cx } from './cx.js'

/** Split children into { slots, rest }. A repeated slot name collects an array. */
export function pickSlots(children) {
  const slots = {}
  const rest = []
  Children.forEach(children, (child) => {
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
  Children.forEach(children, (child) => {
    if (isValidElement(child) && want.includes(child.type)) out.push(child)
  })
  return out
}

/** Children that are NOT one of `types` and carry no slot. */
export function rejectType(children, types) {
  const want = [].concat(types)
  const out = []
  Children.forEach(children, (child) => {
    if (child === null || child === undefined || child === false) return
    if (isValidElement(child) && (want.includes(child.type) || child.props?.slot)) return
    out.push(child)
  })
  return out
}

/**
 * Render a slot: keep the author's element and add the system class to it, so
 * the copy stays exactly where the author typed it. A bare string is wrapped in
 * `Tag` because there is nothing to paint the class onto.
 */
export function slotted(node, className, Tag = 'span', key) {
  if (node === null || node === undefined || node === false || node === '') return null
  if (Array.isArray(node)) return node.map((n, i) => slotted(n, className, Tag, i))
  if (isValidElement(node)) {
    return cloneElement(node, { className: cx(className, node.props.className), key: node.key ?? key })
  }
  return <Tag className={className} key={key}>{node}</Tag>
}

/** Always an array, so a repeated slot and a single one read the same. */
export function slotList(node) {
  if (node === null || node === undefined || node === false) return []
  return Array.isArray(node) ? node : [node]
}
