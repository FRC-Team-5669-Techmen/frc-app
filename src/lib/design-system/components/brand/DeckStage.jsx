import { useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../cx.js'
import { fault } from '../guard.jsx'
import { structuralChildren } from '../host.jsx'

/**
 * DeckStage — behaviour, not appearance.
 *
 * Mount it ONCE per deck. It renders nothing visible in its normal state and
 * does the job templates/Deck.dc.html's stage script used to do, now that the
 * shell is no longer a starting point: it paints the canvas, the letterbox and
 * the thumbnail frames from the ACTIVE sheet's `--bg0` and `--edge`, and it
 * repaints on every sheet change.
 *
 * THE POINT IS `--edge`. A deck that paints only `--bg0` leaves the canvas
 * behind and around the stage at the browser default, so the instant a
 * transition moves the sheet — a shutter wipe, a banner pass — the room sees
 * white through the gap. A generated deck rolled its own stage logic and read
 * `--bg0` but never `--edge`, which is exactly the flash this component exists
 * to prevent. `--edge` is the ground's own outside-the-sheet tone: black on
 * SQUADRON, near-black on FIELD, warm grey on paper.
 *
 * IT DOES NOT OWN THE DECK ROOT AND ASSUMES NOTHING ABOUT IT. It finds the root
 * by walking up from its own marker node and READS what is there. When what it
 * reads is wrong it renders the shared rust fault marker and throws only inside
 * the dev harness, the same as every other guard in this system
 * (components/guard.jsx). Six states trip it:
 *
 *   • no `.frc-deck` ancestor          — there is no deck to drive
 *   • no `.frc-stage` in the deck      — there is nothing to paint
 *   • the stage declares no data-aspect — 4:3 and 16:9 are different decks, and
 *                                         an unstated aspect is how one becomes
 *                                         the other silently
 *   • the root carries no ground class  — no `--bg0`/`--edge` to read from
 *   • the root carries no audience class
 *   • a second DeckStage on the same deck — two painters fight over the canvas
 *
 * It paints the DOCUMENT canvas only when the deck owns the viewport, which is
 * what `.frc-letterbox` on the root declares. An embedded deck — a demo card, a
 * proof, a deck inside a page — paints itself and leaves the host page alone.
 *
 * The middle four are exactly the states a deck generated from Blank lands in
 * by default, which is the whole reason the marker matters: it makes the defect
 * visible on the sheet instead of leaving it for someone to remember to check.
 */

const ASPECTS = new Set(['4:3', '16:9'])
const GROUNDS = ['frc-ground-squadron', 'frc-ground-field', 'frc-ground-paper']
const AUDIENCES = ['frc-audience-internal', 'frc-audience-external']

/** One registry of live instances per deck root, so a duplicate is detectable. */
const MOUNTED = new WeakMap()

/**
 * The sheets on the stage, read through any transparent HOST the runtime put
 * between them and it. `stage.children` alone returns the hosts on a generated
 * deck, the filter returns nothing, and DeckStage then activates no sheet and
 * never reads --edge — the exact failure it exists to prevent, arriving through
 * the one line that looked too simple to be wrong. See components/host.jsx.
 */
function sheetsOf(stage) {
  return structuralChildren(stage).filter((el) => el.classList.contains('frc-sheet'))
}

function activeIndex(sheets) {
  const i = sheets.findIndex((s) => s.hasAttribute('data-deck-active'))
  return i < 0 ? 0 : i
}

/**
 * Read the ground tones off the ACTIVE sheet rather than off the deck root. A
 * sheet may legally override the deck's ground, so the canvas has to follow the
 * sheet that is actually on screen — that is what keeps a paper sheet from
 * sitting in a black letterbox.
 */
function paint(root, stage, sheets, letterbox, thumbs, ownsViewport) {
  const active = sheets[activeIndex(sheets)] || stage
  const cs = getComputedStyle(active)
  const bg0 = cs.getPropertyValue('--bg0').trim()
  const edge = cs.getPropertyValue('--edge').trim()
  if (!bg0 || !edge) return null

  // The DOCUMENT canvas is only ours when the deck owns the viewport, which is
  // what .frc-letterbox on the root declares. An embedded deck - a demo card, a
  // proof, a deck inside a page - paints itself and leaves the host page alone.
  const doc = root.ownerDocument
  if (ownsViewport) {
    doc.documentElement.style.background = edge
    if (doc.body) doc.body.style.background = edge
  }
  root.style.background = edge
  if (letterbox && letterbox !== root) letterbox.style.background = edge
  stage.style.background = bg0

  if (thumbs) {
    thumbs.style.background = edge
    const current = activeIndex(sheets)
    Array.prototype.forEach.call(thumbs.children, (t, i) => {
      t.style.background = bg0
      t.style.borderColor = edge
      if (i === current) t.setAttribute('data-current', '')
      else t.removeAttribute('data-current')
    })
  }
  return { bg0, edge }
}

export function DeckStage({
  nav = true,
  fit = true,
  thumbs: wireThumbs = true,
  onPaint,
  as: Tag = 'span',
  className,
  ...rest
}) {
  const ref = useRef(null)
  const token = useRef({})
  const [broken, setBroken] = useState(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const root = el.closest('.frc-deck')
    if (!root) { setBroken({ rule: 'must be mounted inside a .frc-deck root.', detail: 'DeckStage reads the deck it drives; it found no .frc-deck ancestor.' }); return undefined }

    // Duplicate first: two painters on one canvas is the state where every other
    // reading is still correct and the deck is still wrong.
    let live = MOUNTED.get(root)
    if (!live) { live = new Set(); MOUNTED.set(root, live) }
    if (live.size > 0 && !live.has(token.current)) {
      setBroken({ rule: 'mounts exactly once per deck.', detail: `A second DeckStage was mounted on this deck; ${live.size} was already driving it. Two painters fight over the canvas.` })
      return undefined
    }
    live.add(token.current)

    const release = () => { live.delete(token.current); if (live.size === 0) MOUNTED.delete(root) }

    const stage = root.querySelector('.frc-stage')
    if (!stage) { setBroken({ rule: 'needs a .frc-stage to paint.', detail: 'The deck root contains no .frc-stage element.' }); release(); return undefined }

    const aspect = stage.getAttribute('data-aspect')
    if (!ASPECTS.has(aspect)) {
      setBroken({ rule: 'requires the stage to declare data-aspect.', detail: aspect ? `data-aspect="${aspect}" is not 4:3 or 16:9.` : 'The stage declares no data-aspect. 4:3 (1920x1440) and 16:9 (1920x1080) are different decks; leaving it unstated is how one silently becomes the other.' })
      release(); return undefined
    }

    const ground = GROUNDS.find((g) => root.classList.contains(g))
    if (!ground) {
      setBroken({ rule: 'requires a ground class on the deck root.', detail: `The root carries none of ${GROUNDS.join(', ')}, so there is no ground for the canvas to follow.` })
      release(); return undefined
    }

    const audience = AUDIENCES.find((a) => root.classList.contains(a))
    if (!audience) {
      setBroken({ rule: 'requires an audience class on the deck root.', detail: `The root carries neither ${AUDIENCES.join(' nor ')}; audience chrome is switched in CSS off that class.` })
      release(); return undefined
    }

    const sheets = sheetsOf(stage)
    const ownsViewport = root.classList.contains('frc-letterbox')
    const letterbox = ownsViewport ? root : root.querySelector('.frc-letterbox')
    const thumbEl = wireThumbs ? root.querySelector('[data-deck-thumbs]') : null

    // ---- the job ----------------------------------------------------------
    const repaint = () => {
      const tones = paint(root, stage, sheetsOf(stage), letterbox, thumbEl, ownsViewport)
      if (tones && onPaint) onPaint(tones)
    }

    const show = (n) => {
      const list = sheetsOf(stage)
      const i = Math.max(0, Math.min(list.length - 1, n))
      list.forEach((s, j) => { if (j === i) s.setAttribute('data-deck-active', ''); else s.removeAttribute('data-deck-active') })
      repaint()
    }

    const fitStage = () => {
      if (!fit || !letterbox) return
      const w = letterbox.clientWidth
      const h = letterbox.clientHeight
      const sw = stage.offsetWidth
      const sh = stage.offsetHeight
      if (!w || !h || !sw || !sh) return
      const k = Math.min(w / sw, h / sh)
      stage.style.transformOrigin = '0 0'
      stage.style.transform = `translate(${Math.round((w - sw * k) / 2)}px, ${Math.round((h - sh * k) / 2)}px) scale(${k})`
    }

    if (thumbEl && thumbEl.children.length === 0) {
      sheets.forEach((s, i) => {
        const t = root.ownerDocument.createElement('button')
        t.type = 'button'
        t.className = 'frc-thumb'
        t.textContent = s.getAttribute('data-screen-label') || s.getAttribute('data-label') || `Sheet ${i + 1}`
        t.addEventListener('click', () => show(i))
        thumbEl.appendChild(t)
      })
    }

    const editable = (t) => Boolean(t) && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    const onKey = (e) => {
      if (editable(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const list = sheetsOf(stage)
      const cur = activeIndex(list)
      switch (e.key) {
        case 'ArrowRight': case 'PageDown': show(cur + 1); break
        case 'ArrowLeft': case 'PageUp': show(cur - 1); break
        case 'Home': show(0); break
        case 'End': show(list.length - 1); break
        case 't': case 'T': if (thumbEl) thumbEl.hidden = !thumbEl.hidden; break
        default: return
      }
      e.preventDefault()
    }

    // A sheet change can come from anywhere — these keys, a deck's own control,
    // an author clicking in the canvas editor — so the repaint is driven off the
    // attribute rather than off whoever moved it.
    const observer = new MutationObserver(repaint)
    observer.observe(stage, { attributes: true, attributeFilter: ['data-deck-active', 'class'], childList: true, subtree: false })

    const doc = root.ownerDocument
    const view = doc.defaultView
    if (nav) doc.addEventListener('keydown', onKey)
    if (view) view.addEventListener('resize', fitStage)

    repaint()
    fitStage()

    return () => {
      observer.disconnect()
      if (nav) doc.removeEventListener('keydown', onKey)
      if (view) view.removeEventListener('resize', fitStage)
      if (ownsViewport) {
        doc.documentElement.style.background = ''
        if (doc.body) doc.body.style.background = ''
      }
      release()
    }
  }, [nav, fit, wireThumbs, onPaint])

  if (broken) return fault('DeckStage', broken.rule, broken.detail)

  return <Tag ref={ref} className={cx('frc-deck-stage', className)} data-frc="DeckStage" hidden aria-hidden="true" {...rest} />
}
