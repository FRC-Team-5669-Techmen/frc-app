import { useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../cx.js'
import { fault } from '../guard.jsx'
import { structuralChildren } from '../host.jsx'

/**
 * DeckSteps — behaviour, not appearance. The second of the two.
 *
 * Mount it ONCE per deck, beside DeckStage. It renders nothing visible and adds
 * one capability: stepping through an authored list instead of dropping it on
 * the room whole. A twelve-sheet deck that puts nine subteam cards or five
 * schedule rows on screen at once has made a pacing decision by accident; this
 * is the component that lets the decision be made on purpose.
 *
 * WHAT IT DOES. It intercepts next/prev before DeckStage sees them. While the
 * ACTIVE sheet has a step group with items left, next reveals the next item and
 * the sheet does not change. When the items run out the key is released to
 * DeckStage and the deck moves on, exactly as it does today.
 *
 * OPT-IN, NOT AUTOMATIC, and the choice is the interesting part. Automatic
 * would mean that mounting DeckSteps silently re-paces every deck already
 * written: nine cards that used to land together would suddenly cost nine key
 * presses, on sheets nobody revisited. Worse, there would be no way to say "not
 * this sheet" — the only exit would be a per-pattern opt-out prop, and a prop on
 * twenty-six patterns is the thing this component exists to avoid. Pacing is an
 * authorial decision, so an author states it. Two ways, both zero-API:
 *
 *   • `data-steps` on the SHEET. Every pattern spreads `...rest` onto its root,
 *     so this is a plain DOM attribute that already passes through. DeckSteps
 *     then finds the list itself, from the containers that already exist:
 *     .frc-samples, .frc-steps, .frc-pipeline, .frc-role-grid, .frc-safety-list,
 *     .frc-subteam-grid — in that order, first match wins.
 *   • `data-step-group` on any container the author wrote. That names the list
 *     outright and needs nothing on the sheet. It is also what DeckSteps stamps
 *     onto whatever it resolves, so the attribute means one thing either way.
 *
 * A sheet with neither carries no `data-step` and is untouched — same markup,
 * same keys, same behaviour as before this component existed.
 *
 * THE STEP INDEX IS PER SHEET, and re-entry is decided by DIRECTION rather than
 * by memory:
 *
 *   • entered going FORWARD  → step 1. This is the only case that starts
 *     partial, because it is the only case where the presenter is pacing.
 *   • entered going BACKWARD → the LAST step. Going back from the first item of
 *     a sheet lands on the previous sheet fully revealed, which is what a
 *     presenter means by "back" — they want the slide they just finished, not
 *     its opening frame.
 *   • arrived any other way (a thumbnail, Home, End, a deck's own control) →
 *     the LAST step. A jump is navigation, not pacing; answering a question
 *     from the floor must never show a sheet with eight of nine cards missing.
 *
 * Remembering where you left each sheet was the alternative and was rejected:
 * it makes the same key produce different results on the same sheet depending
 * on history, and it means a sheet you abandoned half-way stays half-way when
 * you come back to it in front of the room.
 *
 * THE BASE STATE IS STILL THE COMPLETE SHEET. tokens/motion.css states the
 * standing rule — "Hide-until-clicked is prohibited" — because a static render
 * has to be whole. DeckSteps does not repeal it, it scopes it: every reveal rule
 * is gated behind `[data-deck-active][data-step]`, `data-step` exists only while
 * a live DeckSteps is driving the deck, print resets the gate outright, and
 * unmounting strips every attribute it wrote. A deck exported, printed,
 * captured, or opened without this component shows every item.
 *
 * REDUCED MOTION STILL STEPS. The reveal is two things and only one of them is
 * motion: the pending/shown state is ungated, the fade-and-rise between them is
 * inside the reduced-motion gate. Someone who has asked for less motion still
 * gets the pacing, just without the transition — the opposite of the usual
 * mistake, which is to gate the whole feature and hand them a static sheet.
 *
 * HOST TRANSPARENCY IS LOAD-BEARING HERE. The Claude Design runtime wraps
 * template children in layout-transparent hosts, so the items of a nine-card
 * grid are not necessarily DOM children of the grid. That is also why the CSS
 * cannot count: `:nth-child()` reads parentage, and a `> :nth-child(n+4)` ladder
 * would count host wrappers on a generated deck and reveal the wrong cards, or
 * none. So the count is done in JS through `structuralChildren`, each item is
 * marked, and the stylesheet reads the mark by containment. See host.jsx.
 */

/** The containers that already exist. First match on the sheet wins. */
const GROUP_SELECTORS = [
  '.frc-samples',
  '.frc-steps',
  '.frc-pipeline',
  '.frc-role-grid',
  '.frc-safety-list',
  '.frc-subteam-grid',
]

const NEXT_KEYS = new Set(['ArrowRight', 'PageDown'])
const PREV_KEYS = new Set(['ArrowLeft', 'PageUp'])

/** One registry of live instances per deck root, so a duplicate is detectable. */
const MOUNTED = new WeakMap()

/** setAttribute only when the value actually changes, so a MutationObserver watching this subtree cannot be driven in a loop by its own repair. */
function setAttr(el, name, value) {
  if (value == null) { if (el.hasAttribute(name)) el.removeAttribute(name) }
  else if (el.getAttribute(name) !== value) el.setAttribute(name, value)
}

/**
 * The step group on a sheet, or null if the sheet does not opt in.
 *
 * An explicit `[data-step-group]` wins over the resolved list, because naming
 * the container outright is the more specific statement.
 */
function groupOf(sheet) {
  if (!sheet) return null
  const explicit = sheet.querySelector('[data-step-group]')
  if (explicit) return explicit
  if (!sheet.hasAttribute('data-steps')) return null
  for (const sel of GROUP_SELECTORS) {
    const el = sheet.querySelector(sel)
    if (el) return el
  }
  return null
}

/**
 * The group's items, read THROUGH any transparent host the runtime interposed,
 * each marked with its 1-based index. The index is what the /_ds proof reads and
 * what makes a mis-ordered reveal visible in devtools instead of only on stage.
 */
function stampItems(group) {
  const items = structuralChildren(group)
  items.forEach((el, i) => setAttr(el, 'data-step-item', String(i + 1)))
  return items
}

function clearGroup(group) {
  if (!group) return
  for (const el of structuralChildren(group)) {
    el.removeAttribute('data-step-item')
    el.removeAttribute('data-step-shown')
  }
}

export function DeckSteps({ nav = true, onStep, as: Tag = 'span', className, ...rest }) {
  const ref = useRef(null)
  const token = useRef({})
  const [broken, setBroken] = useState(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const root = el.closest('.frc-deck')
    if (!root) { setBroken({ rule: 'must be mounted inside a .frc-deck root.', detail: 'DeckSteps drives the deck it is mounted in; it found no .frc-deck ancestor.' }); return undefined }

    // Duplicate first, for the same reason DeckStage checks it first: two
    // steppers on one deck both consume the key and both write data-step, so
    // every individual reading still looks correct and the deck skips items.
    let live = MOUNTED.get(root)
    if (!live) { live = new Set(); MOUNTED.set(root, live) }
    if (live.size > 0 && !live.has(token.current)) {
      setBroken({ rule: 'mounts exactly once per deck.', detail: `A second DeckSteps was mounted on this deck; ${live.size} was already driving it. Two steppers consume the same key and the deck advances twice.` })
      return undefined
    }
    live.add(token.current)
    const release = () => { live.delete(token.current); if (live.size === 0) MOUNTED.delete(root) }

    const stage = root.querySelector('.frc-stage')
    if (!stage) { setBroken({ rule: 'needs a .frc-stage to step.', detail: 'The deck root contains no .frc-stage element.' }); release(); return undefined }

    // DeckSteps only ever declines a key; moving between sheets is DeckStage's
    // job. Without one, the last step of a sheet and the first step going back
    // both do NOTHING, silently — the deck simply stops at a boundary.
    if (!root.querySelector('[data-frc="DeckStage"]')) {
      setBroken({ rule: 'requires DeckStage on the same deck.', detail: 'DeckSteps hands next/prev back to DeckStage at a sheet boundary. With no DeckStage the deck never advances, and the last step of every sheet is a dead end.' })
      release(); return undefined
    }

    // ---- the job ----------------------------------------------------------
    // Containment, not parentage: a sheet can be hosted, so it is found by
    // descendant query rather than by walking stage.children.
    const activeSheet = () => stage.querySelector('.frc-sheet[data-deck-active]')

    const apply = (sheet, group, items, n) => {
      setAttr(group, 'data-step-group', '')
      items.forEach((it, i) => setAttr(it, 'data-step-shown', i < n ? '' : null))
      setAttr(sheet, 'data-step', String(n))
      if (onStep) onStep({ sheet, group, step: n, total: items.length })
    }

    /** Put a sheet into its entry state. `mode` is 'first' or 'last'. */
    const enter = (sheet, mode) => {
      if (!sheet) return
      const group = groupOf(sheet)
      const items = group ? stampItems(group) : []
      if (!items.length) {
        // A sheet with no step group is untouched, and a sheet that LOSES its
        // group must be restored rather than left frozen at a stale step.
        sheet.removeAttribute('data-step')
        clearGroup(group)
        return
      }
      apply(sheet, group, items, mode === 'first' ? 1 : items.length)
    }

    const current = (sheet, total) => {
      const raw = Number(sheet.getAttribute('data-step'))
      if (!Number.isFinite(raw) || raw < 1) return total
      return Math.min(raw, total)
    }

    // Which way the deck is about to move, recorded when a key is DECLINED, so
    // the sheet we land on knows which end to enter at. It is read once by the
    // observer and cleared, and every keydown clears a stale one first — which
    // is what makes the clamped case (prev on the first sheet: declined, no
    // sheet change, no observer callback) leave nothing behind.
    const intent = { dir: null }
    let lastActive = null

    const onKey = (e) => {
      const t = e.target
      const editable = Boolean(t) && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      if (editable || e.metaKey || e.ctrlKey || e.altKey) return
      const dir = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0
      intent.dir = null
      if (!dir) return

      const sheet = activeSheet()
      const group = groupOf(sheet)
      const items = group ? stampItems(group) : []
      if (items.length) {
        const next = current(sheet, items.length) + dir
        if (next >= 1 && next <= items.length) {
          apply(sheet, group, items, next)
          // Consumed. stopImmediatePropagation rather than stopPropagation
          // because DeckStage listens on this same node in the BUBBLE phase,
          // and only the immediate form is unambiguously specified to prevent a
          // later phase on the node the capture listener is attached to.
          e.preventDefault()
          e.stopImmediatePropagation()
          return
        }
      }
      // Declined: DeckStage will change the sheet. Record which end to enter at.
      intent.dir = dir
    }

    // A sheet change can come from anywhere — these keys, a thumbnail, a deck's
    // own control — so entry is driven off the attribute rather than off whoever
    // moved it. subtree, because data-deck-active sits on the sheets, and the
    // sheets may be hosted.
    const observer = new MutationObserver(() => {
      const sheet = activeSheet()
      if (sheet === lastActive) return
      lastActive = sheet
      enter(sheet, intent.dir === 1 ? 'first' : 'last')
      intent.dir = null
    })
    observer.observe(stage, { attributes: true, attributeFilter: ['data-deck-active'], childList: true, subtree: true })

    const doc = root.ownerDocument
    if (nav) doc.addEventListener('keydown', onKey, true)

    // Opening a deck is arriving forward, so the first sheet starts paced.
    lastActive = activeSheet()
    enter(lastActive, 'first')

    return () => {
      observer.disconnect()
      if (nav) doc.removeEventListener('keydown', onKey, true)
      // Leave the deck COMPLETE. An unmounted stepper that left data-step behind
      // would keep the gate live with nothing driving it, which is the one way
      // this component could hide content for good.
      for (const sheet of stage.querySelectorAll('.frc-sheet[data-step]')) {
        sheet.removeAttribute('data-step')
        clearGroup(groupOf(sheet))
      }
      release()
    }
  }, [nav, onStep])

  if (broken) return fault('DeckSteps', broken.rule, broken.detail)

  return <Tag ref={ref} className={cx('frc-deck-steps', className)} data-frc="DeckSteps" hidden aria-hidden="true" {...rest} />
}
