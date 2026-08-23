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
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../src/lib/design-system')
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
  if (COLOR_EXEMPT.has(f) || f.endsWith('.md')) continue
  const src = f.endsWith('.css') ? stripComments(read(f)) : read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of src.matchAll(/(?<![\w&])#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b(?!\))/g)) {
    if (f.endsWith('.html') && /^(frc|core|brand|grounds|tokens|type|motion|surfaces|chrome|wiring)/.test(m[1])) continue
    fail(`${f}: raw color #${m[1]} — tokens only`)
  }
  for (const m of src.matchAll(/\brgba?\(/g)) fail(`${f}: raw ${m[0]}…) — tokens only (offset ${m.index})`)
  for (const m of src.matchAll(/\b(hsla?|oklch|lab|lch|color)\(/g)) fail(`${f}: raw ${m[0]}…) — tokens only`)
}

// ---------- 5. styles.css imports only, in order ----------
const ORDER = ['fonts', 'colors', 'typography', 'effects', 'surfaces', 'motion', 'deck-motion', 'image-slot']
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
for (const s of manifest.startingPoints) if (!exists(s.path)) fail(`manifest startingPoint ${s.path} missing`)
for (const h of manifest.helpers) if (!exists(h.sourcePath)) fail(`manifest helper ${h.sourcePath} missing`)
if (!exists(manifest.specimen.sourcePath)) fail('manifest specimen.sourcePath missing')
if (!exists(manifest.specimen.proofs)) fail('manifest specimen.proofs missing')
if (!exists(manifest.tokens.mirror)) fail('manifest tokens.mirror missing')
if (!fs.existsSync(path.resolve(HERE, '../../', manifest.audit.split(' ')[0]))) fail('manifest audit path missing')
if (manifest.version !== tokens.VERSION) fail(`manifest version ${manifest.version} ≠ tokens.js ${tokens.VERSION}`)
// every component .jsx on disk is listed
for (const f of allFiles.filter((p) => /^components\/(core|brand)\/[A-Z]\w+\.jsx$/.test(p) && !/DemoCard|AssetSlot/.test(p))) {
  if (!manifest.components.some((c) => c.sourcePath === f)) fail(`${f} exists but is not in the manifest`)
}
for (const a of manifest.pending.assets) if (exists(a)) fail(`manifest pending asset ${a} exists — move it out of pending`)

// ---------- 8. no emoji ----------
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}]|\u{FE0F}/u
for (const f of allFiles) {
  const lines = read(f).split('\n')
  lines.forEach((l, i) => { if (EMOJI.test(l)) fail(`${f}:${i + 1}: emoji`) })
}

// ---------- report ----------
if (failures.length) {
  console.error(`ds-audit: ${failures.length} failure(s)`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`ds-audit: ok — ${names.length} aliases × ${GROUND_CLASSES.length} grounds literal and complete, ${manifest.components.length} components verified, ${allFiles.length} files scanned`)
