#!/usr/bin/env node
/**
 * The plate's token table, generated from src/plate.css so it cannot drift
 * from the code: every `--tm-*` declared on `:root.tm-plate`, its declared
 * value, the value at 480px and under where the viewport block moves it, and
 * for a colour the colour the browser actually resolves (read off a probe
 * element in the running app, class on), with its contrast against the four
 * grounds a control sits on.
 *
 *   node tools/e2e/plate/tokens.mjs --port 5413 > table.md
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REPO, flag, launchBrowser, server, pinnedContext, fxUrl, settlePage } from './common.mjs';

const args = process.argv.slice(2);
const css = readFileSync(path.join(REPO, 'src', 'plate.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function blocks(src) {
  const out = { base: new Map(), narrow: new Map() };
  const media = src.match(/@media \(max-width: 480px\)\s*\{\s*:root\.tm-plate\s*\{([^}]*)\}/);
  if (media) for (const m of media[1].matchAll(/(--tm-[\w-]+)\s*:\s*([^;]+);/g)) out.narrow.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  const stripped = media ? src.replace(media[0], '') : src;
  for (const b of stripped.matchAll(/(^|\})\s*:root\.tm-plate\s*\{([^}]*)\}/g)) {
    for (const m of b[2].matchAll(/(--tm-[\w-]+)\s*:\s*([^;]+);/g)) out.base.set(m[1], m[2].trim().replace(/\s+/g, ' '));
  }
  return out;
}

async function main() {
  const { base, narrow } = blocks(css);
  const srv = await server(args);
  const browser = await launchBrowser();
  let resolved = {};
  try {
    const { page } = await pinnedContext(browser, 1440);
    await page.goto(fxUrl(srv.origin, '/dashboard', 'student'));
    await settlePage(page, { quietMs: 300 });
    resolved = await page.evaluate((names) => {
      // A token that is not a colour is invalid at computed-value time in
      // `color`, so the probe inherits its parent's sentinel instead.
      const holder = document.createElement('div');
      holder.style.color = 'rgb(1, 2, 3)';
      const probe = document.createElement('div');
      holder.appendChild(probe);
      document.body.appendChild(holder);
      const lum = (rgb) => {
        const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const parse = (s) => {
        const m = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
        if (m) return { rgb: [m[1], m[2], m[3]].map((v) => Math.round(Number(v) * 255)), a: m[4] == null ? 1 : Number(m[4]) };
        const n = s.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
        if (n) return { rgb: [n[1], n[2], n[3]].map(Number), a: n[4] == null ? 1 : Number(n[4]) };
        return null;
      };
      const grounds = { bg: [10, 11, 13], surface: [20, 22, 26], 'surface-2': [26, 29, 34] };
      const out = {};
      for (const name of names) {
        probe.style.color = '';
        probe.style.color = `var(${name})`;
        const c = getComputedStyle(probe).color;
        const p = parse(c);
        if (!p || probe.style.color === '' || c === 'rgb(1, 2, 3)') { out[name] = null; continue; }
        const hex = `#${p.rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        const ratios = p.a === 1 ? Object.fromEntries(Object.entries(grounds).map(([k, g]) => {
          const a = lum(p.rgb); const b = lum(g);
          return [k, ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2)];
        })) : null;
        out[name] = { hex, alpha: p.a, ratios };
      }
      holder.remove();
      return out;
    }, [...base.keys()]);
  } finally {
    await browser.close();
    await srv.stop();
  }
  const isColour = (k) => resolved[k];
  console.log('| token | declared | at 480px and under |');
  console.log('| --- | --- | --- |');
  for (const [k, v] of base) if (!isColour(k)) console.log(`| \`${k}\` | \`${v}\` | ${narrow.has(k) ? `\`${narrow.get(k)}\`` : ''} |`);
  console.log('');
  console.log('| token | declared (theme.css tokens only) | resolves to | contrast on --bg / --surface / --surface-2 |');
  console.log('| --- | --- | --- | --- |');
  for (const [k, v] of base) {
    const r = resolved[k];
    if (!r) continue;
    const res = r.alpha === 1 ? r.hex : `${r.hex} at ${Math.round(r.alpha * 100)}%`;
    const ratio = r.ratios ? `${r.ratios.bg} / ${r.ratios.surface} / ${r.ratios['surface-2']}` : '(translucent: a shade or a light, not a boundary)';
    console.log(`| \`${k}\` | \`${v}\` | \`${res}\` | ${ratio} |`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
