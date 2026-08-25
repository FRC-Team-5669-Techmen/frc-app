#!/usr/bin/env node
// FRC5669DesignSystem — static audit. `npm run ds:audit`. Exit 1 on any drift.
//
//  1. Each ground scope in tokens/colors.css declares the SAME alias set, every
//     value a literal (no var()), and no alias is declared at the root scope.
//  2. The paper scope carries no Techmen Gold.
//  3. tokens.js mirrors colors.css exactly.
//  4. Never invent a color: hex / rgb literals appear only in tokens/colors.css
//     and only from the published set.
//  5. styles.css only imports, in the specified order.
//  6. Every animation / transition in the token sheets sits inside
//     @media (prefers-reduced-motion: no-preference).
//  7. _ds_manifest.json is accurate: every listed file exists, every component
//     has .jsx + .d.ts + .prompt.md, every group has a demo card, alias names match.
//  8. No emoji anywhere in the bundle.
//  9. Sheet patterns inherit their ground: no `.frc-ground-*` selector in
//     tokens/sheets.css and no ground class named in any components/sheets file.
// 10. Every sheet pattern defaults to one of the four transitions.
// 11. NEITHER template is a starting point, and the manifest carries no
//     startingPoints key — the platform reads templates[] and that key matched
//     nothing upstream. Both are readable reference for hand-built decks.
// 12. Zero invariant guard fault markers in any template. A marker is a caught
//     defect, not an accepted state (standards check 40).
// 15. DeckStage is registered and its prompt states the mount-once rule, because
//     a deck author reading only that file needs to know.
// 14. No alias is reachable in a state where it does not resolve: .frc-deck shares
//     the SQUADRON block as the fail-safe base, that block stays ahead of field and
//     paper in source order, and every var() in the token sheets resolves everywhere.
// 13. Every wired asset, and every mirror of it elsewhere in the repo, still
//     hashes to its recorded provenance, so a silent recolor of a mark cannot
//     land in the bundle OR in public/.
//
// 16-27 are the SOURCE-SIDE counterparts of the numbered pre-delivery checks in
// docs/FRC_CLAUDE_DESIGN_STANDARDS.md. Those run against a generated deck; these
// run against this repo. Neither replaces the other — source cannot see what a
// deck added, and a deck cannot see whether the rule it relied on ships — and
// the two number INDEPENDENTLY, so they are always named when referenced
// ("pre-delivery check 43", "ds:audit check 16"). Where one of these is narrower
// than its counterpart, the narrowing is written down at the check.
// 16. The deck chrome contract ships in the TOKEN LAYER: .frc-letterbox,
//     .frc-letterbox > .frc-stage, .frc-thumbs-dock, .frc-stage and the thumb
//     rail are declared in tokens/, and no template's inline <style> declares an
//     frc- rule. (pre-delivery 43. THE ONE WITH A SHIPPED REGRESSION BEHIND IT.)
// 17. Every motion class the standard's inheritance block names has a rule in
//     the token layer; the vocabulary slice is pinned by hash and located from
//     the INHERITANCE, NON-NEGOTIABLE anchor, never by a bare first-occurrence
//     search, because the standard quotes both slice markers. (pre-delivery 8-11)
// 18. No parallel motion vocabulary: every @keyframes is frc-, every animation
//     names a declared keyframe, every class is frc-, no component ships CSS.
//     (pre-delivery 12)
// 19. Gold is never the RESTING color of body copy. (pre-delivery 14)
// 20. --alliance-red / --alliance-blue are used only under .frc-ground-field and
//     only by the four components allowed to. (pre-delivery 16)
// 21. Every ambient layer is clipped out of the footer logo zone. (pre-delivery 23)
// 22. Nothing is hidden in the base state: opacity 0 / visibility hidden only
//     inside @keyframes, entrance and reveal classes painted only inside the
//     motion gate, and no display: none on body copy. (pre-delivery 32)
// 23. Running copy is never an array prop: no string[] prop outside two pinned
//     structural exemptions. (pre-delivery 36)
// 24. Every guard is registered and reaches the shared guard; nothing else in
//     components/ throws. (pre-delivery 40)
// 25. LIVE and REC are the ground's accent in every scope, never a red.
//     (pre-delivery 17)
// 26. Radii stay small: 2 / 3 / 4px from the radius tokens.
// 27. Deck chrome never shows a neutral white: no surface alias is #FFFFFF and
//
// 28. No sheet kind leaves its content row unassigned: every kind that renders
//     a .frc-sheet-content is named in exactly one of the three distribution-axis
//     lists (start / center / stretch) in tokens/sheets.css, a kind with no content
//     row owns its own .frc-sheet-<kind> .frc-sheet-body rule instead, a stretch
//     kind actually raises --fill-row, and .frc-sample / .frc-sample-media still
//     read it. The kind list is derived from the pattern sources, never typed here.
//     --white is never painted as a surface.
//
// 29. HOST TRANSPARENCY, both ends. components/host.jsx ships the one mechanism
//     and exports its whole surface; every component that walks or type-checks a
//     child reaches it rather than assuming a direct child; DeckStage reads the
//     sheets through it; and no token-sheet rule uses a `>` combinator across a
//     relationship that crosses a deck-author boundary, where the Claude Design
//     runtime can interpose a layout-transparent host node.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const ROOT = path.resolve(REPO, 'src/lib/design-system')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(ROOT, p))

const failures = []
const fail = (msg) => failures.push(msg)
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '')

// ---------- 1–2. ground scopes ----------
const colors = stripComments(read('tokens/colors.css'))
const GROUND_CLASSES = ['frc-ground-squadron', 'frc-ground-field', 'frc-ground-paper']
function scopeBlock(selectorStart) {
  const i = colors.indexOf(selectorStart)
  if (i < 0) { fail(`colors.css: missing scope ${selectorStart}`); return '' }
  const open = colors.indexOf('{', i)
  let depth = 0
  for (let j = open; j < colors.length; j++) {
    if (colors[j] === '{') depth++
    else if (colors[j] === '}') { depth--; if (depth === 0) return colors.slice(open + 1, j) }
  }
  fail(`colors.css: unterminated scope ${selectorStart}`)
  return ''
}
function decls(body) {
  const out = {}
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;\s*$/)
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}
const scopes = {}
for (const cls of GROUND_CLASSES) scopes[cls] = decls(scopeBlock(`\n.${cls} {`))
const rootDecls = decls(scopeBlock(':where(.frc-deck'))
const names = Object.keys(scopes['frc-ground-squadron'])
for (const cls of GROUND_CLASSES) {
  const have = Object.keys(scopes[cls])
  const missing = names.filter((n) => !have.includes(n))
  const extra = have.filter((n) => !names.includes(n))
  if (missing.length) fail(`${cls}: missing aliases ${missing.join(', ')}`)
  if (extra.length) fail(`${cls}: extra aliases ${extra.join(', ')}`)
  for (const [k, v] of Object.entries(scopes[cls])) {
    if (/var\(/.test(v)) fail(`${cls}: ${k} references var() — aliases must be literals`)
    if (!v) fail(`${cls}: ${k} is empty`)
  }
}
for (const n of names) if (n in rootDecls) fail(`root scope declares ground alias ${n} — aliases live only in ground scopes`)
const GOLD = /#ffe629|rgba?\(\s*255\s*,\s*230\s*,\s*41/i
for (const [k, v] of Object.entries(scopes['frc-ground-paper'])) if (GOLD.test(v)) fail(`paper scope: ${k} carries Techmen Gold (${v})`)
for (const [k, v] of Object.entries(scopes['frc-ground-paper'])) if (/glow/.test(k) && !/^(none|0)$/.test(v)) fail(`paper scope: ${k} is not flattened (${v})`)

// ---------- 3. tokens.js mirror ----------
const tokens = await import(pathToFileURL(path.join(ROOT, 'tokens.js')).href)
const norm = (s) => String(s).replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim()
for (const [g, cls] of [['squadron', 'frc-ground-squadron'], ['field', 'frc-ground-field'], ['paper', 'frc-ground-paper']]) {
  const mirror = tokens.GROUND_ALIASES[g]
  for (const n of names) if (norm(mirror[n] ?? '') !== norm(scopes[cls][n] ?? '')) fail(`tokens.js ${g} ${n}: "${mirror[n]}" ≠ colors.css "${scopes[cls][n]}"`)
  for (const n of Object.keys(mirror)) if (!(n in scopes[cls])) fail(`tokens.js ${g} lists ${n}, colors.css does not`)
}
const ROOT_EXPECT = {
  '--gold': tokens.BRAND.gold, '--black': tokens.BRAND.black, '--space': tokens.BRAND.space, '--ash': tokens.BRAND.ash, '--white': tokens.BRAND.white,
  '--alliance-red': tokens.PARTITION.allianceRed, '--alliance-blue': tokens.PARTITION.allianceBlue, '--warn': tokens.PARTITION.warn, '--fault': tokens.PARTITION.fault, '--ok': tokens.PARTITION.ok,
  '--program': tokens.PROGRAM.frc, '--program-frc': tokens.PROGRAM.frc, '--program-ftc': tokens.PROGRAM.ftc, '--program-fll': tokens.PROGRAM.fll,
  '--program-fll-explore': tokens.PROGRAM.fllExplore, '--program-fll-discover': tokens.PROGRAM.fllDiscover, '--program-fll-ink': tokens.PROGRAM.fllInk,
  '--season': tokens.SEASON_DEFAULT,
}
for (const [k, v] of Object.entries(ROOT_EXPECT)) if (norm(rootDecls[k] ?? '') !== norm(v)) fail(`root token ${k}: colors.css "${rootDecls[k]}" ≠ tokens.js "${v}"`)

// ---------- 4. never invent a color ----------
const PUBLISHED_HEX = new Set([
  'FFE629', '000000', '53565F', '94989C', 'FFFFFF',
  '0B0C0E', '141619', '1E2126', '0E1013', '16191E', '1E222A', '272C35', '05070A',
  'E9E7E1', 'DCD9D1', '14161A', '55595F', '7A6300',
  'ED1C24', '0066B3', 'D98C3F', 'B0503C', '6FA57B',
  '009CD7', 'F57E25', '00A651', '662D91', '231F20',
])
const PUBLISHED_RGB = new Set(['255,230,41', '0,0,0', '83,86,95', '148,152,156', '255,255,255', '20,22,26', '122,99,0', '0,156,215', '237,28,36', '0,102,179'])
for (const m of colors.matchAll(/#([0-9a-f]{3,8})\b/gi)) if (!PUBLISHED_HEX.has(m[1].toUpperCase())) fail(`colors.css: #${m[1]} is not a published color`)
for (const m of colors.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/gi)) if (!PUBLISHED_RGB.has(`${m[1]},${m[2]},${m[3]}`)) fail(`colors.css: rgb(${m[1]},${m[2]},${m[3]}) is not a published color`)

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}
const allFiles = walk(ROOT).map((p) => path.relative(ROOT, p).replace(/\\/g, '/'))
// specimen/proofs.js is the DETECTOR: its regexes name gold and white in order to
// find them. It uses no color; it is exempt from the raw-color scan by design.
const COLOR_EXEMPT = new Set(['tokens/colors.css', 'tokens.js', '_ds_manifest.json', 'specimen/proofs.js'])
for (const f of allFiles) {
  // assets/ holds SUPPLIED ARTWORK. The marks are used as supplied, so their
  // colors are not a choice this system gets to make and are not scanned here.
  // Their bytes are pinned by assets/PROVENANCE.json instead (check 13).
  if (COLOR_EXEMPT.has(f) || f.endsWith('.md') || f.startsWith('assets/')) continue
  const src = f.endsWith('.css') ? stripComments(read(f)) : read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of src.matchAll(/(?<![\w&])#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?!\))/g)) {
    if (f.endsWith('.html') && /^(frc|core|brand|grounds|tokens|type|motion|surfaces|chrome|wiring)/.test(m[1])) continue
    fail(`${f}: raw color #${m[1]} — tokens only`)
  }
  for (const m of src.matchAll(/\brgba?\(/g)) fail(`${f}: raw ${m[0]}…) — tokens only (offset ${m.index})`)
  for (const m of src.matchAll(/\b(hsla?|oklch|lab|lch|color)\(/g)) fail(`${f}: raw ${m[0]}…) — tokens only`)
}

// ---------- 5. styles.css imports only, in order ----------
const ORDER = ['fonts', 'colors', 'typography', 'effects', 'surfaces', 'motion', 'deck-motion', 'image-slot', 'data', 'surface-components', 'forms', 'sheets', 'slot-display']
const styles = stripComments(read('styles.css')).split('\n').map((l) => l.trim()).filter(Boolean)
const imports = styles.map((l) => l.match(/^@import\s+'\.\/tokens\/([\w-]+)\.css';$/)?.[1])
if (styles.some((l) => !l.startsWith('@import'))) fail('styles.css contains something other than @import lines')
if (imports.join(',') !== ORDER.join(',')) fail(`styles.css import order is ${imports.join(', ')}; expected ${ORDER.join(', ')}`)
for (const t of ORDER) if (!exists(`tokens/${t}.css`)) fail(`tokens/${t}.css missing`)

// ---------- 6. motion gate ----------
function gatedRanges(css) {
  const ranges = []
  const re = /@media\s*\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)\s*\{/g
  let m
  while ((m = re.exec(css))) {
    let depth = 1
    let j = m.index + m[0].length
    for (; j < css.length && depth > 0; j++) { if (css[j] === '{') depth++; else if (css[j] === '}') depth-- }
    ranges.push([m.index, j])
  }
  return ranges
}
for (const f of allFiles.filter((p) => p.endsWith('.css'))) {
  const css = stripComments(read(f))
  const ranges = gatedRanges(css)
  const inGate = (i) => ranges.some(([a, b]) => i >= a && i < b)
  for (const m of css.matchAll(/(^|[\s;{])(animation(?:-name)?|transition(?:-property)?)\s*:\s*([^;]+);/g)) {
    if (/^\s*none\s*$/.test(m[3])) continue
    if (!inGate(m.index)) fail(`${f}: "${m[2]}: ${m[3].trim()}" is outside @media (prefers-reduced-motion: no-preference)`)
  }
  for (const m of css.matchAll(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce/g)) fail(`${f}: second gate at ${m.index} — do not add a reduce gate`)
}

// ---------- 7. manifest accuracy ----------
const manifest = JSON.parse(read('_ds_manifest.json'))
if (manifest.namespace !== 'FRC5669DesignSystem') fail('manifest namespace')
if (manifest.classPrefix !== 'frc-') fail('manifest classPrefix')
for (const p of manifest.globalCssPaths) if (!exists(p)) fail(`manifest globalCssPaths: ${p} missing`)
for (const p of manifest.tokens.order) if (!exists(p)) fail(`manifest tokens.order: ${p} missing`)
if (manifest.tokens.order.join(',') !== ORDER.map((t) => `tokens/${t}.css`).join(',')) fail('manifest tokens.order ≠ styles.css order')
if (JSON.stringify(manifest.tokens.groundAliases) !== JSON.stringify(names)) fail(`manifest groundAliases ≠ colors.css aliases`)
for (const [k, v] of Object.entries({ ...manifest.tokens.brand, ...manifest.tokens.partition, ...manifest.tokens.program, ...manifest.tokens.season })) if (norm(rootDecls[k] ?? '') !== norm(v)) fail(`manifest token ${k} "${v}" ≠ colors.css "${rootDecls[k]}"`)
const groups = new Set()
for (const c of manifest.components) {
  groups.add(c.group)
  for (const key of ['sourcePath', 'types', 'prompt']) if (!exists(c[key])) fail(`manifest component ${c.name}: ${key} ${c[key]} missing`)
  if (!exists(`components/${c.group}/${c.name}.jsx`)) fail(`component ${c.name} not at components/${c.group}/${c.name}.jsx`)
  const src = read(c.sourcePath)
  if (!src.includes(`data-frc="${c.name}"`)) fail(`component ${c.name}: root element does not carry data-frc="${c.name}"`)
}
const cardGroups = new Set(manifest.cards.map((c) => c.group.toLowerCase()))
for (const g of groups) {
  if (!cardGroups.has(g)) fail(`group ${g} has no demo card in the manifest`)
}
for (const c of manifest.cards) {
  if (!exists(c.path)) fail(`manifest card ${c.name}: ${c.path} missing`)
  const first = read(c.path).split('\n')[0]
  if (!first.includes('@dsCard')) fail(`card ${c.path}: first line lacks the @dsCard marker`)
}
for (const t of manifest.templates) if (!exists(t.path)) fail(`manifest template ${t.path} missing`)
if ('startingPoints' in manifest) fail('manifest still carries startingPoints — the platform reads templates[]; that key matched nothing upstream and described a route into Claude Design that does not exist')
for (const h of manifest.helpers) if (!exists(h.sourcePath)) fail(`manifest helper ${h.sourcePath} missing`)
if (!exists(manifest.specimen.sourcePath)) fail('manifest specimen.sourcePath missing')
if (!exists(manifest.specimen.proofs)) fail('manifest specimen.proofs missing')
if (!exists(manifest.tokens.mirror)) fail('manifest tokens.mirror missing')
if (!fs.existsSync(path.resolve(HERE, '../../', manifest.audit.split(' ')[0]))) fail('manifest audit path missing')
if (manifest.version !== tokens.VERSION) fail(`manifest version ${manifest.version} ≠ tokens.js ${tokens.VERSION}`)
// every component .jsx on disk is listed
for (const f of allFiles.filter((p) => /^components\/(core|brand|data|surfaces|forms|sheets)\/[A-Z]\w+\.jsx$/.test(p) && !/DemoCard|AssetSlot|sheets\/Sheet\.jsx/.test(p))) {
  if (!manifest.components.some((c) => c.sourcePath === f)) fail(`${f} exists but is not in the manifest`)
}
for (const a of manifest.pending.assets) if (exists(a)) fail(`manifest pending asset ${a} exists — move it out of pending`)

// ---------- 8. no emoji ----------
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}]|\u{FE0F}/u
// BINARY FILES ARE NOT SOURCE TEXT and must not be scanned as if they were.
// Decoding a woff2 as UTF-8 yields arbitrary codepoints, and enough of them land
// in the emoji ranges to fail this check on six of the eighteen self-hosted
// faces — a false positive that says nothing about the system. Sniffed by NUL
// byte rather than by an extension list, so the next binary asset type added to
// assets/ is covered without anyone remembering to extend a list.
const isBinary = (f) => { try { return fs.readFileSync(path.join(ROOT, f)).includes(0) } catch { return false } }
for (const f of allFiles) {
  if (isBinary(f)) continue
  const lines = read(f).split('\n')
  lines.forEach((l, i) => { if (EMOJI.test(l)) fail(`${f}:${i + 1}: emoji`) })
}

// ---------- 9-11. sheet patterns ----------
const GROUND_SELECTOR = /\.frc-ground-(squadron|field|paper)/g
const sheetsCss = stripComments(read('tokens/sheets.css'))
for (const m of sheetsCss.matchAll(GROUND_SELECTOR)) {
  fail(`tokens/sheets.css names .frc-ground-${m[1]} at ${m.index} — a sheet pattern inherits its ground and never declares one`)
}
const SHEET_TRANSITIONS = ['shutter', 'boot', 'banner', 'cut']
const sheetFiles = allFiles.filter((p) => /^components\/sheets\/[A-Z]\w+\.jsx$/.test(p) && !/DemoCard|sheets\/Sheet\.jsx/.test(p))
if (sheetFiles.length !== 26) fail(`components/sheets holds ${sheetFiles.length} pattern files; the spec names 26`)
for (const f of sheetFiles) {
  // Comments EXPLAIN the ground rule — MatchBreakdownSheet says in prose why the
  // alliance scoping lives in data.css. CODE is what may not name a ground.
  const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  for (const m of src.matchAll(GROUND_SELECTOR)) fail(`${f} names .frc-ground-${m[1]} — patterns inherit the ground from the deck`)
  if (/\baudience\s*[=:]/.test(src)) {
    fail(`${f} takes an audience prop — audience is a class on the deck root, switched in CSS`)
  }
  const m = src.match(/transition\s*=\s*'(\w+)'/)
  if (!m) fail(`${f} declares no default transition`)
  else if (!SHEET_TRANSITIONS.includes(m[1])) fail(`${f} defaults to "${m[1]}", which is not one of the four transitions`)
}
// The shell stopped being a starting point when it became unreachable: no
// template can be shipped to Claude Design from a repo-sourced design system, so
// a deck there starts from Blank and assembles out of the library. Both files
// stay as readable reference, and neither may claim to be a starting point.
const specimenTpl = manifest.templates.find((t) => /Specimen/.test(t.path))
if (!specimenTpl) fail('manifest templates does not list templates/Specimen.dc.html')
const deckTpl = manifest.templates.find((t) => /Deck\.dc\.html/.test(t.path))
if (!deckTpl) fail('manifest templates does not list templates/Deck.dc.html')
for (const t of manifest.templates) {
  if (t.copied !== false) fail(`manifest template ${t.path} must be marked copied: false — neither template is a starting point`)
  if (t.startingPoint !== false) fail(`manifest template ${t.path} must be marked startingPoint: false`)
}

// ---------- 12. no fault marker in a template ----------
// Guards render a visible rust marker at run time rather than throwing, because
// a guard that throws during a presentation takes the deck down in front of the
// room. The marker is NOT a soft landing: a template carrying one is a defect
// that shipped, and this is where that is caught.
const FAULT_MARKS = [/data-frc-fault/, /\bfrc-fault\b/]
for (const t of manifest.templates) {
  const src = read(t.path)
  for (const re of FAULT_MARKS) {
    if (re.test(src)) fail(`${t.path}: carries an invariant guard fault marker (${re.source}). A marker is a caught defect, not an accepted state.`)
  }
}

// ---------- 13. asset provenance ----------
// The marks are used AS SUPPLIED. Each wired asset was compared against the
// canonical file on the team branding page before it was wired; this re-checks
// the bytes, so a later edit to one of them fails the audit instead of shipping.
if (exists('assets/PROVENANCE.json')) {
  const prov = JSON.parse(read('assets/PROVENANCE.json'))
  for (const a of prov.assets ?? []) {
    if (!exists(a.file)) { fail(`provenance: ${a.file} is recorded as wired but is not on disk`); continue }
    const buf = fs.readFileSync(path.join(ROOT, a.file))
    const sum = crypto.createHash('sha256').update(buf).digest('hex')
    if (sum !== a.sha256) fail(`provenance: ${a.file} sha256 ${sum.slice(0, 16)}… ≠ recorded ${a.sha256.slice(0, 16)}… — an asset changed after it was verified against ${a.source}`)
    if (a.bytes != null && buf.length !== a.bytes) fail(`provenance: ${a.file} is ${buf.length} bytes, recorded ${a.bytes}`)
    // Mirrors are the same canonical bytes served from elsewhere in the repo
    // (public/ for the app). A mark that is correct in the bundle and recolored
    // in public/ is exactly the failure this check exists to catch: the splash
    // screen shipped a recolored team mark for months because nothing compared
    // the two.
    for (const m of a.mirrors ?? []) {
      const mp = path.resolve(REPO, m)
      if (!fs.existsSync(mp)) { fail(`provenance: mirror ${m} of ${a.file} is missing`); continue }
      const msum = crypto.createHash('sha256').update(fs.readFileSync(mp)).digest('hex')
      if (msum !== a.sha256) fail(`provenance: mirror ${m} sha256 ${msum.slice(0, 16)}… ≠ canonical ${a.sha256.slice(0, 16)}… — the copy served to the app differs from the verified mark`)
    }
  }
  for (const f of prov.stillEmpty ?? []) {
    if (exists(f)) fail(`provenance: ${f} is listed as still empty but exists — verify it against its canonical source and move it into assets[]`)
  }
}

// ---------- 14. no alias is reachable in a state where it does not resolve ----------
// The dangerous failure is PARTIAL resolution, not total failure. The raw palette
// lives on :where(.frc-deck, .frc-ground-*) while the semantic aliases live on the
// ground classes, so a groundless deck root used to paint gold from the palette and
// resolve nothing else — it looked almost right, which is worse than looking broken.
// SQUADRON is the documented default ground, so .frc-deck shares the SQUADRON block
// and every reachable state resolves the complete set. This check holds that.
{
  // (a) .frc-deck must SHARE the squadron block, not carry its own copy of the 36.
  const sqAt = colors.indexOf('\n.frc-ground-squadron {')
  const selStart = colors.lastIndexOf('}', sqAt) + 1
  const sharedSelector = colors.slice(selStart, colors.indexOf('{', sqAt)).trim()
  if (!/(^|[\s,]) *\.frc-deck *(,|$)/m.test(sharedSelector)) {
    fail('colors.css: .frc-deck does not share the SQUADRON alias block — a groundless deck root resolves the palette but none of the 36 aliases, which renders partially instead of failing outright')
  }
  for (const m of colors.matchAll(/(^|\})\s*([^{}]*\.frc-deck[^{}]*)\{([^{}]*)\}/g)) {
    const [, , sel, body] = m
    if (sel.includes('.frc-ground-squadron')) continue
    const dup = Object.keys(decls(body)).filter((n) => names.includes(n))
    if (dup.length) fail(`colors.css: selector "${sel.trim()}" re-declares ground alias(es) ${dup.join(', ')} — .frc-deck must SHARE the squadron block, never duplicate its values`)
  }

  // (b) Source order is load-bearing. On one element carrying .frc-deck AND a ground
  // class the two selectors tie on specificity, so the later block is what wins.
  for (const later of ['frc-ground-field', 'frc-ground-paper']) {
    if (colors.indexOf(`\n.${later} {`) < sqAt) {
      fail(`colors.css: .${later} is declared BEFORE the shared .frc-deck/.frc-ground-squadron block — equal specificity means source order decides, so an element carrying both classes would resolve as squadron`)
    }
  }

  // (c) Enumerate every reachable state and require the full alias set in each.
  // "deck root" is the state with no ground class at all. Its set is derived from
  // whether .frc-deck actually shares the squadron block, not assumed — so deleting
  // .frc-deck from that selector fails here too, naming all 36 unresolved aliases,
  // rather than only tripping the structural check above.
  const deckSharesSquadron = /(^|[\s,]) *\.frc-deck *(,|$)/m.test(sharedSelector)
  const STATES = {
    'deck root (no ground class)': deckSharesSquadron ? scopes['frc-ground-squadron'] : {},
    squadron: scopes['frc-ground-squadron'],
    field: scopes['frc-ground-field'],
    paper: scopes['frc-ground-paper'],
  }
  for (const [state, set] of Object.entries(STATES)) {
    const unresolved = names.filter((n) => !(n in set) || !set[n])
    if (unresolved.length) fail(`state "${state}": ${unresolved.length} of ${names.length} alias(es) do not resolve — ${unresolved.join(', ')}`)
  }

  // (d) Every var(--x) reference in the token sheets must resolve in EVERY state, or
  // carry a fallback. Declarations are collected across ALL token sheets (typography
  // declares the type scale that surfaces.css consumes), so this flags only a name no
  // scope declares at all — a typo, or an alias deleted from under its consumers.
  // A name declared in some ground scopes but not all is caught by check 1, which
  // compares the three sets by name.
  const tokenFiles = fs.readdirSync(path.join(ROOT, 'tokens')).filter((f) => f.endsWith('.css'))
  const declaredAnywhere = new Set()
  const sources = {}
  for (const f of tokenFiles) {
    const src = stripComments(read(path.join('tokens', f)))
    sources[f] = src
    for (const [, prop] of src.matchAll(/(--[\w-]+)\s*:/g)) declaredAnywhere.add(prop)
  }
  for (const [f, src] of Object.entries(sources)) {
    const seen = new Set()
    for (const [, prop] of src.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
      if (declaredAnywhere.has(prop) || seen.has(prop)) continue
      seen.add(prop)
      fail(`tokens/${f}: var(${prop}) has no fallback and ${prop} is declared in no scope — it resolves to nothing in every state`)
    }
  }
}

// ---------- 15. DeckStage ----------
// DeckStage is the one component that is behaviour rather than appearance, and
// the only one a deck is WRONG to omit — it carries the job the deck shell's
// stage script used to do. A deck author who reads only its prompt still has to
// learn the mount-once rule, so the prompt is required to say it.
{
  const ds = manifest.components.find((c) => c.name === 'DeckStage')
  if (!ds) fail('manifest does not list DeckStage — the deck shell stage script has no home without it')
  else {
    const prompt = read(ds.prompt)
    if (!/exactly once/i.test(prompt)) fail('DeckStage.prompt.md does not state that every deck mounts it exactly once')
    const src = read(ds.sourcePath)
    for (const token of ['--bg0', '--edge']) {
      if (!src.includes(token)) fail(`DeckStage does not read ${token} — painting the canvas from the active ground is the whole job`)
    }
    if (!/from '\.\.\/guard\.jsx'/.test(src)) fail('DeckStage does not import the shared guard — its refusals must render the same rust marker as every other guard')
  }
}

// ---------- 16–27. source-side counterparts of the pre-delivery audit ----------
// The numbered checks in docs/FRC_CLAUDE_DESIGN_STANDARDS.md run against a
// GENERATED DECK. The checks below are their counterparts against the SOURCE.
// Both are needed and neither replaces the other: source cannot see what a deck
// added, and a deck cannot see whether the rule it relied on actually ships.
// Each one names the pre-delivery check it answers, and where it is NARROWER
// than that check the narrowing is written down — a check that fires on
// legitimate code gets commented out within a month, and then it is worse than
// not existing, because everyone assumes it is running.

// A minimal CSS walker. One entry per style rule, carrying the at-rule preludes
// it sits inside, so a declaration inside @keyframes or inside the
// reduced-motion gate can be told apart from one in the base state.
function cssRules(css) {
  const out = []
  const walk = (s, offset, ats) => {
    let buf = ''
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if (ch === '{') {
        const prelude = buf.trim()
        buf = ''
        let depth = 1
        let j = i + 1
        for (; j < s.length && depth > 0; j++) {
          if (s[j] === '{') depth++
          else if (s[j] === '}') depth--
        }
        const body = s.slice(i + 1, j - 1)
        if (prelude.startsWith('@')) {
          if (/^@(media|supports|layer|container|scope|keyframes)/.test(prelude)) walk(body, offset + i + 1, [...ats, prelude])
        } else {
          out.push({ sel: prelude, body, ats, index: offset + i })
        }
        i = j - 1
      } else if (ch === '}' || ch === ';') buf = ''
      else buf += ch
    }
  }
  walk(css, 0, [])
  return out
}
// Split on a separator that is not inside parentheses: `inset: 0 0 var(--x) 0`
// is four parts, and `var(--a, b)` stays one.
function splitTop(s, sep) {
  const out = []
  let depth = 0
  let buf = ''
  for (const ch of s) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (buf.trim()) out.push(buf.trim()); buf = '' }
    else buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}
function props(body) {
  const out = []
  for (const part of splitTop(body, ';')) {
    const m = part.match(/^\s*([-\w]+)\s*:\s*([\s\S]+?)\s*$/)
    if (m) out.push([m[1], m[2].replace(/\s+/g, ' ')])
  }
  return out
}
// The last compound of each selector in a list: what the rule actually paints.
const subjects = (sel) => splitTop(sel, ',').map((part) => {
  const toks = splitTop(part, ' ')
  return (toks[toks.length - 1] ?? '').split(/[>+~]/).pop()
})
const classesIn = (compound) => [...compound.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
const inKeyframes = (r) => r.ats.some((a) => a.startsWith('@keyframes'))
const inMotionGate = (r) => r.ats.some((a) => /prefers-reduced-motion\s*:\s*no-preference/.test(a))

const TOKEN_FILES = fs.readdirSync(path.join(ROOT, 'tokens')).filter((f) => f.endsWith('.css')).map((f) => `tokens/${f}`)
// Quoted strings hide braces and dots from every scan below (fonts.css carries
// a Google Fonts URL); blank them rather than dropping them so offsets survive.
const blankStrings = (s) => s.replace(/'[^']*'|"[^"]*"/g, (m) => m[0].repeat(m.length))
const TOKEN_SRC = Object.fromEntries(TOKEN_FILES.map((f) => [f, blankStrings(stripComments(read(f)))]))
const TOKEN_RULES = TOKEN_FILES.flatMap((f) => cssRules(TOKEN_SRC[f]).map((r) => ({ ...r, file: f })))
const COMPONENT_JSX = allFiles.filter((p) => /^components\/[\w-]+\/[A-Z]\w+\.jsx$/.test(p))
const codeOf = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
// Body copy, defined from the type scale rather than guessed: a rule is body
// copy when it sets the body face AND a body size. That is what makes .frc-body,
// .frc-card-body, .frc-safety-body and .frc-step-text body copy and leaves mono
// chrome — labels, badges, buttons, readouts — out of it. Checks 19 and 22 both
// read this set, so they cannot disagree about what copy is.
const BODY_CLASSES = new Set(['frc-body', 'frc-body-sm'])
for (const r of TOKEN_RULES) {
  const p = Object.fromEntries(props(r.body))
  if (/var\(--font-body\)/.test(p['font-family'] ?? '') && /var\(--fs-body(-sm)?\)/.test(p['font-size'] ?? '')) {
    for (const s of subjects(r.sel)) for (const c of classesIn(s)) BODY_CLASSES.add(c)
  }
}
if (BODY_CLASSES.size < 5) fail(`checks 19/22: only ${BODY_CLASSES.size} body-copy class(es) identified — the definition (font-family: var(--font-body) + font-size: var(--fs-body|--fs-body-sm)) no longer matches the type layer, so both checks have stopped looking at body copy`)

// ---------- 16. the deck chrome contract ships in the TOKEN LAYER ----------
// Counterpart of pre-delivery check 43. That check reads a deck root and finds
// `.frc-letterbox` on it. This one asks the question the deck cannot: does the
// class DO anything? `.frc-letterbox`, `.frc-letterbox > .frc-stage` and
// `.frc-thumbs-dock` shipped for weeks declared ONLY inside the two templates'
// inline <style> blocks. Nothing is copied any more, so a deck that set the
// class exactly as the routing header says got a class DeckStage read
// correctly and that was otherwise inert: no fixed positioning, no clipping, no
// absolute stage to scale into. Presence on the root and presence in the token
// layer are two different facts and only one of them is in the artifact.
{
  const REQUIRED = [
    ['.frc-letterbox', ['position', 'inset', 'overflow']],
    // Containment, not parentage, since check 29: the runtime can put a host
    // between the letterbox and the stage, and `>` then matched nothing.
    ['.frc-letterbox .frc-stage', ['position']],
    ['.frc-thumbs-dock', ['position']],
    ['.frc-stage', ['width', 'height', 'overflow']],
    ['.frc-thumbs', ['background']],
    ['.frc-thumb', ['background']],
  ]
  const flat = (s) => s.replace(/\s+/g, ' ').trim()
  for (const [sel, must] of REQUIRED) {
    const hits = TOKEN_RULES.filter((r) => !inKeyframes(r) && splitTop(r.sel, ',').some((p) => flat(p) === sel))
    if (!hits.length) {
      fail(`deck chrome: no rule for "${sel}" in the token layer — a deck sets this class from the routing header and gets nothing unless the rule ships in styles.css`)
      continue
    }
    const declared = new Set(hits.flatMap((r) => props(r.body).map(([p]) => p)))
    const missing = must.filter((p) => !declared.has(p))
    if (missing.length) fail(`deck chrome: "${sel}" declares no ${missing.join(', ')} — the class would be present, read by DeckStage, and functionally inert`)
  }
  // The general form of the same regression: a template is readable reference
  // that nothing copies, so a rule declared there reaches no deck at all.
  for (const t of manifest.templates) {
    const src = read(t.path)
    for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
      for (const r of cssRules(blankStrings(stripComments(m[1])))) {
        if (/\.frc-[\w-]+/.test(r.sel)) fail(`${t.path}: its inline <style> declares "${flat(r.sel)}" — a template is reference nobody copies, so an frc- rule declared there ships to no deck. Move it into tokens/.`)
      }
    }
  }
}

const MOTION_VOCAB = [
  ...['shutter', 'boot', 'banner', 'cut'].map((n) => `frc-slide-${n}`),
  ...['rise', 'drop', 'left', 'right', 'fade', 'blur', 'tracking', 'stamp', 'zoom', 'strike', 'flicker'].map((n) => `frc-in-${n}`),
  ...['wipe', 'wipe-down', 'iris', 'chamfer', 'zoom', 'kenburns'].map((n) => `frc-img-${n}`),
  'frc-ambient',
  ...['patch', 'stencil', 'chevron', 'stars', 'rivet', 'bloom',
    'extrusion', 'tread', 'hazard', 'matrix', 'fieldgrid', 'bracket',
    'grid', 'hatch', 'foldline'].map((n) => `frc-ambient-${n}`),
  'frc-bg-pan', 'frc-scanlines', 'frc-pulse', 'frc-drift', 'frc-shimmer',
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `frc-d${n}`),
]
// The entrance and reveal half of the vocabulary, which check 22 also reads:
// those are the classes whose base state must be the visible end state.
const MOTION_CLASSES = new Set(MOTION_VOCAB.filter((c) => /^frc-(in|img)-/.test(c)))

// ---------- 17. every motion class the standard names actually exists ----------
// Counterpart of pre-delivery checks 8–11, which count frc-in-*, frc-img-*,
// frc-d1–8 and ambient layers in a deck. A deck told to use frc-in-tracking and
// handed a class with no rule fails silently — the element simply appears. The
// vocabulary is quoted from the inheritance block, so the block itself is
// pinned by hash: if the standard's motion list is edited, this check fails and
// asks for the expansion below to be re-derived rather than drifting.
// ONE DIRECTION ONLY: every documented class must exist. The reverse would fire
// on internal classes the standard has no reason to name (.frc-ambient-hazard-top).
{
  const doc = read('docs/FRC_CLAUDE_DESIGN_STANDARDS.md')
  // THE SLICE IS ANCHORED INSIDE THE INHERITANCE BLOCK, not taken as the first
  // occurrence in the file. Both markers are ordinary prose and the standard now
  // QUOTES them where it describes this check, so each appears twice. A bare
  // indexOf takes whichever comes first, which means a doc edit ABOVE the block
  // reslices this check onto text that is not the vocabulary — and it fails
  // loudly with a message blaming MOTION_VOCAB for a change that never touched
  // it. Reproduced before it was fixed; ds-audit-controls.mjs holds both the
  // decoy control (a quote above the block must NOT move the slice) and the
  // missing-anchor control.
  const block = doc.indexOf('INHERITANCE, NON-NEGOTIABLE')
  const from = block < 0 ? -1 : doc.indexOf('Motion: use only classes defined in the FRC motion tokens.', block)
  const to = from < 0 ? -1 : doc.indexOf('The two ambient systems are separate', from)
  if (block < 0) fail('standards: INHERITANCE, NON-NEGOTIABLE is not in the document — check 17 anchors its motion-vocabulary slice inside that block, and without the anchor it cannot tell the block from prose quoting it')
  else if (from < 0 || to < 0) fail('standards: the inheritance block motion section could not be located — check 17 reads its vocabulary from there')
  else {
    const block = doc.slice(from, to).replace(/\s+/g, ' ').trim()
    const sum = crypto.createHash('sha256').update(block).digest('hex')
    const PINNED = '9108b7e1ec71ecfe209bdf1c3764513b8ef2244fce9f9da6721b89c747048e81'
    if (sum !== PINNED) fail(`standards: the motion vocabulary in the inheritance block changed (sha256 ${sum.slice(0, 16)}… ≠ pinned ${PINNED.slice(0, 16)}…) — re-derive MOTION_VOCAB in ds-audit check 17 from the new text, then re-pin the hash`)
    const declared = new Set(TOKEN_RULES.flatMap((r) => splitTop(r.sel, ',').flatMap((p) => classesIn(p))))
    for (const cls of MOTION_VOCAB) {
      if (!declared.has(cls)) fail(`motion vocabulary: .${cls} is named in the standard's inheritance block but no rule in the token layer declares it — a deck using it gets nothing, silently`)
    }
  }
}

// ---------- 18. no parallel motion vocabulary in the source ----------
// Counterpart of pre-delivery check 12, which greps a deck for a repeated
// non-frc- class prefix. The system itself has to hold the same line: every
// keyframe is frc-, every animation names a keyframe that exists here, and no
// component ships CSS of its own.
{
  const keyframeNames = new Set()
  for (const f of TOKEN_FILES) for (const m of TOKEN_SRC[f].matchAll(/@keyframes\s+([\w-]+)/g)) {
    if (!m[1].startsWith('frc-')) fail(`${f}: @keyframes ${m[1]} is not frc- prefixed — one motion vocabulary, one prefix`)
    keyframeNames.add(m[1])
  }
  const NOT_A_NAME = new Set(['none', 'both', 'forwards', 'backwards', 'infinite', 'alternate', 'alternate-reverse', 'reverse', 'normal', 'running', 'paused', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'initial', 'inherit', 'unset', 'revert', 'step-start', 'step-end'])
  for (const r of TOKEN_RULES) {
    for (const [prop, value] of props(r.body)) {
      if (prop !== 'animation' && prop !== 'animation-name') continue
      if (/^\s*none\s*$/.test(value)) continue
      const idents = splitTop(value, ' ').filter((t) => /^-?[A-Za-z][\w-]*$/.test(t) && !NOT_A_NAME.has(t))
      if (!idents.some((t) => keyframeNames.has(t))) fail(`${r.file}: "${prop}: ${value}" on "${r.sel.trim()}" names no keyframe declared in the token layer`)
      for (const t of idents) if (t.startsWith('frc-') && !keyframeNames.has(t)) fail(`${r.file}: "${prop}: ${value}" references @keyframes ${t}, which is not declared`)
    }
  }
  for (const r of TOKEN_RULES) {
    for (const p of splitTop(r.sel, ',')) {
      for (const cls of classesIn(p)) if (!cls.startsWith('frc-')) fail(`${r.file}: selector "${r.sel.trim()}" names .${cls} — every class in this system carries the frc- prefix`)
    }
  }
  for (const f of COMPONENT_JSX) {
    const src = codeOf(f)
    if (/@keyframes/.test(src)) fail(`${f}: declares @keyframes — motion lives in tokens/motion.css and tokens/deck-motion.css only`)
    if (/<style[\s>]/.test(src)) fail(`${f}: ships a <style> block — a component carries classes, never its own stylesheet`)
  }
}

// ---------- 19. gold is never body copy ----------
// Counterpart of pre-delivery check 14. THE DEFINITION IS THE WHOLE CHECK, and
// it is BODY_CLASSES above, drawn from the type scale.
// Gold is derived too, not listed: any alias whose literal is Techmen Gold in
// any ground scope. That catches --accent, --fg-hero, --rim, --live and the
// washes, it follows the tokens if a gold alias is added, and because the same
// alias carries bronze on paper it covers the paper accent by name.
// NOT COVERED: gold applied to body copy from a component's inline style, and
// gold reaching body copy through `color: inherit` from a gold ancestor.
// STATE IS NOT RUNNING TEXT. FRC_Design_System.md: "Gold is never body copy. It
// is hero type, hero numerals, active state, and the LIVE dot… gold used as
// RUNNING TEXT at projection distance is fatiguing." So the defect is gold as
// the RESTING color of copy, and a rule qualified by a state — [data-lead] on
// the ComparisonSheet lead cell, :hover, :focus — is the active state the brand
// grants. [data-deck-active] is deliberately not a state: it is on for the whole
// time a sheet is up, so gold under it would be resting color wearing a qualifier.
{
  const STATE_QUALIFIED = /\[data-(?!deck-active)[\w-]+|:hover|:focus|:active|:checked|:target/
  const GOLD_ALIASES = new Set(names.filter((n) => GROUND_CLASSES.some((c) => GOLD.test(scopes[c][n] ?? ''))))
  const goldRefs = (value) => [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]).filter((n) => GOLD_ALIASES.has(n) || n.startsWith('--gold'))
  for (const r of TOKEN_RULES) {
    if (!subjects(r.sel).some((s) => classesIn(s).some((c) => BODY_CLASSES.has(c)))) continue
    if (STATE_QUALIFIED.test(r.sel)) continue
    for (const [prop, value] of props(r.body)) {
      if (prop !== 'color') continue
      const gold = goldRefs(value)
      if (gold.length) fail(`${r.file}: "${r.sel.trim()}" paints body copy with ${gold.join(', ')} — gold is identity, hero type and active state, never running copy`)
    }
  }
}

// ---------- 20. the alliance partition is contained, in the source ----------
// Counterpart of pre-delivery check 16. Four components may reach for
// --alliance-red / --alliance-blue and only on the FIELD ground: AllianceSplit
// (.frc-alliance), ScoutTable (.frc-scout), FieldDiagram (.frc-field-diagram)
// and MatchBreakdownSheet (.frc-match). Everywhere else the RED / BLUE word
// carries the meaning and the colors do not resolve at all.
{
  const ALLOWED = ['frc-alliance', 'frc-scout', 'frc-field-diagram', 'frc-match']
  for (const r of TOKEN_RULES) {
    if (!props(r.body).some(([, v]) => /var\(\s*--alliance-(red|blue)/.test(v))) continue
    const sel = r.sel.replace(/\s+/g, ' ').trim()
    if (!sel.includes('.frc-ground-field')) fail(`${r.file}: "${sel}" reaches for an alliance color outside .frc-ground-field`)
    if (!ALLOWED.some((c) => new RegExp(`\\.${c}(?![\\w-])`).test(sel))) fail(`${r.file}: "${sel}" reaches for an alliance color outside the four components allowed to (${ALLOWED.join(', ')})`)
  }
  for (const f of TOKEN_FILES.filter((x) => x !== 'tokens/colors.css')) {
    for (const m of TOKEN_SRC[f].matchAll(/(--alliance-(?:red|blue))\s*:/g)) fail(`${f}: re-declares ${m[1]} — the partition is declared once, in tokens/colors.css`)
  }
  // A component names the classes; the scoping is CSS. A component that reached
  // for the token directly would carry the partition past the ground scope.
  for (const f of COMPONENT_JSX) {
    if (/--alliance-(red|blue)/.test(codeOf(f))) fail(`${f}: names an alliance token in code — alliance colors resolve in the token layer under .frc-ground-field, never from a component`)
  }
}

// ---------- 21. no ambient layer runs behind the footer logo zone ----------
// Counterpart of pre-delivery check 23, which looks for an ambient layer under
// the FIRST mark in a deck. The source-side fact is that .frc-ambient carries
// the clip and that nothing quietly takes it back off.
// ONE PINNED EXEMPTION: .frc-ambient-hazard drops the clip because its own box
// already stops at the rail (inset bottom var(--rail-h)), and that inset is
// re-checked here — remove it and this fires.
{
  const CLIP = 'inset(0 0 var(--rail-h) 0)'
  const EXEMPT = 'frc-ambient-hazard'
  const isBase = (r) => splitTop(r.sel, ',').some((p) => p.trim() === '.frc-ambient')
  const baseClip = TOKEN_RULES.filter(isBase).flatMap((r) => props(r.body)).find(([p]) => p === 'clip-path')
  if (!baseClip) fail('.frc-ambient declares no clip-path — every ambient layer is clipped out of the footer rail band so a FIRST mark never sits on a busy background')
  else if (baseClip[1].replace(/\s+/g, ' ') !== CLIP) fail(`.frc-ambient clip-path is "${baseClip[1]}", not "${CLIP}" — the clip is what keeps ambient texture out of the footer logo zone`)
  for (const r of TOKEN_RULES) {
    if (isBase(r)) continue
    const subj = subjects(r.sel).flatMap(classesIn).filter((c) => c.startsWith('frc-ambient'))
    if (!subj.length || !props(r.body).some(([p]) => p === 'clip-path')) continue
    if (!subj.includes(EXEMPT)) {
      fail(`${r.file}: "${r.sel.trim()}" overrides clip-path on an ambient layer — the footer logo zone clip is not optional (the one exemption is .${EXEMPT}, whose own box stops at the rail)`)
      continue
    }
    const merged = TOKEN_RULES.filter((x) => subjects(x.sel).some((s) => classesIn(s).includes(EXEMPT)) && !/-top(?![\w-])/.test(x.sel))
    const inset = merged.flatMap((x) => props(x.body)).find(([p]) => p === 'inset')
    const bottom = inset ? splitTop(inset[1], ' ')[2] : null
    if (bottom !== 'var(--rail-h)') fail(`.${EXEMPT} drops the ambient clip but its inset bottom is ${bottom ?? 'undeclared'}, not var(--rail-h) — it would run under the footer logo zone`)
  }
}

// ---------- 22. nothing is hidden in the base state ----------
// Counterpart of pre-delivery check 32. NARROWED DELIBERATELY, three ways.
// (a) opacity: 0 and visibility: hidden are read STRUCTURALLY, not by grep: a
//     from-frame inside @keyframes is the motion library doing its job; the same
//     declaration in a RULE is a hide-until-something and hides in print, in PDF
//     and under reduced motion too. The token layer has zero of the latter.
// (b) An entrance or reveal class may only be painted inside the reduced-motion
//     gate. Base styles are the visible end state, so a base rule on frc-in-* is
//     exactly how an element ends up hidden when motion never runs.
// (c) display: none is judged ONLY where the subject is body copy. display: none
//     is how this system switches audience chrome, divider variants, mark
//     variants and the inactive sheet, and how paper suppresses the bloom layer;
//     a paired-restore requirement was tried first and fires on every one of
//     those. NOT COVERED, therefore: display: none on a class that carries no
//     body copy, which the pre-delivery check still has to catch in the artifact.
// (d) THE STEP GATE IS THE ONE EXEMPTION, and it is granted on the terms this
//     check names rather than in spite of them. (a)'s whole argument is that a
//     rule-level hide "hides it in print, in PDF and under reduced motion too" —
//     so the exemption is shaped to answer exactly that: it applies ONLY to a
//     selector that is both gated on [data-deck-active][data-step] and subject
//     to [data-step-item], `data-step` exists only while a live DeckSteps is
//     driving, hiding under reduced motion is the REQUIREMENT (the reveal still
//     steps, it just does not animate), and check 30 separately refuses to pass
//     unless the @media print release exists. Nothing else in the token layer
//     may hide in a rule, which control 30f proves by moving one of these
//     declarations outside the gate.
const STEP_GATE = /\[data-deck-active\]\[data-step\]/
const stepGated = (sel) => STEP_GATE.test(sel) && /\[data-step-item\]/.test(sel)
{
  for (const r of TOKEN_RULES) {
    if (!inKeyframes(r) && !stepGated(r.sel)) {
      for (const [prop, value] of props(r.body)) {
        if (prop === 'opacity' && /^0(\.0+)?%?$/.test(value.trim())) fail(`${r.file}: "${r.sel.trim()}" sets opacity: 0 in a rule — only a keyframe from-frame may hide an element, because a rule hides it in print, in PDF and under reduced motion too`)
        if (prop === 'visibility' && value.trim() === 'hidden') fail(`${r.file}: "${r.sel.trim()}" sets visibility: hidden — the base state of every element is visible`)
        if (prop === 'display' && value.trim() === 'none') {
          const hidden = subjects(r.sel).flatMap(classesIn).filter((c) => BODY_CLASSES.has(c))
          if (hidden.length) fail(`${r.file}: "${r.sel.trim()}" hides body copy (.${hidden.join(', .')}) — copy is never hidden in the base state`)
        }
      }
    }
    if (inKeyframes(r)) continue
    if (subjects(r.sel).flatMap(classesIn).some((c) => MOTION_CLASSES.has(c)) && !inMotionGate(r)) {
      fail(`${r.file}: "${r.sel.trim()}" paints an entrance/reveal class outside @media (prefers-reduced-motion: no-preference) — base styles are the visible end state and a motion class alone must change nothing`)
    }
  }
}

// ---------- 23. running copy is never an array prop ----------
// Counterpart of pre-delivery check 36. The test is the ELEMENT TYPE, which
// separates copy from structure without a judgement call: string[] is a list of
// words a deck author would want to edit on the canvas, and number[],
// number[][] and FieldZone[] are scale and geometry. DecisionMatrix weights and
// scores and FieldDiagram zones are out of scope by construction rather than by
// exemption, which is the point — they must never be what this check argues about.
// Two exemptions are pinned by name, each a vocabulary rather than copy. A NEW
// string[] prop fails until it is either turned into children or pinned here
// with its reason, which is the decision this check exists to force.
// NOT COVERED: an object array carrying copy fields ({ label: string }[]) — none
// exists today, and typing that precisely enough not to catch a structural
// record needs the TS parser this script deliberately does not have.
{
  const PINNED = {
    'DeckFooterProps.parts': 'part NAMES driving the progress rail: chrome the footer derives its rail from, not sheet copy',
    'SheetBaseProps.ambient': 'ambient layer NAMES from the motion vocabulary, not copy',
  }
  const STRING_ARRAY = /(^|\|\s*)(readonly\s+)?(string\[\]|Array<\s*string\s*>|ReadonlyArray<\s*string\s*>)\s*(\||$)/
  const seen = new Set()
  for (const f of allFiles.filter((p) => /^components\/[\w-]+\/[A-Z]\w+\.d\.ts$/.test(p))) {
    for (const [, iface, body] of read(f).matchAll(/export interface (\w*Props)[^{]*\{([\s\S]*?)\n\}/g)) {
      for (const line of body.split('\n')) {
        const m = line.match(/^\s*(\w+)\??\s*:\s*(.+?)\s*$/)
        if (!m || !STRING_ARRAY.test(m[2])) continue
        const key = `${iface}.${m[1]}`
        seen.add(key)
        if (!(key in PINNED)) fail(`${f}: ${key} is typed ${m[2]} — running copy lives in children, and further strings in a plain slot attribute; only structure stays an array prop. If this is structure, pin it in ds-audit check 23 with its reason.`)
      }
    }
  }
  for (const key of Object.keys(PINNED)) if (!seen.has(key)) fail(`check 23: ${key} is pinned as a structural array prop but no longer exists — drop the pin so the next string[] prop is judged on its own`)
}

// ---------- 24. every guard is registered, and nothing else throws ----------
// Counterpart of pre-delivery check 40, which counts fault markers in a deck. A
// marker can only appear if the guard is wired, so this is where the wiring is
// checked: each guarded component reaches the shared guard, still names the
// condition it refuses, and no component invents a second guard behaviour by
// throwing on its own.
{
  const GUARDS = {
    'components/surfaces/ImageFrame.jsx': ['bleed', 'screenshot'],
    'components/surfaces/Cutout.jsx': ['cover'],
    'components/surfaces/SponsorWall.jsx': ['SponsorTier', 'Cutout'],
    'components/sheets/SafetySheet.jsx': ['SafetyNote'],
    'components/brand/FirstName.jsx': ['possessive'],
    'components/brand/DeckStage.jsx': ['frc-deck'],
    'components/brand/DeckSteps.jsx': ['DeckStage', 'frc-deck'],
  }
  for (const [f, keywords] of Object.entries(GUARDS)) {
    if (!exists(f)) { fail(`guard: ${f} is registered as guarded but does not exist`); continue }
    const src = codeOf(f)
    if (!/from '\.\.\/guard\.jsx'/.test(src)) fail(`${f}: does not import the shared guard — every refusal renders the one rust marker`)
    if (!/\bfault\(/.test(src)) fail(`${f}: is registered as guarded but never trips a guard`)
    for (const k of keywords) if (!new RegExp(String.raw`(?<![\w-])${k}(?![\w-])`).test(src)) fail(`${f}: its guard no longer names "${k}" — the refusal it is registered for may have been removed`)
  }
  for (const f of COMPONENT_JSX) {
    const src = codeOf(f)
    if (/\bfault\(/.test(src) && !(f in GUARDS)) fail(`${f}: trips a guard but is not registered in ds-audit check 24 — an unregistered guard is one nobody knows to look for`)
    if (/\bthrow\b/.test(src)) fail(`${f}: throws. Guards render a marker and throw only inside the harness (components/guard.jsx); a component that throws takes the deck down in front of the room.`)
  }
}

// ---------- 25. LIVE and REC are gold, and no red is a status ----------
// Counterpart of pre-delivery check 17. --live is a ground alias, so the source
// fact is that it resolves to the ground's own accent in every scope: gold on
// the dark grounds, bronze on paper, never alliance red and never the fault
// rust. MatchClock's zero state is the case that made the rule explicit.
{
  for (const cls of GROUND_CLASSES) {
    const live = scopes[cls]['--live']
    const accent = scopes[cls]['--accent']
    if (live == null || accent == null) { fail(`${cls}: --live or --accent is missing`); continue }
    if (norm(live) !== norm(accent)) fail(`${cls}: --live is ${live} but --accent is ${accent} — LIVE and REC are the ground's accent, never a red`)
  }
  for (const r of TOKEN_RULES) {
    if (!subjects(r.sel).flatMap(classesIn).some((c) => /-(live|rec)(?![\w-])/.test(c))) continue
    for (const [prop, value] of props(r.body)) {
      const bad = [...value.matchAll(/var\(\s*(--(?:alliance-(?:red|blue)|fault))/g)].map((m) => m[1])
      if (bad.length) fail(`${r.file}: "${r.sel.trim()}" paints a LIVE/REC indicator with ${bad.join(', ')} (${prop}) — LIVE and REC are a gold dot`)
    }
  }
}

// ---------- 26. radii stay small ----------
// Source-side counterpart of the chrome discipline in the standard: 2px chips
// and badges, 3px buttons and inputs, 4px cards and panels. A hardcoded radius
// is how a surface drifts round one component at a time.
{
  const RADII = { '--radius-chip': 2, '--radius-control': 3, '--radius-panel': 4 }
  const effects = TOKEN_SRC['tokens/effects.css']
  for (const [tok, px] of Object.entries(RADII)) {
    const m = effects.match(new RegExp(`${tok}\\s*:\\s*(\\d+)px`))
    if (!m) fail(`${tok} is not declared in tokens/effects.css`)
    else if (Number(m[1]) !== px) fail(`${tok} is ${m[1]}px, not ${px}px — radii stay small, and a change here rounds every surface that uses it`)
  }
  for (const r of TOKEN_RULES) {
    for (const [prop, value] of props(r.body)) {
      if (!/^border(-[a-z]+)?-radius$/.test(prop)) continue
      for (const part of splitTop(value.replace(/\//g, ' '), ' ')) {
        if (/^var\(--radius-(chip|control|panel)\)$/.test(part)) continue
        if (part === '0' || part === '50%' || part === 'inherit') continue
        const px = part.match(/^(\d+(?:\.\d+)?)px$/)
        if (px && Number(px[1]) <= 4) continue
        fail(`${r.file}: "${r.sel.trim()}" sets ${prop}: ${value} — radii come from --radius-chip / --radius-control / --radius-panel (2 / 3 / 4px); 50% and 0 are the only literals`)
      }
    }
  }
}

// ---------- 27. deck chrome never shows a neutral white ----------
// Source-side counterpart of the same line in the standard's chrome discipline.
// White is a published color because the team mark is supplied in white, and
// --fg is white TYPE on the dark grounds, which is correct. What is illegal is a
// white SURFACE: the light ground is a warm off-white, never #FFFFFF. The check
// reads surface-named aliases only, so white type is untouched.
{
  const SURFACE = /^--(bg|plate|edge|surface|well|panel|line|rim)/
  const WHITE = /^#FFF(FFF)?$|^rgba?\(\s*255\s*,\s*255\s*,\s*255\s*\)$/i
  for (const cls of GROUND_CLASSES) {
    for (const [k, v] of Object.entries(scopes[cls])) {
      if (SURFACE.test(k) && WHITE.test(v.trim())) fail(`${cls}: ${k} is pure white (${v}) — deck chrome never shows a neutral white; the light ground is a warm off-white`)
    }
  }
  for (const r of TOKEN_RULES) {
    for (const [prop, value] of props(r.body)) {
      if (/^(background|background-color|fill|border(-[a-z]+)?-color|box-shadow|outline-color)$/.test(prop) && /var\(\s*--white\s*\)/.test(value)) {
        fail(`${r.file}: "${r.sel.trim()}" paints a surface with var(--white) (${prop}) — --white is the supplied mark's white, not a surface`)
      }
    }
  }
}

// ---------- 28. no sheet kind leaves its content row unassigned ----------
// .frc-sheet-body hands .frc-sheet-content the leftover height as a 1fr row.
// Until the distribution axis existed, every kind then threw it away with
// align-content: start, which is why a four-tile gallery left ~600px of dead
// ground on a 1440 frame. The axis has three values and this check makes the
// assignment MANDATORY rather than defaulted: a new pattern cannot quietly
// inherit `start` because nobody chose for it.
//
// The kind vocabulary is DERIVED from the pattern sources, never typed here, so
// adding a 27th pattern fails this check until its axis is assigned.
//
// NARROWING, written down at the check: a kind that renders no .frc-sheet-content
// is not exempt by omission — it must instead own a `.frc-sheet-<kind> .frc-sheet-body`
// rule, which is how cover / section / statement / quote / closing distribute for
// themselves. "No content row" and "forgot the axis" are then different states,
// which is the whole point of the check.
{
  const AXIS = ['start', 'center', 'stretch']
  const sheetsRules = cssRules(TOKEN_SRC['tokens/sheets.css'])

  // Deriving the vocabulary also keeps `.frc-sheet-content`, `-body`, `-head`
  // and the rest out of the scan: they share the prefix but are not kinds, and
  // a bare /\.frc-sheet-(\w+)/ reads `content` as a kind and then reports it
  // assigned three different axes at once.
  const KINDS = new Map()
  for (const f of sheetFiles) {
    const km = codeOf(f).match(/kind="([a-z]+)"/)
    if (km) KINDS.set(km[1], f)
  }
  if (KINDS.size !== 26) fail(`check 28: read a kind from ${KINDS.size} of 26 pattern files`)
  const kindsIn = (sel) => [...sel.matchAll(/\.frc-sheet-([a-z-]+)/g)].map((m) => m[1]).filter((k) => KINDS.has(k))

  // kind -> axis value, off every rule that sets align-content ON .frc-sheet-content.
  const assigned = new Map()
  const dupes = []
  for (const r of sheetsRules) {
    if (!/\.frc-sheet-content\b/.test(r.sel)) continue
    const raw = Object.fromEntries(props(r.body))['align-content']
    if (!raw || !AXIS.includes(raw.trim())) continue
    const value = raw.trim()
    for (const k of kindsIn(r.sel)) {
      if (assigned.has(k) && assigned.get(k) !== value) dupes.push(`${k} (${assigned.get(k)} and ${value})`)
      assigned.set(k, value)
    }
  }
  if (dupes.length) fail(`check 28: sheet kind assigned two different distribution axes — ${dupes.join(', ')}`)

  // Which kinds raise the inherited stretch tokens the tiles read.
  const stretchTokens = new Set()
  for (const r of sheetsRules) {
    const row = Object.fromEntries(props(r.body))['--fill-row']
    if (!row || row.trim() === 'auto') continue
    for (const k of kindsIn(r.sel)) stretchTokens.add(k)
  }

  for (const [kind, f] of KINDS) {
    const src = codeOf(f)
    if (!/frc-sheet-content/.test(src)) {
      const owns = sheetsRules.some((r) => new RegExp(`\\.frc-sheet-${kind}\\b[^,{]*\\.frc-sheet-body\\b`).test(r.sel))
      if (!owns) fail(`check 28: ${f} (kind "${kind}") renders no .frc-sheet-content AND owns no .frc-sheet-${kind} .frc-sheet-body rule — it distributes nothing, in either place`)
      if (assigned.has(kind)) fail(`check 28: kind "${kind}" is assigned a content-row axis but renders no content row`)
      continue
    }
    if (!assigned.has(kind)) {
      fail(`check 28: ${f} (kind "${kind}") renders a content row with no distribution axis — name it in the start, center or stretch list in tokens/sheets.css. The 1fr row is handed to it either way, so an unassigned kind silently keeps start and drops the height.`)
      continue
    }
    // A stretch kind that does not raise --fill-row is a stretch in name only:
    // the row grows and the tile inside it keeps its fixed 4 / 3 cap.
    if (assigned.get(kind) === 'stretch' && !stretchTokens.has(kind)) {
      fail(`check 28: kind "${kind}" is assigned stretch but never sets --fill-row, so a .frc-sample inside it keeps its 4 / 3 cap and the stretched row is decorative`)
    }
    if (assigned.get(kind) !== 'stretch' && stretchTokens.has(kind)) {
      fail(`check 28: kind "${kind}" raises --fill-row without being assigned stretch`)
    }
  }

  // The consumer end. The axis is inherited custom properties, so it only does
  // anything if a tile actually reads them; a rename on one side and not the
  // other is silent, and this is where that is caught.
  const surfaces = TOKEN_SRC['tokens/surface-components.css']
  if (!/\.frc-sample\b[^{]*\{[^}]*grid-template-rows:\s*var\(--fill-row/.test(surfaces)) {
    fail('check 28: .frc-sample does not read var(--fill-row) — the stretch axis reaches no tile')
  }
  if (!/\.frc-sample-media\b[^{]*\{[^}]*aspect-ratio:\s*var\(--fill-media-ratio/.test(surfaces)) {
    fail('check 28: .frc-sample-media does not read var(--fill-media-ratio) — its fixed ratio still caps tile height under stretch')
  }
  // The default must be declared, and declared WEAKLY, so a kind class beats it
  // outright rather than by source order. Check 14 makes the same argument about
  // the ground scopes; it is the same failure mode one layer down.
  if (!/:where\(\.frc-sheet\)[^{]*\{[^}]*--fill-row:\s*auto/.test(TOKEN_SRC['tokens/sheets.css'])) {
    fail('check 28: the --fill-row default is not declared on :where(.frc-sheet) — a plain .frc-sheet selector ties with .frc-sheet-<kind> and source order decides which wins')
  }
}

// ---------- 29. host transparency, both ends ----------
// The Claude Design runtime wraps the template children of an `x-import` in
// LAYOUT-TRANSPARENT HOST NODES, so "the child the author wrote" and "the direct
// child" are not the same node. Assuming they are cost, in order: DeckStage's
// sheet lookup, the deck-motion direct-child selectors, SafetySheet's note guard
// twice over, and a permanent helmet rule in every shipped deck hiding hosts
// that nothing bridged. Each was patched where it hurt. This check is what stops
// the sixth patch: it holds BOTH ends of the one mechanism, because a traversal
// that looks through hosts in JS while the stylesheet still demands parentage is
// half a fix, and the half that is missing is invisible until a deck ships.
{
  const HOST = 'components/host.jsx'
  if (!exists(HOST)) {
    fail(`check 29: ${HOST} is missing — the host-transparency mechanism is what every walk below is required to reach`)
  } else {
    const src = codeOf(HOST)
    // The whole surface, both faces. A face that quietly stops being exported is
    // a face every caller silently stops using.
    for (const name of ['isHostElement', 'hostChildren', 'throughHost', 'hostProps', 'containsType', 'cloneThroughHost', 'isHostNode', 'structuralChildren']) {
      if (!new RegExp(`export function ${name}\\b`).test(src)) fail(`check 29: ${HOST} does not export ${name} — the mechanism is incomplete`)
    }
    // A host is identified POSITIVELY. "Not one of ours" would make every
    // author element a host and turn every guard into a rubber stamp.
    //
    // PER FACE, not once for the file. A first pass tested the whole file and a
    // control that deleted the contract from the React face passed anyway,
    // because the DOM face still mentioned it — so the check was measuring the
    // word, not the behaviour.
    const bodyOf = (name) => {
      const start = src.indexOf(`export function ${name}(`)
      if (start < 0) return ''
      const next = src.indexOf('\nexport ', start + 1)
      return src.slice(start, next < 0 ? src.length : next)
    }
    for (const [face, must] of [
      ['isHostElement', [[/data-frc-host/, 'the explicit data-frc-host contract, which is the only signal left when a runtime host is an ordinary element made transparent by a stylesheet'], [/'contents'/, 'an inline display: contents test']]],
      ['isHostNode', [[/data-frc-host/, 'the explicit data-frc-host contract'], [/getComputedStyle/, 'a computed display test — transparency is readable outright in the DOM and guessing there would be a choice, not a limit']]],
    ]) {
      const body = bodyOf(face)
      if (!body) { fail(`check 29: ${HOST} declares no ${face}`); continue }
      for (const [re, what] of must) {
        if (!re.test(body)) fail(`check 29: ${HOST} ${face} drops ${what}`)
      }
    }
  }

  // ---- the JS end -------------------------------------------------------
  // A file that reaches into a child's identity, props or position must go
  // through the mechanism. The triggers are the exact expressions that read a
  // child as if it were a direct child; anything narrower would miss the sites
  // that actually broke, and anything wider fires on legitimate code and gets
  // commented out within a month.
  const TRIGGERS = [
    [/\bChildren\.(forEach|map)\(/, 'walks children positionally'],
    [/\bcloneElement\(/, 'clones a child'],
    [/\.type\s*===|\.type\?\./, 'type-checks a child'],
    [/\.props\.children\b|\.props\[/, "reads a child's props"],
  ]
  // ONE EXEMPTION, and the reason is the check's own definition rather than a
  // convenience: a demo card clones an element IT built, in the harness, where
  // there is no author boundary and therefore no host. host.jsx is the
  // mechanism and cannot reach itself.
  const EXEMPT = (f) => f === HOST || /DemoCard\.jsx$/.test(f)
  const WALKERS = allFiles.filter((f) => /^components\/.*\.jsx$/.test(f) && !EXEMPT(f))
  for (const f of WALKERS) {
    const src = codeOf(f)
    const hit = TRIGGERS.find(([re]) => re.test(src))
    if (!hit) continue
    if (!/from '\.{1,2}\/host\.jsx'/.test(src)) {
      fail(`check 29: ${f} ${hit[1]} but imports nothing from components/host.jsx — on a hosted deck it reads the wrapper the runtime inserted, not the child the author wrote`)
    }
  }

  // DeckStage is named on its own because its lookup is the one that has already
  // failed in a shipped deck, and because filtering stage.children reads as
  // obviously correct right up until a host is in the way.
  const deckStage = codeOf('components/brand/DeckStage.jsx')
  if (!/structuralChildren/.test(deckStage)) fail('check 29: DeckStage does not read its sheets through structuralChildren — stage.children returns the hosts on a generated deck and the filter returns nothing')
  if (/\bstage\.children\b/.test(deckStage)) fail('check 29: DeckStage still reads stage.children directly')

  // ---- the CSS end ------------------------------------------------------
  // Every relationship a deck author's markup crosses. On each of these the
  // runtime can interpose a host, so the token layer matches by CONTAINMENT.
  // That is exact rather than approximate: on all of them the child cannot
  // legally nest inside itself within that parent (a sheet in a sheet, a stage
  // in a stage, a role card in a role card are each defects in their own right),
  // so descendant matching and child matching agree on every legal tree.
  const AUTHOR_BOUNDARIES = [
    ['.frc-stage', 'sheets are placed on the stage by the deck'],
    ['.frc-letterbox', 'the stage is placed in the letterbox by the deck'],
    ['.frc-frame-plate', "ImageFrame's media is an author child"],
    ['.frc-cutout-subject', "Cutout's subject is an author child"],
    ['.frc-sample-media', "a Sample's media is an author child"],
    ['.frc-role-grid', 'RoleCards are author children of the grid'],
    ['.frc-sponsor-row', 'sponsor marks are author children of the tier'],
    ['.frc-jumps', 'JumpCards are author children'],
    ['.frc-pipeline', 'PipelineSteps are author children'],
    ['.frc-roster', 'RoleCards are author children'],
    ['.frc-gallery', 'Samples are author children'],
    ['.frc-drawing-media', 'CalloutPins are author children'],
  ]
  for (const f of TOKEN_FILES) {
    for (const [cls, why] of AUTHOR_BOUNDARIES) {
      // `.frc-stage > ` and `:has(> .frc-role…)` alike — the combinator right
      // after the boundary class, whatever punctuation sits between.
      const re = new RegExp(`\\${cls}(?![\\w-])[^,{>]*>`)
      const m = TOKEN_SRC[f].match(re)
      if (m) fail(`check 29: ${f}: "${m[0].replace(/\s+/g, ' ').trim()}" uses a child combinator across a deck-author boundary (${why}) — the runtime can put a layout-transparent host there and the rule then matches nothing. Match by containment.`)
    }
  }
}

// ---------- 30. DeckSteps ----------
// Shaped like check 15, for the second behaviour component. DeckSteps is the
// one place in the system where content is deliberately not visible, so the
// check is mostly about the ESCAPES: every one of them has to still be there.
{
  const st = manifest.components.find((c) => c.name === 'DeckSteps')
  if (!st) fail('manifest does not list DeckSteps — a behaviour component nobody can look up is one nobody mounts')
  else {
    const prompt = read(st.prompt)
    if (!/exactly once/i.test(prompt)) fail('DeckSteps.prompt.md does not state that every deck mounts it exactly once — two steppers consume the same key and the deck skips items')
    // Comments stripped, the same way check 24 reads a guarded component: the
    // prose in this file NAMES the things it refuses to do, and a grep that
    // cannot tell code from the comment explaining it fires on the explanation.
    const src = codeOf(st.sourcePath)

    // (a) It reaches the shared guard and the shared host traversal. The host
    // traversal is not decoration: the runtime can wrap each item, so a walk of
    // group.children counts wrappers and reveals the wrong cards.
    if (!/from '\.\.\/guard\.jsx'/.test(src)) fail('DeckSteps does not import the shared guard — its refusals must render the same rust marker as every other guard')
    if (!/structuralChildren[\s\S]*from '\.\.\/host\.jsx'/.test(src)) fail('DeckSteps does not import structuralChildren from host.jsx — counting group.children directly counts the runtime’s host wrappers, not the author’s items')
    if (/\.children\b/.test(src.replace(/structuralChildren/g, ''))) fail('DeckSteps reads .children directly — every walk goes through host.jsx, which is the whole reason the count is done in JS rather than with :nth-child()')

    // (b) The attributes are the contract between the component and the sheet.
    for (const attr of ['data-step-group', 'data-step-item', 'data-step-shown', 'data-step']) {
      if (!src.includes(attr)) fail(`DeckSteps never writes or reads ${attr} — the stylesheet is gated on it and would do nothing`)
    }

    // (c) The containers it resolves must exist in the token layer. A renamed
    // container would otherwise make `data-steps` silently resolve nothing, and
    // the sheet would simply never step — the failure with no symptom.
    const listed = [...(src.match(/const GROUP_SELECTORS = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'\.([\w-]+)'/g)].map((m) => m[1])
    if (listed.length < 6) fail(`DeckSteps: GROUP_SELECTORS reads ${listed.length} container(s) — the six containers that already exist are what this component was built to target`)
    const declaredClasses = new Set(TOKEN_RULES.flatMap((r) => splitTop(r.sel, ',').flatMap((part) => classesIn(part))))
    for (const cls of listed) {
      if (!declaredClasses.has(cls)) fail(`DeckSteps: GROUP_SELECTORS names .${cls}, which no rule in the token layer declares — data-steps would resolve nothing on a sheet built from it, silently`)
    }
  }

  // ---- the CSS end: the gate, and every escape from it -------------------
  const stepRules = TOKEN_RULES.filter((r) => /\[data-step-item\]/.test(r.sel))
  if (!stepRules.length) fail('check 30: the token layer declares no [data-step-item] rule — DeckSteps writes the marks and nothing reads them')

  const HIDES = (r) => props(r.body).some(([prop, value]) => (
    (prop === 'opacity' && /^0(\.0+)?%?$/.test(value.trim())) ||
    (prop === 'visibility' && value.trim() === 'hidden') ||
    (prop === 'display' && value.trim() === 'none')
  ))

  // (d) NOTHING hides outside the gate. This is the exact complement of the one
  // exemption check 22 grants, so the two cannot both be loosened by accident.
  for (const r of stepRules) {
    if (HIDES(r) && !STEP_GATE.test(r.sel)) {
      fail(`check 30: ${r.file}: "${r.sel.trim()}" hides a step item without [data-deck-active][data-step] — the base state of a sheet is the complete sheet, and an ungated hide survives export, print and a deck with no DeckSteps`)
    }
  }

  // (e) The pending state is NOT inside the reduced-motion gate. Someone who
  // asked for less motion still gets the pacing; gating the whole feature would
  // hand them a static sheet, which is the usual mistake and the opposite of
  // what was asked for.
  const pending = stepRules.filter((r) => HIDES(r) && STEP_GATE.test(r.sel) && !r.ats.some((a) => a.startsWith('@media print')))
  if (!pending.length) fail('check 30: no gated rule hides an unrevealed step item — there is a gate and nothing behind it')
  for (const r of pending) {
    if (inMotionGate(r)) fail(`check 30: ${r.file}: "${r.sel.trim()}" puts the PENDING state inside @media (prefers-reduced-motion: no-preference) — the reveal still steps under reduced motion, it just does not animate`)
  }

  // (f) The motion half IS gated, or the system has grown an ungated animation.
  const moving = stepRules.filter((r) => props(r.body).some(([prop]) => prop === 'transition' || prop === 'animation' || prop === 'animation-name'))
  if (!moving.length) fail('check 30: the step reveal has no transition at all — a reveal with no motion under no-preference is not the reduced-motion path, it is a missing one')
  for (const r of moving) {
    if (!inMotionGate(r)) fail(`check 30: ${r.file}: "${r.sel.trim()}" animates a step reveal outside @media (prefers-reduced-motion: no-preference)`)
  }

  // (g) THE PRINT RELEASE. This is what check 22(a)'s argument turns on: a
  // rule-level hide is only acceptable because the printed deck releases it.
  const printed = stepRules.filter((r) => r.ats.some((a) => a.startsWith('@media print')))
  if (!printed.length) {
    fail('check 30: no @media print rule releases the step gate — a deck printed mid-presentation would print the active sheet half revealed, which is the exact failure check 22 refuses rule-level hiding to prevent')
  } else if (!printed.some((r) => props(r.body).some(([prop, value]) => prop === 'visibility' && value.trim() === 'visible'))) {
    fail('check 30: the @media print rule for step items does not restore visibility — opacity alone leaves a visibility: hidden item invisible on paper')
  }
}

// ---------- 31. a slot cannot silently depend on the author's element ----------
// `slotted()` keeps the element the author wrote, which is what keeps the copy
// where they typed it and editable on the canvas. That is deliberate and stays.
// What is NOT allowed is the component DEPENDING on which element that was.
//
// This check exists because the system shipped three defects of exactly that
// shape: ResultBanner printed "Quarterfinal 2RED ALLIANCE" and QuoteBlock
// printed "SENIOR, CLASS OF 2026DRIVE COACH" (two adjacent inline slots with
// nothing to separate them), and `<h2 slot="title">` raised a DOM nesting error
// on SectionSheet while working on SafetySheet — same slot name, different
// required element, and nothing in the system said so.
//
// Two halves, because fixing only the first still leaves the element deciding:
//   (a) every class reaching slotted() declares its own `display`
//   (b) those classes neutralise the user-agent defaults that differ per element
{
  const painted = new Set()
  const unclassed = []
  for (const p of COMPONENT_JSX) {
    const code = codeOf(p)
    for (const m of code.matchAll(/slotted\(\s*([^,]+?)\s*,\s*(null|'([^']*)')/g)) {
      const cls = (m[3] ?? '').trim().split(/\s+/).filter(Boolean)
      if (!cls.length) unclassed.push(`${p}: slotted(${m[1].trim()}, null)`)
      else painted.add(cls[0])
    }
    for (const m of code.matchAll(/slottedWith\(\s*[^,]+?\s*,\s*(\w+)\(/g)) void m
  }
  for (const u of unclassed) {
    fail(`check 31: ${u} paints no class, so nothing can pin its display and the author's element decides the layout — give the slot a class and declare its display`)
  }
  // (a) display is declared for every painted class, anywhere in the token layer.
  const declares = (cls, prop) => TOKEN_RULES.some((r) =>
    subjects(r.sel).some((c) => classesIn(c).includes(cls)) &&
    props(r.body).some(([k]) => k === prop))
  for (const cls of [...painted].sort()) {
    if (!declares(cls, 'display')) {
      fail(`check 31: .${cls} is painted onto a slot but the token layer never declares its display — a <span> and an <h2> in that slot would lay out differently, which is how the run-on defects shipped`)
    }
  }
  // (b) the user-agent defaults that differ BETWEEN elements are neutralised.
  // Measured, not assumed: with display pinned but font left alone, the same
  // slot written as <h2> still measured 139x26 against a <span>'s 88x17.
  for (const cls of [...painted].sort()) {
    for (const prop of ['font', 'margin']) {
      const ok = TOKEN_RULES.some((r) =>
        subjects(r.sel).some((c) => classesIn(c).includes(cls)) &&
        props(r.body).some(([k]) => k === prop || k.startsWith(prop + '-')))
      if (!ok) fail(`check 31: .${cls} pins display but never neutralises the user-agent \`${prop}\` — an <h2> in that slot still arrives with the browser's own ${prop} and changes the box`)
    }
  }
  // (c) a slot is PAINTED, never WRAPPED. Nesting the author's element inside one
  // the component renders is what produced <h2><h2></h2></h2> on SectionSheet.
  for (const p of COMPONENT_JSX) {
    const code = codeOf(p)
    for (const m of code.matchAll(/<(StencilTitle|Eyebrow|Badge|SubteamBadge)\b[^>]*>\s*\{\s*slots\./g)) {
      fail(`check 31: ${p} wraps a slot in <${m[1]}> instead of painting it — the author's element ends up nested inside the component's, which is legal for a <span> and a DOM error for an <h2>. Paint the class recipe with slotted()/slottedWith() instead`)
    }
  }
}

// ---------- report ----------
if (failures.length) {
  console.error(`ds-audit: ${failures.length} failure(s)`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`ds-audit: ok — ${names.length} aliases × ${GROUND_CLASSES.length} grounds literal and complete, ${manifest.components.length} components verified, ${allFiles.length} files scanned`)
