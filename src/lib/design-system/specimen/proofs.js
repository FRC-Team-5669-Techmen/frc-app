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
