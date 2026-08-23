#!/usr/bin/env node
// FRC5669DesignSystem — negative controls for ds:audit checks 16-27.
// `npm run ds:audit:controls`. Exit 1 if any control is not caught.
//
// Each control breaks the exact thing one check exists to catch, runs the audit,
// asserts the right failure text appears, and restores the file. A check that
// has never failed has not been tested, and a check that has silently stopped
// working is worse than no check, because everyone assumes it is running.
//
// IT WRITES TO TRACKED SOURCE FILES and restores them in a finally block. It
// refuses to start on a dirty working tree, so if it is ever killed mid-run the
// damage is one file and `git checkout` is the whole recovery.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..').replace(/\\/g, '/')
const DS = `${REPO}/src/lib/design-system`
const AUDIT = `${REPO}/scripts/design-system/ds-audit.mjs`

// A control is {file, find, replace} or {file, append}, plus the failure text it
// must produce. `all: true` replaces every occurrence.
const CONTROLS = [
  { check: '16a', what: 'the letterbox rule is deleted from the token layer',
    file: `${DS}/tokens/deck-motion.css`,
    find: '.frc-letterbox { position: fixed; inset: 0; overflow: hidden; }',
    replace: '',
    expect: /no rule for "\.frc-letterbox"/ },
  { check: '16b', what: 'the letterbox rule survives but stops clipping',
    file: `${DS}/tokens/deck-motion.css`,
    find: '.frc-letterbox { position: fixed; inset: 0; overflow: hidden; }',
    replace: '.frc-letterbox { position: fixed; }',
    expect: /"\.frc-letterbox" declares no inset, overflow/ },
  { check: '16c', what: 'a template declares an frc- rule in its own <style>',
    file: `${DS}/templates/Deck.dc.html`,
    find: '    a { color: inherit; }',
    replace: '    .frc-letterbox { position: fixed; inset: 0; }\n    a { color: inherit; }',
    expect: /templates\/Deck\.dc\.html: its inline <style> declares "\.frc-letterbox"/ },

  { check: '17a', what: 'a documented entrance class loses its rule',
    file: `${DS}/tokens/motion.css`,
    find: '.frc-in-tracking { animation: frc-in-tracking',
    replace: '.frc-in-trackingX { animation: frc-in-tracking',
    expect: /motion vocabulary: \.frc-in-tracking is named in the standard/ },
  { check: '17b', what: 'the standard\u2019s motion vocabulary is edited',
    file: `${DS}/docs/FRC_CLAUDE_DESIGN_STANDARDS.md`,
    find: '  Slide transitions: frc-slide-shutter | frc-slide-boot |',
    replace: '  Slide transitions: frc-slide-shutter | frc-slide-boot | frc-slide-iris |',
    expect: /the motion vocabulary in the inheritance block changed/ },

  { check: '18a', what: 'a keyframe is named outside the frc- vocabulary',
    file: `${DS}/tokens/motion.css`,
    find: '@keyframes frc-in-fade     { from { opacity: 0; } }',
    replace: '@keyframes deck-fade     { from { opacity: 0; } }',
    expect: /@keyframes deck-fade is not frc- prefixed/ },
  { check: '18b', what: 'a non-frc class appears in the token layer',
    file: `${DS}/tokens/surfaces.css`,
    append: '\n.slide-title { color: var(--fg); }\n',
    expect: /names \.slide-title — every class in this system carries the frc- prefix/ },
  { check: '18c', what: 'a component declares its own keyframes',
    file: `${DS}/components/core/Button.jsx`,
    append: '\nexport const KF = `@keyframes button-pop { from { opacity: 0; } }`\n',
    expect: /Button\.jsx: declares @keyframes/ },

  { check: '19', what: 'body copy is painted gold at rest',
    file: `${DS}/tokens/surface-components.css`,
    find: '.frc-card-body { font-family: var(--font-body); font-size: var(--fs-body-sm); color: var(--fg); margin: 0; }',
    replace: '.frc-card-body { font-family: var(--font-body); font-size: var(--fs-body-sm); color: var(--accent); margin: 0; }',
    expect: /paints body copy with --accent/ },

  { check: '20a', what: 'an alliance color escapes the FIELD ground',
    file: `${DS}/tokens/data.css`,
    find: '.frc-ground-field .frc-scout { --al-red: var(--alliance-red); --al-blue: var(--alliance-blue); }',
    replace: '.frc-scout { --al-red: var(--alliance-red); --al-blue: var(--alliance-blue); }',
    expect: /reaches for an alliance color outside \.frc-ground-field/ },
  { check: '20b', what: 'a fifth component reaches for the alliance partition',
    file: `${DS}/tokens/data.css`,
    append: '\n.frc-ground-field .frc-badge-alert { color: var(--alliance-red); }\n',
    expect: /reaches for an alliance color outside the four components/ },
  { check: '20c', what: 'a component names an alliance token in code',
    file: `${DS}/components/data/AllianceSplit.jsx`,
    find: 'className="frc-alliance-side frc-alliance-red"',
    replace: 'className="frc-alliance-side frc-alliance-red" style={{ borderColor: \'var(--alliance-red)\' }}',
    expect: /AllianceSplit\.jsx: names an alliance token in code/ },

  { check: '21a', what: 'the ambient footer clip is removed',
    file: `${DS}/tokens/surfaces.css`,
    find: '  clip-path: inset(0 0 var(--rail-h) 0);',
    replace: '',
    expect: /\.frc-ambient declares no clip-path/ },
  { check: '21b', what: 'a second ambient layer drops the clip',
    file: `${DS}/tokens/surfaces.css`,
    find: '.frc-ambient-hazard { clip-path: none; }',
    replace: '.frc-ambient-hazard { clip-path: none; }\n.frc-ambient-matrix { clip-path: none; }',
    expect: /overrides clip-path on an ambient layer/ },
  { check: '21c', what: 'the exempt layer stops stopping at the rail',
    file: `${DS}/tokens/surfaces.css`,
    find: '  inset: auto 0 var(--rail-h) 0;',
    replace: '  inset: auto 0 0 0;',
    expect: /drops the ambient clip but its inset bottom is 0/ },

  { check: '22a', what: 'a rule hides an element in the base state',
    file: `${DS}/tokens/sheets.css`,
    append: '\n.frc-sheet-reveal { opacity: 0; }\n',
    expect: /sets opacity: 0 in a rule/ },
  { check: '22b', what: 'an entrance class is painted outside the motion gate',
    file: `${DS}/tokens/motion.css`,
    append: '\n.frc-in-rise { opacity: 0.2; }\n',
    expect: /paints an entrance\/reveal class outside @media \(prefers-reduced-motion/ },
  { check: '22c', what: 'body copy is hidden with display: none',
    file: `${DS}/tokens/surface-components.css`,
    append: '\n.frc-step-text { display: none; }\n',
    expect: /hides body copy/ },

  { check: '23', what: 'a component takes running copy as a string array',
    file: `${DS}/components/surfaces/Card.d.ts`,
    find: 'export interface CardProps',
    replace: 'export interface CardCopyProps {\n  bullets?: string[]\n}\n\nexport interface CardProps',
    expect: /CardCopyProps\.bullets is typed string\[\]/ },

  { check: '24a', what: 'a component throws instead of rendering a marker',
    file: `${DS}/components/core/Button.jsx`,
    append: '\nfunction __control() { throw new Error(\'x\') }\n',
    expect: /Button\.jsx: throws\./ },
  { check: '24b', what: 'an unregistered component trips a guard',
    file: `${DS}/components/core/Eyebrow.jsx`,
    append: '\nfunction __control() { return fault(\'Eyebrow\', \'x\') }\n',
    expect: /Eyebrow\.jsx: trips a guard but is not registered/ },
  { check: '24c', what: 'a guarded component stops using the shared guard',
    file: `${DS}/components/surfaces/Cutout.jsx`,
    find: "from '../guard.jsx'",
    replace: "from '../guard.js'",
    expect: /Cutout\.jsx: does not import the shared guard/ },
  { check: '24d', what: 'a guard stops naming the condition it refuses',
    file: `${DS}/components/sheets/SafetySheet.jsx`,
    find: 'SafetyNote',
    replace: 'SafetyPanel',
    all: true,
    expect: /SafetySheet\.jsx: its guard no longer names "SafetyNote"/ },

  { check: '25a', what: 'LIVE stops being the ground accent',
    file: `${DS}/tokens/colors.css`,
    find: '  --live: #FFE629;\n',
    replace: '  --live: #B0503C;\n',
    expect: /--live is #B0503C but --accent is #FFE629/ },
  { check: '25b', what: 'a LIVE indicator is painted with a red',
    file: `${DS}/tokens/typography.css`,
    append: '\n.frc-eyebrow-live { color: var(--fault); }\n',
    expect: /paints a LIVE\/REC indicator with --fault/ },

  { check: '26a', what: 'a radius token grows',
    file: `${DS}/tokens/effects.css`,
    find: '--radius-panel:   4px;',
    replace: '--radius-panel:   8px;',
    expect: /--radius-panel is 8px, not 4px/ },
  { check: '26b', what: 'a rule hardcodes a large radius',
    file: `${DS}/tokens/surfaces.css`,
    append: '\n.frc-pill { border-radius: 12px; }\n',
    expect: /radii come from --radius-chip/ },

  { check: '27a', what: 'a ground surface becomes pure white',
    file: `${DS}/tokens/colors.css`,
    find: '  --bg0:   #E9E7E1;',
    replace: '  --bg0: #FFFFFF;',
    expect: /--bg0 is pure white/ },
  { check: '27b', what: 'a surface is painted with the mark white',
    file: `${DS}/tokens/surfaces.css`,
    append: '\n.frc-plate-light { background: var(--white); }\n',
    expect: /paints a surface with var\(--white\)/ },
]

function runAudit() {
  try {
    execFileSync('node', [AUDIT], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { code: 0, out: '' }
  } catch (e) {
    return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

// A dirty tree means a restore could put back the wrong bytes, and it makes the
// "after restore: green" line meaningless.
try {
  const dirty = execFileSync('git', ['status', '--porcelain', '-uno', '--', 'src/lib/design-system', 'scripts/design-system'], { cwd: REPO, encoding: 'utf8' }).trim()
  if (dirty) {
    console.error('ds-audit-controls: refusing to run — these paths have uncommitted changes, and this script rewrites tracked files:\n' + dirty)
    process.exit(1)
  }
} catch (e) {
  if (e.status != null && e.status !== 0 && !e.stdout) { console.error('ds-audit-controls: could not read git status'); process.exit(1) }
}

const clean = runAudit()
if (clean.code !== 0) {
  console.error('BASELINE IS NOT GREEN — controls would prove nothing:\n' + clean.out)
  process.exit(1)
}
console.log('baseline: green\n')

let pass = 0
const results = []
for (const c of CONTROLS) {
  const before = fs.readFileSync(c.file, 'utf8')
  let after
  if (c.append != null) after = before + c.append
  else {
    if (!before.includes(c.find)) { results.push([c.check, 'ANCHOR MISSING', c.what]); continue }
    after = c.all ? before.split(c.find).join(c.replace) : before.replace(c.find, c.replace)
  }
  fs.writeFileSync(c.file, after)
  let res
  try { res = runAudit() } finally { fs.writeFileSync(c.file, before) }
  const fired = res.code !== 0 && c.expect.test(res.out)
  if (fired) pass++
  results.push([c.check, fired ? 'CAUGHT' : `MISSED (exit ${res.code})`, c.what])
  if (!fired) console.log(res.out.split('\n').slice(0, 8).join('\n'))
}

for (const [check, verdict, what] of results) console.log(`${verdict.padEnd(22)} ${check}  ${what}`)
console.log(`\n${pass}/${CONTROLS.length} controls caught`)

const restored = runAudit()
console.log(`after restore: ${restored.code === 0 ? 'green' : 'NOT GREEN\n' + restored.out}`)
if (pass !== CONTROLS.length || restored.code !== 0) process.exit(1)
