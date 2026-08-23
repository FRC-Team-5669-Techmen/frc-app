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
const ORDER = ['fonts', 'colors', 'typography', 'effects', 'surfaces', 'motion', 'deck-motion', 'image-slot', 'data', 'surface-components', 'forms', 'sheets']
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
for (const f of allFiles) {
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

// ---------- report ----------
if (failures.length) {
  console.error(`ds-audit: ${failures.length} failure(s)`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`ds-audit: ok — ${names.length} aliases × ${GROUND_CLASSES.length} grounds literal and complete, ${manifest.components.length} components verified, ${allFiles.length} files scanned`)
