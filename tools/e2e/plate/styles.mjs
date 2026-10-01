#!/usr/bin/env node
/**
 * Element-by-element proof that the plate never reaches the deck design
 * system: every element's computed style (every standard property; custom
 * properties are skipped, since the plate's own tokens are declared on
 * <html> and inherit everywhere without painting anything) is read with the
 * class ON, the class is removed in the same page load, and every element is
 * read again.
 *
 *   node tools/e2e/plate/styles.mjs --port 5413 [--routes /_ds,/dashboard] [--widths 375,1440]
 *
 * For each route it prints the elements read, how many differ, and how many
 * of those sit inside a .frc-deck. The claim is: 0 differ on /_ds and 0
 * inside any .frc-deck anywhere. The POSITIVE CONTROL is the same diff on an
 * app route, which must find differing elements, or the instrument is blind.
 */
import { REPO, flag, launchBrowser, server, pinnedContext, fxUrl, settlePage, setPlate, plateOn } from './common.mjs';

const args = process.argv.slice(2);
const routes = String(flag(args, 'routes', '/_ds,/dashboard,/schedule')).split(',').map((s) => s.trim()).filter(Boolean);
const widths = String(flag(args, 'widths', '375,1440')).split(',').map(Number).filter(Boolean);
const persona = String(flag(args, 'persona', 'admin'));

function snapshot() {
  const out = [];
  const all = document.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i];
    const cs = getComputedStyle(el);
    let s = '';
    for (let j = 0; j < cs.length; j++) {
      const p = cs[j];
      if (p.startsWith('--')) continue;
      s += `${p}:${cs.getPropertyValue(p)};`;
    }
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      if (ps.content && ps.content !== 'none' && ps.content !== 'normal') {
        s += `${pseudo}{`;
        for (let j = 0; j < ps.length; j++) {
          const p = ps[j];
          if (!p.startsWith('--')) s += `${p}:${ps.getPropertyValue(p)};`;
        }
        s += '}';
      }
    }
    out.push(s);
  }
  return out;
}

function describe(indices) {
  const all = document.querySelectorAll('*');
  return indices.map((i) => {
    const el = all[i];
    return { i, key: `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`, inDeck: !!el.closest('.frc-deck') };
  });
}

async function main() {
  const srv = await server(args);
  const browser = await launchBrowser();
  let failed = false;
  try {
    for (const width of widths) {
      for (const url of routes) {
        const { context, page } = await pinnedContext(browser, width);
        await page.goto(fxUrl(srv.origin, url, persona));
        await settlePage(page);
        // Three reads: as loaded (A), class removed (B), class back (C). The
        // plate's effect is B against C, two reads that both follow a full
        // style recalculation. A against C is the instrument's own noise: a
        // layout-resolved value (a table under a closed <details> on /_ds
        // read 0px tall before the first recalculation and 1348.58px after)
        // differs there with nothing toggled at all.
        const wasOn = await plateOn(page);
        const first = await page.evaluate(snapshot);
        await setPlate(page, false);
        const off = await page.evaluate(snapshot);
        await setPlate(page, true);
        const on = await page.evaluate(snapshot);
        const n = Math.min(on.length, off.length);
        const diff = [];
        for (let i = 0; i < n; i++) if (on[i] !== off[i]) diff.push(i);
        let noise = 0;
        for (let i = 0; i < Math.min(first.length, on.length); i++) if (first[i] !== on[i]) noise++;
        const described = await page.evaluate(describe, diff);
        const inDeck = described.filter((d) => d.inDeck);
        const decks = await page.evaluate(() => document.querySelectorAll('.frc-deck *').length);
        const sample = [...new Set(described.map((d) => d.key))].slice(0, 6).join(' ');
        console.log(`styles [${width}] ${url.padEnd(12)} class ${wasOn ? 'on' : 'OFF'} | ${on.length} elements (${decks} inside .frc-deck) | ${diff.length} differ on vs off, ${inDeck.length} of them inside .frc-deck${sample ? ` | e.g. ${sample}` : ''}${on.length !== off.length ? ` | ELEMENT COUNT CHANGED ${on.length} -> ${off.length}` : ''} | noise (as loaded vs after a recalc, nothing toggled) ${noise}`);
        if (url === '/_ds' && diff.length) failed = true;
        if (inDeck.length) failed = true;
        if (url !== '/_ds' && diff.length === 0) { console.log(`styles: POSITIVE CONTROL FAILED on ${url}: the plate changed nothing, so the diff cannot see`); failed = true; }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await srv.stop();
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
