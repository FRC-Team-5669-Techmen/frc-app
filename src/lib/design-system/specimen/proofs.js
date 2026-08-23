// FRC5669DesignSystem — browser proofs for the /_ds specimen route.
// Every function here MEASURES the real rendered components. Nothing here
// re-implements markup. A harness that copies what it measures passes every
// check forever, including after the real component breaks.
import { ALIAS_NAMES, GROUND_ALIASES, GROUNDS, PAPER_MUST_DIFFER } from '../tokens.js'

export const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim()

const GOLD_RE = /#ffe629\b|rgba?\(\s*255\s*,\s*230\s*,\s*41\b/i
const OPAQUE_WHITE_RE = /(^|[^\d.])rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)|rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*1\s*\)|#ffffff\b|#fff\b/i

export function containsGold(value) {
  return GOLD_RE.test(String(value ?? ''))
}

export function readAliases(el) {
  const cs = getComputedStyle(el)
  const out = {}
  for (const name of ALIAS_NAMES) out[name] = norm(cs.getPropertyValue(name))
  return out
}

/**
 * Prove that each ground scope resolves EVERY alias to its own literal.
 * probes: { squadron: Element, field: Element, paper: Element } — the same
 * component tree rendered inside each scope.
 */
export function proveGrounds(probes) {
  const actual = {}
  for (const g of GROUNDS) actual[g] = readAliases(probes[g])
  const rows = ALIAS_NAMES.map((name) => {
    const cells = {}
    for (const g of GROUNDS) {
      const expected = norm(GROUND_ALIASES[g][name])
      const got = actual[g][name]
      cells[g] = { expected, actual: got, ok: got === expected && got !== '' }
    }
    const frozen = PAPER_MUST_DIFFER.includes(name) && actual.paper[name] === actual.squadron[name]
    const goldOnPaper = containsGold(actual.paper[name])
    return { name, cells, frozen, goldOnPaper, ok: GROUNDS.every((g) => cells[g].ok) && !frozen && !goldOnPaper }
  })
  const failed = rows.filter((r) => !r.ok)
  return {
    rows,
    ok: failed.length === 0,
    counts: {
      aliases: ALIAS_NAMES.length,
      checked: ALIAS_NAMES.length * GROUNDS.length,
      failed: failed.length,
      frozen: rows.filter((r) => r.frozen).length,
      goldOnPaper: rows.filter((r) => r.goldOnPaper).length,
    },
  }
}

const COLOR_PROPS = [
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'text-shadow', 'box-shadow', 'fill', 'stroke', 'text-decoration-color', 'caret-color',
]

function describe(el) {
  const cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
  const frc = el.closest ? el.closest('[data-frc]') : null
  return `${el.tagName.toLowerCase()}${cls}${frc ? ` (in ${frc.getAttribute('data-frc')})` : ''}`
}

/** Every rendered color on every element under `root` (and its pseudo-elements): gold must not appear. */
export function scanForGold(root) {
  const offenders = []
  let elements = 0
  const all = [root, ...root.querySelectorAll('*')]
  for (const el of all) {
    elements++
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo)
      if (pseudo && cs.content === 'none') continue
      for (const p of COLOR_PROPS) {
        const v = cs.getPropertyValue(p)
        if (v && containsGold(v)) offenders.push({ el: describe(el) + (pseudo || ''), prop: p, value: v })
      }
    }
  }
  return { elements, offenders, ok: offenders.length === 0 }
}

const SURFACE_PROPS = ['background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color', 'outline-color', 'box-shadow']

/** Deck chrome never shows a neutral white: no opaque #FFFFFF surface, border, outline or shadow under `root`. */
export function scanForNeutralWhite(root) {
  const offenders = []
  let elements = 0
  const all = [root, ...root.querySelectorAll('*')]
  for (const el of all) {
    elements++
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo)
      if (pseudo && cs.content === 'none') continue
      for (const p of SURFACE_PROPS) {
        const v = cs.getPropertyValue(p)
        if (!v || v === 'none' || v === 'transparent' || v === 'rgba(0, 0, 0, 0)') continue
        if (p.startsWith('border') && cs.getPropertyValue(p.replace('-color', '-width')) === '0px') continue
        if (p === 'outline-color' && cs.outlineStyle === 'none') continue
        if (OPAQUE_WHITE_RE.test(v)) offenders.push({ el: describe(el) + (pseudo || ''), prop: p, value: v })
      }
    }
  }
  return { elements, offenders, ok: offenders.length === 0 }
}

/**
 * Walk every stylesheet carrying frc- rules and report any animation or
 * transition declared OUTSIDE @media (prefers-reduced-motion: no-preference).
 */
export function auditMotionGate() {
  const out = { sheets: 0, animated: 0, ungated: [] }
  const GATE = /prefers-reduced-motion:\s*no-preference/
  const walk = (rules, gated) => {
    for (const r of rules) {
      if (typeof CSSMediaRule !== 'undefined' && r instanceof CSSMediaRule) {
        walk(r.cssRules, gated || GATE.test(r.conditionText || r.media.mediaText))
        continue
      }
      if (typeof CSSKeyframesRule !== 'undefined' && r instanceof CSSKeyframesRule) continue
      if (typeof CSSImportRule !== 'undefined' && r instanceof CSSImportRule) continue
      if (r.cssRules && !(typeof CSSStyleRule !== 'undefined' && r instanceof CSSStyleRule)) {
        walk(r.cssRules, gated)
        continue
      }
      if (typeof CSSStyleRule !== 'undefined' && r instanceof CSSStyleRule) {
        const st = r.style
        // A shorthand that contains var() leaves its longhands pending-substitution
        // (empty strings), so read the shorthand as well as the longhand.
        const anim = st.getPropertyValue('animation-name') || st.getPropertyValue('animation')
        const trans = st.getPropertyValue('transition-property') || st.getPropertyValue('transition')
        const hasAnim = anim && anim !== 'none'
        const hasTrans = trans && trans !== 'none' && st.getPropertyValue('transition-duration') !== '0s'
        if (hasAnim || hasTrans) {
          out.animated++
          if (!gated) out.ungated.push(r.selectorText)
        }
        if (r.cssRules) walk(r.cssRules, gated)
      }
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    if (!rules) continue
    let carriesFrc = false
    for (const r of rules) { if (r.cssText && r.cssText.includes('frc-')) { carriesFrc = true; break } }
    if (!carriesFrc) continue
    out.sheets++
    walk(rules, false)
  }
  out.ok = out.ungated.length === 0 && out.animated > 0
  return out
}

const MOTION_SELECTOR = '[class*="frc-in-"], [class*="frc-img-"], .frc-bg-pan, .frc-pulse, .frc-drift, .frc-scanlines, .frc-shimmer, .frc-sheet'

/**
 * Base styles are the visible end state: outside any [data-deck-active] /
 * .frc-run container, every motion-classed element must be fully visible,
 * unclipped, untransformed and unfiltered, with no animation applied.
 */
export function measureStatic(root) {
  const offenders = []
  const els = root.querySelectorAll(MOTION_SELECTOR)
  for (const el of els) {
    const cs = getComputedStyle(el)
    const problems = []
    if (cs.opacity !== '1') problems.push(`opacity ${cs.opacity}`)
    if (cs.transform !== 'none') problems.push(`transform ${cs.transform}`)
    if (cs.clipPath !== 'none') problems.push(`clip-path ${cs.clipPath}`)
    if (cs.filter !== 'none') problems.push(`filter ${cs.filter}`)
    if (cs.visibility !== 'visible') problems.push(`visibility ${cs.visibility}`)
    if (cs.display === 'none') problems.push('display none')
    if (cs.animationName && cs.animationName !== 'none') problems.push(`animation ${cs.animationName}`)
    if (problems.length) offenders.push({ el: describe(el), problems })
  }
  return { measured: els.length, offenders, ok: offenders.length === 0 }
}

/** Restart gated motion inside a container by toggling its run state. */
export function replay(el, attr = 'data-deck-active') {
  if (!el) return
  if (attr === 'class') {
    el.classList.remove('frc-run')
    void el.offsetWidth
    el.classList.add('frc-run')
    return
  }
  el.removeAttribute(attr)
  void el.offsetWidth
  el.setAttribute(attr, '')
}

/** How many REAL component instances are mounted, by data-frc name. */
export function countMounted(root = document) {
  const counts = {}
  for (const el of root.querySelectorAll('[data-frc]')) {
    const n = el.getAttribute('data-frc')
    counts[n] = (counts[n] || 0) + 1
  }
  return counts
}

/* ---------------------------------------------------------------------------
   PASS 2 proofs: image treatments, the platform backplate, the match clock,
   and containment of the alliance partition.
   The regexes below NAME alliance red and blue in order to FIND them. This file
   is the detector; it paints nothing, and ds-audit exempts it from the
   raw-color scan for exactly that reason.
   ------------------------------------------------------------------------ */

const ALLIANCE_RE = /#ed1c24\b|rgba?\(\s*237\s*,\s*28\s*,\s*36\b|#0066b3\b|rgba?\(\s*0\s*,\s*102\s*,\s*179\b/i

export function containsAlliance(value) {
  return ALLIANCE_RE.test(String(value ?? ''))
}

/**
 * The red partition, contained: --alliance-red and --alliance-blue may render
 * ONLY inside the named components.
 *
 * Two deliberate exclusions, both reported rather than hidden:
 *  - The token catalogue (.ds-swatch) is route chrome, not deck content: it
 *    paints every published color as a swatch, which is the whole point of it.
 *    Nothing else on the route is exempt.
 *  - PROGRAM CHROME COLLIDES BY VALUE. FIRST LEGO League red is published as
 *    #ED1C24, the same value as alliance red, so a computed style cannot tell
 *    the two apart after substitution. Program chrome (ProgramLockup, the
 *    program rail) is counted separately as a collision, never as a leak.
 */
export function scanForAlliance(root, options = {}) {
  const allowed = options.allowed || ['AllianceSplit', 'ScoutTable', 'FieldDiagram']
  const inside = []
  const offenders = []
  const collisions = []
  let elements = 0
  let skipped = 0
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!el.closest || el.closest('.ds-swatch')) { skipped++; continue }
    elements++
    const isProgramChrome = Boolean(el.closest('[data-frc="ProgramLockup"]') || (el.className && String(el.className).includes('frc-program')))
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo)
      if (pseudo && cs.content === 'none') continue
      for (const p of COLOR_PROPS) {
        const v = cs.getPropertyValue(p)
        if (!v || !containsAlliance(v)) continue
        const owner = el.closest('[data-frc]')
        const name = owner ? owner.getAttribute('data-frc') : null
        const host = el.closest(allowed.map((a) => `[data-frc="${a}"]`).join(','))
        const record = { el: describe(el) + (pseudo || ''), prop: p, value: v, owner: name }
        if (host || allowed.includes(name)) inside.push(record)
        else if (isProgramChrome) collisions.push(record)
        else offenders.push(record)
      }
    }
  }
  return { elements, skipped, inside, collisions, offenders, ok: offenders.length === 0 }
}

/** A real transparent PNG, drawn at runtime so no literal color lives in the route. */
export function makeAlphaPng(color, size = 240) {
  const c = document.createElement('canvas')
  c.width = size
  c.height = size
  const ctx = c.getContext('2d')
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(size / 2, size * 0.42, size * 0.3, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(size * 0.34, size * 0.6, size * 0.32, size * 0.34)
  return c.toDataURL('image/png')
}

const RECTANGLE_PROPS = ['background-color', 'background-image', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'box-shadow', 'outline-style']

/**
 * A cutout has no rectangle to draw: no backplate, no border, no box-shadow, no
 * rectangular overlay, on any ground.
 *
 * Two things are measured but not counted against it. A drop-shadow FILTER is
 * legal, because a filter follows the silhouette rather than the slot; it is
 * not read here. And a painted pseudo-element no thicker than 4px in one
 * dimension is a RULE, not a plate - that is the shelf datum line, a line under
 * the part. Rules are returned separately so the distinction is visible instead
 * of assumed.
 */
export function scanCutoutRectangles(root) {
  const offenders = []
  const rules = []
  let elements = 0
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (el.tagName === 'FIGCAPTION' || (el.className && String(el.className).includes('frc-cutout-caption'))) continue
    elements++
    for (const pseudo of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, pseudo)
      if (pseudo && cs.content === 'none') continue
      const thin = pseudo ? (parseFloat(cs.height) <= 4 || parseFloat(cs.width) <= 4) : false
      for (const p of RECTANGLE_PROPS) {
        const v = cs.getPropertyValue(p)
        if (!v) continue
        const record = { el: describe(el) + (pseudo || ''), prop: p, value: v, height: cs.height }
        if (p.endsWith('-width')) { if (v !== '0px') (thin ? rules : offenders).push(record); continue }
        if (p === 'outline-style') { if (v !== 'none') offenders.push(record); continue }
        if (v === 'none' || v === 'transparent' || v === 'rgba(0, 0, 0, 0)') continue
        ;(thin ? rules : offenders).push(record)
      }
    }
  }
  return { elements, offenders, rules, ok: offenders.length === 0 }
}

/** Computed values for a handful of properties, normalised. */
export function readComputed(el, props, pseudo = null) {
  const cs = getComputedStyle(el, pseudo)
  const out = {}
  for (const p of props) out[p] = norm(cs.getPropertyValue(p))
  return out
}

/**
 * The platform paints its own neutral wash on the image-slot shadow part named
 * "frame". This registers a faithful stub of that element - the same part name,
 * the same wash - so tokens/image-slot.css can be MEASURED overriding it rather
 * than assumed to. The stub is route-only; nothing in the bundle defines it.
 */
export const PLATFORM_WASH = 'rgba(127, 127, 127, 0.08)'

export function definePlatformImageSlot() {
  if (typeof window === 'undefined' || !window.customElements) return false
  if (window.customElements.get('image-slot')) return true
  class PlatformImageSlot extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return
      const root = this.attachShadow({ mode: 'open' })
      const frame = document.createElement('div')
      frame.setAttribute('part', 'frame')
      frame.style.width = '100%'
      frame.style.height = '100%'
      frame.style.minHeight = '120px'
      frame.style.background = PLATFORM_WASH
      root.appendChild(frame)
    }
  }
  window.customElements.define('image-slot', PlatformImageSlot)
  return true
}

/** Read the computed background of a stub image-slot's shadow part. */
export function readSlotFrame(el) {
  const frame = el && el.shadowRoot ? el.shadowRoot.querySelector('[part="frame"]') : null
  if (!frame) return null
  const cs = getComputedStyle(frame)
  return {
    backgroundColor: norm(cs.backgroundColor),
    backgroundImage: norm(cs.backgroundImage),
    boxShadow: norm(cs.boxShadow),
    suppressed: norm(cs.backgroundColor) === 'rgba(0, 0, 0, 0)' || norm(cs.backgroundColor) === 'transparent',
  }
}

/** #RRGGBB to the rgb() string getComputedStyle returns, so a token can be compared to a measurement. */
export function toRgbString(value) {
  const m = String(value).trim().match(/^#([0-9a-f]{6})$/i)
  if (!m) return String(value).trim()
  const n = parseInt(m[1], 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}

/** Computed "no paint at all": the two spellings a browser returns. */
export function isTransparent(value) {
  const v = norm(value)
  return v === 'transparent' || v === 'rgba(0, 0, 0, 0)'
}
