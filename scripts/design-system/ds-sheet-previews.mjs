#!/usr/bin/env node
// FRC5669DesignSystem — generate the twenty-six sheet-pattern design-sync previews.
//
// `node scripts/design-system/ds-sheet-previews.mjs`
//
// WHY THIS IS GENERATED AND NOT HAND-AUTHORED. The other 52 previews were written
// by hand, and that is fine: a Button preview is five lines. A sheet pattern is a
// composition of a dozen components filling a 1920 x 1440 surface, and the
// canonical version of every one of them ALREADY EXISTS in
// components/sheets/SheetsDemoCard.jsx — the demo card the design system's own
// specimen route mounts. Retyping those by hand would create a second copy that
// drifts, which is the exact failure this repo keeps designing out.
//
// So the compositions are EXTRACTED from the demo card. What the card shows and
// what the design agent sees on the card in Claude Design are the same markup by
// construction.
//
// THE VIEWPORT PROBLEM, which is the real reason this was left undone. A card
// cell is under a thousand pixels wide; a sheet is 1920 x 1440. The previews
// therefore mount the real pattern in a stage-shaped box at full size and scale
// that box down with a transform. Nothing is re-laid-out for the card: the
// sheet composes at the size it was drawn for and is then made smaller, so what
// the card shows is what a deck gets.
//
// THE BOX IS STAGE-SHAPED BUT IS NOT `.frc-stage`, and that is deliberate.
// `tokens/deck-motion.css` declares `.frc-stage .frc-sheet { display: none }`
// with `[data-deck-active]` switching it back on — that pair is the deck's
// one-sheet-at-a-time mechanism. A card shows ONE sheet and no deck, and these
// previews deliberately mount the pattern UNARMED (no `active`, so no
// transition rule matches and the card shows the base state the system
// guarantees is the visible end state). Unarmed inside a real `.frc-stage`
// means `display: none` — every card renders an empty box.
//
// That is not hypothetical: it is what the 26 cards uploaded on 2026-08-24 do.
// The render pass that cleared them measured the STAGE (921.6 x 691.2, which is
// exactly the 922 x 691 it reported) and a `display: none` sheet still answers
// every DOM question correctly, so nothing caught it.
//
// So the wrapper reproduces the stage BOX — position/size/clip, copied from the
// `.frc-stage` rule — and carries no DS class. The oddity lives in the card
// scaffolding, where it belongs; the pattern element itself is written exactly
// as an author writes it, which is what the design agent reads and imitates.
//
// Ground and audience are set ONCE on the deck root, exactly as a real deck sets
// them and exactly as the demo card does. No pattern takes either as a prop —
// that is the load-bearing rule of the sheets group, and a preview that broke it
// would teach the design agent to break it too.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const CARD = path.join(REPO, 'src/lib/design-system/components/sheets/SheetsDemoCard.jsx')
const OUT = path.join(REPO, '.design-sync/previews')
const PKG = 'frc5669-design-system'

/** Scale that puts the 1920 x 1440 stage inside a card cell. */
const SCALE = 0.48

const src = fs.readFileSync(CARD, 'utf8')

/** Field zone geometry, lifted verbatim — structure, not copy. */
const ZONES = src.match(/const ZONES = \[[\s\S]*?\n\]/)
if (!ZONES) throw new Error('ZONES block not found in SheetsDemoCard.jsx')

const PATTERNS = JSON.parse(
  '[' + src.match(/export const SHEET_PATTERNS = \[([\s\S]*?)\]/)[1]
    .replace(/'/g, '"').replace(/,\s*$/, '') + ']',
)

/** Pull `{sheet('Name', ( … ))}` out by balancing parentheses from the OPENING
    paren of the second argument — not from the next `(` in the file, which is
    `footer(`, and which silently yields the sheet number instead of the sheet. */
function extract(name) {
  const marker = `{sheet('${name}', (`
  const open = src.indexOf(marker)
  if (open < 0) throw new Error(`no composition for ${name}`)
  const i = open + marker.length - 1
  let depth = 1
  let j = i + 1
  for (; j < src.length && depth > 0; j++) {
    if (src[j] === '(') depth++
    else if (src[j] === ')') depth--
  }
  if (depth !== 0) throw new Error(`unbalanced composition for ${name}`)
  return src.slice(i + 1, j - 1).trim()
}

const FOOTER_PARTS = "['Brief', 'Build', 'Field', 'Season']"
const DECK = "'Sheet pattern reference'"

/** A CARD SHOWS A SHEET AT REST, so the pattern is mounted WITHOUT `active`.
 *
 * Every transition in this system is gated on `[data-deck-active]`, and the base
 * style of a sheet is its visible end state. Mounting with the gate armed means
 * the platform's thumbnail capture can freeze a sheet halfway through a banner
 * wipe — measured: the first CoverSheet capture came out clipped at 415px with
 * the gold chevron band across it. Suppressing the animation instead would leave
 * that band on the sheet, because its `content` is declared inside the same
 * gated block. Not arming the gate removes it. The card page's own stylesheet
 * re-shows the sheet, which is one line and is commented there.
 */
function unarm(body) {
  return body.replace(/^(<[A-Za-z][\w]*)\s+active\b/, '$1')
}

/** `footer(n)` / `footer(n, part)` is a demo-card helper; inline what it returns. */
function inlineFooter(body) {
  return body.replace(/footer=\{footer\((\d+)(?:,\s*(\d+))?\)\}/g,
    (_m, n, p) => `footer={{ deckName: ${DECK}, parts: ${FOOTER_PARTS}, partIndex: ${p ?? 0}, sheet: ${n}, total: 26 }}`)
}

/** Every design-system name the composition actually uses. */
function importsFor(body) {
  const found = new Set()
  for (const m of body.matchAll(/<\/?([A-Z][A-Za-z0-9]*)/g)) found.add(m[1])
  for (const m of body.matchAll(/\{<(Icon[A-Za-z0-9]*)/g)) found.add(m[1])
  return [...found].sort()
}

const header = (name) => `// GENERATED by scripts/design-system/ds-sheet-previews.mjs — do not hand-edit.
// The composition is extracted from components/sheets/SheetsDemoCard.jsx, so the
// specimen card and this preview show the same markup by construction.
//
// The pattern is mounted UNARMED at its real 1920 x 1440 and the stage-shaped
// box around it is scaled down to fit the card. Nothing is re-laid-out for the
// cell. Ground and audience are set once on the deck root, never on the pattern.
//
// The box is NOT .frc-stage: that class carries the deck's one-sheet-at-a-time
// rule (.frc-stage .frc-sheet { display: none } unless [data-deck-active]), and
// an unarmed sheet inside one renders an empty card. It reproduces the stage's
// box instead — same position, size and clip — so the sheet lays out identically.`

const stage = `
const S = ${SCALE}

const Stage = ({ children }: any) => (
  <div className="frc-deck frc-ground-squadron frc-audience-internal" style={{ display: 'inline-grid' }}>
    <div style={{ width: Math.round(1920 * S), height: Math.round(1440 * S), overflow: 'hidden' }}>
      <div style={{ position: 'relative', width: 1920, height: 1440, overflow: 'hidden', transform: \`scale(\${S})\`, transformOrigin: '0 0' }}>
        {children}
      </div>
    </div>
  </div>
)
`

let written = 0
for (const name of PATTERNS) {
  const body = unarm(inlineFooter(extract(name)))
  const names = importsFor(body)
  const needsZones = /zones=\{ZONES\}/.test(body)
  const out = [
    header(name),
    `import { ${names.join(', ')} } from '${PKG}'`,
    '',
    needsZones ? `/** Field zone geometry. Structure, not copy: nobody reads a point list aloud. */\n${ZONES[0]}\n` : '',
    stage.trim(),
    '',
    // The story is named `Pattern`, not after the sheet: `export const CoverSheet`
    // beside `import { CoverSheet }` is a duplicate declaration, and naming it
    // after the role instead collides too — SubteamStatus and Blocker are both
    // real component names. The card carries the pattern name in its @dsCard
    // marker, and single card mode never prints the story label anyway.
    `export const Pattern = () => (`,
    '  <Stage>',
    body.split('\n').map((l) => (l.trim() ? '    ' + l.replace(/^ {8}/, '') : l)).join('\n'),
    '  </Stage>',
    ')',
    '',
  ].filter((s) => s !== '').join('\n')
  fs.writeFileSync(path.join(OUT, `${name}.tsx`), out)
  written++
}

console.log(`ds-sheet-previews: wrote ${written} previews to .design-sync/previews/`)
