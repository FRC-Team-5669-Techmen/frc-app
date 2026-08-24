// FRC5669DesignSystem — HOST TRANSPARENCY. One mechanism, two faces.
//
// THE ASSUMPTION THIS FILE EXISTS TO RETIRE: that a child the author wrote is a
// DIRECT child of the component it was written inside. The Claude Design runtime
// does not work that way. It wraps the template children of an `x-import` in
// HOST nodes — layout-transparent wrappers (`display: contents`) that contribute
// no box and no semantics and exist only to carry the child across the
// component boundary. Everything the system does by walking direct children or
// by type-checking a slotted child sees the host instead of the child.
//
// That has cost, in order: DeckStage's sheet lookup, the deck-motion direct-child
// selectors, SafetySheet's note guard twice over, and a permanent helmet rule in
// every shipped deck hiding hosts that nothing bridged. Each was patched where
// it hurt. This is the mechanism the patches should have been.
//
// A HOST IS TRANSPARENT, NOT INVISIBLE. Looking through one is not the same as
// accepting anything:
//
//   • we descend through HOSTS, never through author markup. A SafetyNote
//     wrapped in a runtime host is the same content the author wrote; a
//     SafetyNote buried inside a Card is different content, and every guard
//     that rejects the second still rejects it.
//   • a host is identified POSITIVELY (below), never by "it is not one of ours".
//
// ---- What counts as a host -------------------------------------------------
//
// React side, in order of how much we trust the signal:
//
//   1. `data-frc-host` on the element. The explicit contract. A runtime, a test,
//      or a deck that knows it is bridging says so, and nothing has to guess.
//   2. an inline `style={{ display: 'contents' }}`. Layout-transparency declared
//      where we can actually read it.
//   3. a CUSTOM ELEMENT tag — a string type containing `-`, which is the HTML
//      spec's own definition — or the transparent built-in `<slot>`, carrying no
//      `frc-` class. A runtime injects custom elements; the design system never
//      renders one except `image-slot`, which is real content and is excluded.
//   4. a component type marked `Type.frcHost === true`.
//
// KNOWN LIMIT, WRITTEN DOWN RATHER THAN PAPERED OVER: a runtime whose host is a
// plain `<span class="whatever">` made transparent by an external stylesheet is
// undetectable from React props — the class name is arbitrary and the computed
// style does not exist yet. That case needs signal 1, which is why signal 1
// exists and is listed first. The DOM face below has no such limit: there,
// `display: contents` is a computed value we can read directly.
//
// ---- The CSS face ----------------------------------------------------------
//
// A selector cannot skip a wrapper, and no combinator expresses "child, looking
// through display: contents". So in the token sheets the same idea is spelled
// the only way CSS can spell it: WHERE A HOST MAY BE INTERPOSED, THE SYSTEM
// MATCHES BY CONTAINMENT, NOT BY PARENTAGE. That is sound exactly where the
// child cannot legally nest inside itself within that parent — a sheet inside a
// sheet, a stage inside a stage, a role card inside a role card are all defects
// in their own right — which is true of every relationship that crosses an
// author boundary. `ds:audit` check 29 holds the boundary list, so a new `>`
// across one of them fails the audit rather than becoming the sixth workaround.
import { Children, cloneElement, isValidElement } from 'react'

/** Built-ins and known runtime wrappers that are transparent by definition. */
const HOST_TAGS = new Set(['slot', 'x-host', 'x-slot', 'x-fragment', 'dc-host', 'dc-slot', 'dc-fragment'])

/** Custom elements the design system renders as REAL content, never as a host. */
const NOT_HOSTS = new Set(['image-slot'])

const hasFrcClass = (el) => typeof el.props?.className === 'string' && /(^|\s)frc-/.test(el.props.className)

/**
 * Is this React element a transparent host?
 *
 * Deliberately positive: an element is a host because of something it declares,
 * never because it failed to be one of ours.
 */
export function isHostElement(node) {
  if (!isValidElement(node)) return false
  const { type, props } = node
  if (props && props['data-frc-host'] !== undefined) return true
  if (props?.style && props.style.display === 'contents') return true
  if (typeof type === 'function' && type.frcHost === true) return true
  if (typeof type !== 'string') return false
  if (NOT_HOSTS.has(type)) return false
  if (hasFrcClass(node)) return false
  return HOST_TAGS.has(type) || type.includes('-')
}

/** A slot name declared on this node, if any. */
const slotOf = (node) => (isValidElement(node) && typeof node.props?.slot === 'string' && node.props.slot ? node.props.slot : undefined)

/**
 * The children of `children`, with transparent hosts spliced away.
 *
 * A host that CARRIES A SLOT NAME is kept whole rather than flattened: the
 * runtime may hoist `slot` onto the wrapper, and dropping the wrapper there
 * would drop the slot with it. `throughHost` is what unwraps that one later,
 * once it has been filed under its slot. Both placements — the slot on the host
 * and the slot on the child inside it — therefore land in the same place.
 */
export function hostChildren(children) {
  const out = []
  const push = (node) => {
    if (node === null || node === undefined || node === false || node === '') return
    if (isHostElement(node) && !slotOf(node)) {
      Children.forEach(node.props?.children, push)
      return
    }
    out.push(node)
  }
  Children.forEach(children, push)
  return out
}

/**
 * The meaningful element under any stack of transparent hosts.
 *
 * Stops at the first thing that is not a host, and at a host carrying more than
 * one meaningful child — a wrapper around several elements is a group, and
 * quietly picking one of them would be a guess.
 */
export function throughHost(node) {
  let cur = node
  for (let depth = 0; depth < 8; depth++) {
    if (!isHostElement(cur)) return cur
    const inner = hostChildren(cur.props?.children)
    if (inner.length !== 1) return cur
    cur = inner[0]
  }
  return cur
}

/** `node.props`, read through any host wrapping it. Undefined for a bare string. */
export function hostProps(node) {
  const el = throughHost(node)
  return isValidElement(el) ? el.props : undefined
}

/**
 * Does `children` contain an element of one of `types`, looking through hosts?
 *
 * The traversal is the guard's whole meaning, so it is deliberately shallow: it
 * looks through wrappers the RUNTIME inserted and through nothing else. Content
 * nested inside author markup is different content and still fails.
 */
export function containsType(children, types) {
  const want = [].concat(types)
  return hostChildren(children).some((child) => {
    const el = throughHost(child)
    return isValidElement(el) && want.includes(el.type)
  })
}

/**
 * cloneElement, applied to the element the AUTHOR wrote rather than to the
 * wrapper the runtime inserted, with the wrapper preserved around it.
 *
 * This is the quiet one. A class painted onto a `display: contents` host still
 * inherits color and font, and silently loses padding, background, border and
 * every other box property — so a slotted title looks nearly right and is not.
 */
export function cloneThroughHost(node, propsFor) {
  if (!isValidElement(node)) return node
  if (isHostElement(node)) {
    const inner = hostChildren(node.props?.children)
    if (inner.length === 1) {
      return cloneElement(node, { children: cloneThroughHost(inner[0], propsFor) })
    }
  }
  return cloneElement(node, typeof propsFor === 'function' ? propsFor(node) : propsFor)
}

/* -------------------------------------------------------------------------- */
/* The DOM face. Same idea, and here transparency is a computed value we can    */
/* read outright, so there is no guessing at all.                               */
/* -------------------------------------------------------------------------- */

/** Is this DOM element a transparent host? */
export function isHostNode(el) {
  if (!el || el.nodeType !== 1) return false
  const tag = el.tagName.toLowerCase()
  if (NOT_HOSTS.has(tag)) return false
  if (el.hasAttribute('data-frc-host')) return true
  if (HOST_TAGS.has(tag)) return true
  const view = el.ownerDocument?.defaultView
  if (view) {
    try { if (view.getComputedStyle(el).display === 'contents') return true } catch { /* detached */ }
  }
  return false
}

/**
 * The STRUCTURAL children of `el`: its element children, with transparent hosts
 * replaced by their own structural children. What `el.children` would have been
 * if the runtime had not wrapped anything.
 */
export function structuralChildren(el, depth = 0) {
  const out = []
  if (!el || depth > 8) return out
  for (const child of el.children) {
    if (isHostNode(child)) out.push(...structuralChildren(child, depth + 1))
    else out.push(child)
  }
  return out
}
