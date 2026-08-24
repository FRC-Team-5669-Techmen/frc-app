#!/usr/bin/env node
// FRC5669DesignSystem — build the sheet-group design-sync artifacts.
//
// `node scripts/design-system/ds-sheet-bundle.mjs`
//
// WHAT THIS IS, SAID PLAINLY: a reimplementation of the emit half of the
// /design-sync converter, for the sheets group only. The converter is vendored
// in `.ds-sync/` and driven by the bundled `/design-sync` skill; neither is
// available in every session, and both are gitignored, so on a fresh clone there
// is nothing to run. The emitted SHAPES here are not guessed — they were read
// off the live project (`components/surfaces/Card/Card.html`, `_preview/Card.js`)
// and mirrored.
//
// IT IS DELIBERATELY ADDITIVE. The uploaded `_ds_bundle.js`, `_ds_bundle.css`,
// `styles.css` and `_vendor/*` are NOT rewritten by the sync that uses this: the
// 52 components already on the project work against them, and replacing them
// with output from a reimplemented pipeline would put 52 working cards at risk
// to add 26. The sheet patterns are already inside the uploaded bundle — the
// converter's entry is `index.js`, which re-exports `components/sheets/` — so
// the new cards resolve against what is already there.
//
// The bundle and vendor files built here exist ONLY so the cards can be verified
// in a real browser before upload. `--verify-only` builds just those.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const DS = path.join(REPO, 'src/lib/design-system')
const PREVIEWS = path.join(REPO, '.design-sync/previews')
const OUT = path.join(REPO, 'ds-bundle')

const manifest = JSON.parse(fs.readFileSync(path.join(DS, '_ds_manifest.json'), 'utf8'))
const SHEETS = manifest.components.filter((c) => c.group === 'sheets')

/** Card geometry. The stage is scaled 0.48, so 1920 x 1440 lands at exactly
    922 x 691 and the viewport is that box — single card mode drops the body
    padding, so any larger viewport is a white gutter around the sheet. */
const VIEWPORT = '922x691'

/* ---- the two shims the preview bundles resolve against --------------------
   Read off _preview/Card.js on the live project, not invented: `ds` resolves to
   the global the DS bundle installs, and react resolves to the global the vendor
   file installs, so a preview never carries its own copy of either. */
const REACT_SHIM = `
var R = window.React;
function np(p, k) { var o = {}; for (var x in p) if (x !== 'children') o[x] = p[x]; if (k !== void 0) o.key = k; return o }
function jsx(t, p, k) { var c = p && p.children; return c === void 0 ? R.createElement(t, np(p, k)) : R.createElement(t, np(p, k), c) }
function jsxs(t, p, k) { return R.createElement.apply(R, [t, np(p, k)].concat(p.children)) }
module.exports = R;
module.exports.jsx = jsx;
module.exports.jsxs = jsxs;
module.exports.jsxDEV = function (t, p, k, s) { return (s ? jsxs : jsx)(t, p, k) };
module.exports.Fragment = R.Fragment;
`

const shims = {
  name: 'ds-shims',
  setup(build) {
    build.onResolve({ filter: /^frc5669-design-system$/ }, () => ({ path: 'ds', namespace: 'dsg' }))
    build.onLoad({ filter: /.*/, namespace: 'dsg' }, () => ({
      contents: 'module.exports = window.FRC5669DesignSystem;', loader: 'js',
    }))
    build.onResolve({ filter: /^react(\/jsx-runtime|\/jsx-dev-runtime)?$/ }, () => ({ path: 'react-shim', namespace: 'rs' }))
    build.onLoad({ filter: /.*/, namespace: 'rs' }, () => ({ contents: REACT_SHIM, loader: 'js' }))
  },
}

const ASSET_LOADERS = { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'dataurl' }

fs.mkdirSync(path.join(OUT, '_preview'), { recursive: true })
fs.mkdirSync(path.join(OUT, '_vendor'), { recursive: true })

/* ---- verification-only artifacts (never uploaded) ------------------------- */
async function buildVerificationDeps() {
  await esbuild.build({
    stdin: { contents: "export * from 'react'", resolveDir: REPO, loader: 'js' },
    bundle: true, format: 'iife', globalName: 'React',
    outfile: path.join(OUT, '_vendor/react.js'), logLevel: 'error',
  })
  // react-dom MUST resolve react to the same instance the vendor react.js
  // installed. Bundling it plainly gives react-dom its own private copy, two
  // Reacts end up on the page, and every card dies with "Invalid hook call" —
  // measured, not hypothesised.
  await esbuild.build({
    stdin: { contents: "export * from 'react-dom/client'", resolveDir: REPO, loader: 'js' },
    bundle: true, format: 'iife', globalName: 'ReactDOM',
    outfile: path.join(OUT, '_vendor/react-dom.js'), logLevel: 'error',
    plugins: [{
      name: 'react-global',
      setup(build) {
        build.onResolve({ filter: /^react$/ }, () => ({ path: 'react-global', namespace: 'rg' }))
        build.onLoad({ filter: /.*/, namespace: 'rg' }, () => ({ contents: 'module.exports = window.React;', loader: 'js' }))
      },
    }],
  })
  await esbuild.build({
    entryPoints: [path.join(DS, 'index.js')],
    bundle: true, format: 'iife', globalName: 'FRC5669DesignSystem',
    outfile: path.join(OUT, '_ds_bundle.js'), loader: ASSET_LOADERS,
    define: { 'import.meta.env': '{}' }, logLevel: 'error',
    plugins: [{
      name: 'react-external',
      setup(build) {
        build.onResolve({ filter: /^react(\/jsx-runtime|\/jsx-dev-runtime)?$/ }, () => ({ path: 'react-shim', namespace: 'rs' }))
        build.onLoad({ filter: /.*/, namespace: 'rs' }, () => ({ contents: REACT_SHIM, loader: 'js' }))
      },
    }],
  })
  await esbuild.build({
    entryPoints: [path.join(DS, 'styles.css')],
    bundle: true, outfile: path.join(OUT, 'styles.css'),
    external: ['https://*', '*.woff2', '*.woff'], loader: ASSET_LOADERS, logLevel: 'error',
  })
  // The project serves both; the card links styles.css then _ds_bundle.css.
  fs.writeFileSync(path.join(OUT, '_ds_bundle.css'), '/* component CSS ships inside styles.css for this system. */\n')
}

/* ---- the uploadable artifacts --------------------------------------------- */

/** The card page. Mirrors components/surfaces/Card/Card.html byte-for-byte in
    structure; only the marker, the mode and the preview path differ. */
function cardHtml(name) {
  return `<!-- @dsCard group="sheets" name="${name}" viewport="${VIEWPORT}" -->
<!doctype html>
<html><head><meta charset="utf-8">
  <link rel="stylesheet" href="../../../styles.css">
  <link rel="stylesheet" href="../../../_ds_bundle.css">
  <style>
    body{margin:0;padding:24px;background:#fff}
    .ds-grid{display:grid;grid-template-columns:1fr;gap:20px;align-items:start}
    .ds-cell{border:1px solid #e5e7eb;border-radius:8px;padding:12px;min-width:0;overflow:hidden;transform:translateZ(0)}
    .ds-cell>h4{margin:0 0 8px;font:600 12px system-ui;color:#6b7280;text-transform:uppercase;letter-spacing:.04em}
    .ds-single{transform:translateZ(0)}
    /* The pattern is mounted at rest, WITHOUT [data-deck-active], so no slide
       transition is armed and the card can never capture a sheet mid-wipe. The
       stage hides an unarmed sheet by design, so the card shows it again here —
       same specificity as the token rule, later in source order, no !important. */
    .frc-stage .frc-sheet{display:block}
  </style>
</head><body>
  <div class="ds-grid" id="g"></div>
  <script src="../../../_vendor/react.js"></script>
  <script src="../../../_vendor/react-dom.js"></script>
  <script src="../../../_ds_bundle.js"></script>
  <script src="../../../_preview/${name}.js"></script>
  <script>
    var h=React.createElement, g=document.getElementById('g');
    var E=[]; for (var k in (window.__dsPreview||{})) {
      if (typeof window.__dsPreview[k]==='function' && /^[A-Z]/.test(k)) E.push(k);
    }
    window.__dsCells=E.slice();
    var q=null; try{q=new URLSearchParams(location.search).get('story')}catch(e){}
    // SINGLE, not column: a sheet pattern has exactly one story and it is a
    // scaled 1920 x 1440 stage. A cell border and an uppercase story label
    // around it would read as chrome that belongs to the sheet.
    var MODE="single";
    window.__dsMode=MODE;
    var PRIMARY="";
    function mount(id,key){try{ReactDOM.createRoot(document.getElementById(id)).render(h(window.__dsPreview[key]))}catch(e){document.getElementById(id).textContent='⚠ '+(e&&e.message||e)}}
    var pick=null;
    if(q){for(var j=0;j<E.length;j++){if(E[j]===q||E[j].toLowerCase()===q.toLowerCase()){pick=E[j];break}}}
    else if(MODE==='single'&&E.length){pick=E.indexOf(PRIMARY)>=0?PRIMARY:E[0]}
    if(q&&!pick){g.textContent='⚠ no export named '+q}
    else if(pick){
      var s=document.createElement('div'); s.className='ds-single'; s.id='r0';
      if(!q)document.body.style.padding='0';
      g.parentNode.replaceChild(s,g); mount('r0',pick);
    } else {
      g.textContent='⚠ no PascalCase exports in _preview/${name}.js'
    }
  </script>
</body></html>
`
}

async function buildSheets() {
  for (const c of SHEETS) {
    const name = c.name
    const dir = path.join(OUT, 'components/sheets', name)
    fs.mkdirSync(dir, { recursive: true })

    await esbuild.build({
      entryPoints: [path.join(PREVIEWS, `${name}.tsx`)],
      bundle: true, format: 'iife', globalName: '__dsPreview',
      jsx: 'automatic',
      outfile: path.join(OUT, '_preview', `${name}.js`),
      define: { 'import.meta.env': '{}' },
      plugins: [shims], logLevel: 'error',
    })

    fs.copyFileSync(path.join(DS, c.sourcePath), path.join(dir, `${name}.jsx`))
    fs.copyFileSync(path.join(DS, c.types), path.join(dir, `${name}.d.ts`))
    fs.copyFileSync(path.join(DS, c.prompt), path.join(dir, `${name}.prompt.md`))
    fs.writeFileSync(path.join(dir, `${name}.html`), cardHtml(name))
  }
}

const verifyOnly = process.argv.includes('--verify-only')
await buildVerificationDeps()
if (!verifyOnly) await buildSheets()
console.log(`ds-sheet-bundle: ${verifyOnly ? 'verification deps only' : `${SHEETS.length} sheet patterns`} -> ds-bundle/`)
