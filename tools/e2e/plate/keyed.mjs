#!/usr/bin/env node
/**
 * The static half of "set the constant to '' and nothing changes": every
 * selector in src/plate.css, at every nesting depth (inside @media and
 * @supports too), must start with `:root.tm-plate`, so no rule can match
 * while the class is absent. Also: the file holds no raw colour (no hex, no
 * rgb()/hsl(), no named colour outside a url()), no @import, no
 * @font-face and no @keyframes, and src/main.jsx adds the class only when
 * the constant is non-empty.
 *
 *   node tools/e2e/plate/keyed.mjs
 *
 * POSITIVE CONTROLS, run every time in memory (the file on disk is never
 * touched): an unkeyed rule, a keyed-looking rule nested under an unkeyed
 * @media, a decoy prefix (`:root .tm-plate`), and a raw hex must each be
 * caught. A checker that passed them would pass anything.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = fileURLToPath(new URL('../../..', import.meta.url));
const KEY = ':root.tm-plate';

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

// Split at top-level commas (not inside parentheses or strings).
function splitTop(s) {
  const out = []; let depth = 0; let cur = ''; let q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Walk blocks: returns [{ prelude, body, depth }] for style rules, and the
// at-rule preludes met on the way.
function walk(css) {
  const rules = []; const atRules = [];
  let i = 0;
  const parseBlock = (end, depth) => {
    let prelude = '';
    while (i < end) {
      const ch = css[i];
      if (ch === '{') {
        // find the matching brace
        let d = 1; let j = i + 1; let q = null;
        for (; j < css.length && d > 0; j++) {
          const c = css[j];
          if (q) { if (c === q) q = null; continue; }
          if (c === '"' || c === "'") q = c;
          else if (c === '{') d++;
          else if (c === '}') d--;
        }
        const p = prelude.trim();
        const bodyStart = i + 1; const bodyEnd = j - 1;
        if (p.startsWith('@')) {
          atRules.push(p);
          i = bodyStart;
          parseBlock(bodyEnd, depth + 1);
          i = j;
        } else {
          rules.push({ prelude: p, body: css.slice(bodyStart, bodyEnd), depth });
          i = j;
        }
        prelude = '';
      } else if (ch === ';' && prelude.trim().startsWith('@')) {
        atRules.push(prelude.trim()); prelude = ''; i++;
      } else { prelude += ch; i++; }
    }
  };
  parseBlock(css.length, 0);
  return { rules, atRules };
}

// The `:is()` groups at the top level of a selector, as argument lists.
function isGroups(sel) {
  const out = [];
  let i = sel.indexOf(':is(');
  while (i >= 0) {
    let d = 0; let j = i + 3;
    for (; j < sel.length; j++) {
      if (sel[j] === '(') d++;
      else if (sel[j] === ')') { d--; if (d === 0) break; }
    }
    out.push(splitTop(sel.slice(i + 4, j)));
    i = sel.indexOf(':is(', j);
  }
  return out;
}

// An argument that outweighs a list of plain classes raises the WHOLE list
// (`:is()` takes its heaviest argument's specificity), which is how the
// login key's (0,2,1) once out-ranked the small-key radius everywhere.
// Weight outside :where(): classes, attributes and pseudo-classes, and any
// element name.
function heavy(arg) {
  const s = arg.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
  const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\(|is\(|where\()[\w-]+/g) || []).length;
  const element = /(^|[\s>+~(,])[a-z][a-z0-9-]*(?=[.:[\s>+~)]|$)/i.test(s.replace(/\[[^\]]+\]|\.[\w-]+|:[\w-]+/g, ' '));
  return classes > 1 || element;
}

function check(cssText) {
  const css = stripComments(cssText);
  const problems = [];
  const { rules, atRules } = walk(css);
  for (const r of rules) {
    for (const sel of splitTop(r.prelude)) {
      const ok = sel === KEY || (sel.startsWith(KEY) && /^[\s.:[>+~]/.test(sel.slice(KEY.length)));
      if (!ok) problems.push(`unkeyed selector: ${sel.slice(0, 90)}`);
      for (const args of isGroups(sel)) {
        if (args.length < 5 || !args[0].startsWith('.')) continue;
        for (const a of args) if (heavy(a)) problems.push(`a heavy argument raises a whole :is() list: ${a}`);
      }
    }
    const body = r.body.replace(/url\("[^"]*"\)|url\('[^']*'\)|url\([^)]*\)/g, 'url()');
    const hex = body.match(/#[0-9a-fA-F]{3,8}\b/g);
    if (hex) problems.push(`raw hex in ${r.prelude.slice(0, 50)}: ${hex.join(' ')}`);
    if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/.test(body)) problems.push(`raw colour function in ${r.prelude.slice(0, 50)}`);
    if (/(^|[\s,(:])(black|white|red|green|blue|yellow|gray|grey)(?=[\s,);]|$)/m.test(body)) problems.push(`named colour in ${r.prelude.slice(0, 50)}`);
  }
  for (const a of atRules) {
    if (/^@(import|font-face|keyframes|layer|property)\b/.test(a)) problems.push(`forbidden at-rule: ${a}`);
  }
  return { problems, rules: rules.length, atRules: atRules.length };
}

const cssPath = path.join(REPO, 'src', 'plate.css');
const real = readFileSync(cssPath, 'utf8');
const result = check(real);

const controls = [
  ['an unkeyed rule', `${real}\n.mb-tile { border-radius: 2px; }`],
  ['an unkeyed rule inside @media', `${real}\n@media (min-width: 1px) { .nav-link { color: var(--gold); } }`],
  ['a decoy prefix', `${real}\n:root .tm-plate .mb-tile { border-radius: 2px; }`],
  ['a keyed selector beside an unkeyed one', `${real}\n:root.tm-plate .a, .b { border-radius: 2px; }`],
  ['a raw hex', `${real}\n:root.tm-plate .mb-tile { border-color: #123456; }`],
  ['a raw rgba()', `${real}\n:root.tm-plate .mb-tile { box-shadow: 0 1px 0 rgba(0, 0, 0, 0.5); }`],
  ['an @import', `@import './x.css';\n${real}`],
  ['a heavy argument in a class list', `${real}\n:root.tm-plate :is(.a, .b, .c, .d, :where(.login-card) button[type='submit']) { border-radius: 2px; }`],
];
let controlsCaught = 0;
for (const [name, text] of controls) {
  const r = check(text);
  if (r.problems.length > result.problems.length) controlsCaught++;
  else console.log(`CONTROL MISSED: ${name}`);
}

const main = readFileSync(path.join(REPO, 'src', 'main.jsx'), 'utf8');
const plateJs = readFileSync(path.join(REPO, 'src', 'plate.js'), 'utf8');
const wiring = [];
if (!/import '\.\/plate\.css'/.test(main)) wiring.push('src/main.jsx does not import ./plate.css');
if (!/import \{ APP_PLATE \} from '\.\/plate\.js'/.test(main)) wiring.push('src/main.jsx does not import APP_PLATE');
if (!/if \(APP_PLATE\) document\.documentElement\.classList\.add\(APP_PLATE\)/.test(main)) wiring.push('src/main.jsx does not add the class only when APP_PLATE is non-empty');
const m = plateJs.match(/export const APP_PLATE = '([^']*)'/);
if (!m) wiring.push('src/plate.js does not export APP_PLATE as one string literal');
else if (m[1] && m[1] !== 'tm-plate') wiring.push(`APP_PLATE is "${m[1]}" but plate.css is keyed on tm-plate`);

for (const p of [...result.problems, ...wiring]) console.log(`FAIL ${p}`);
console.log(`keyed: ${result.rules} rules in ${result.atRules} at-rule blocks, ${result.problems.length} problems; wiring ${wiring.length ? 'BROKEN' : 'ok'} (APP_PLATE = '${m ? m[1] : '?'}'); positive controls caught ${controlsCaught}/${controls.length}`);
process.exit(result.problems.length || wiring.length || controlsCaught !== controls.length ? 1 : 0);
