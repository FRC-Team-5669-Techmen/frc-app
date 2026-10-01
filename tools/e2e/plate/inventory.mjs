#!/usr/bin/env node
/**
 * Every control, chip and panel the app draws, grouped by class, read from
 * the real rendered pages rather than from the stylesheets. This is how
 * src/plate.css's class lists were built (docs/SHAPES.md): a selector list
 * written from memory misses the surface nobody remembered.
 *
 *   node tools/e2e/plate/inventory.mjs --port 5413 [--personas admin,student] [--widths 375]
 *
 * Writes artifacts/shots/plate/inventory.json and prints one line per class
 * group: kind, count, a sample size and the routes it appears on.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO, flag, ensureDir, launchBrowser, ROUTES, server, pinnedContext, fxUrl, settlePage } from './common.mjs';

const args = process.argv.slice(2);
const personas = String(flag(args, 'personas', 'admin,student')).split(',');
const widths = String(flag(args, 'widths', '375')).split(',').map(Number);
const out = ensureDir(path.join(REPO, 'artifacts', 'shots', 'plate'));

function collect() {
  const SURFACES = new Set(['rgb(20, 22, 26)', 'rgb(26, 29, 34)']);
  const key = (el) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    }
    return true;
  };
  const info = (el, kind) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      kind,
      key: key(el),
      type: el.getAttribute('type') || null,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      display: cs.display,
      border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage !== 'none',
      radius: cs.borderTopLeftRadius,
      shadow: cs.boxShadow !== 'none',
      font: cs.fontFamily.split(',')[0],
      transform: cs.textTransform,
      size: cs.fontSize,
    };
  };
  const rows = [];
  const seen = new Set();
  const interactive = document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"], summary');
  for (const el of interactive) {
    if (!visible(el)) continue;
    seen.add(el);
    rows.push(info(el, 'control'));
  }
  const CHIPPY = /(chip|pill|badge|tag|status|kind|count|flag|state|lvl|level|cat|role)/i;
  for (const el of document.querySelectorAll('span, div, em, strong, small, b, i, p, li, td')) {
    if (seen.has(el) || !visible(el)) continue;
    const cls = el.className && typeof el.className === 'string' ? el.className : '';
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const framed = cs.borderTopWidth !== '0px' || (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && !SURFACES.has(cs.backgroundColor));
    if (r.height < 34 && r.width < 260 && framed && (CHIPPY.test(cls) || /inline/.test(cs.display))) {
      rows.push(info(el, 'chip'));
      continue;
    }
    if (r.height >= 40 && SURFACES.has(cs.backgroundColor) && cs.borderTopWidth !== '0px') {
      rows.push(info(el, 'panel'));
    }
  }
  return rows;
}

async function main() {
  const srv = await server(args);
  const browser = await launchBrowser();
  const groups = new Map();
  try {
    for (const width of widths) {
      for (const persona of personas) {
        const { context, page } = await pinnedContext(browser, width);
        for (const r of ROUTES) {
          if (r.group === 'dev') continue;
          await page.goto(fxUrl(srv.origin, r.url, persona));
          await settlePage(page);
          const rows = await page.evaluate(collect);
          for (const row of rows) {
            const g = groups.get(row.key) ?? { ...row, count: 0, routes: new Set(), personas: new Set(), widths: new Set() };
            g.count += 1;
            g.routes.add(r.path);
            g.personas.add(persona);
            g.widths.add(width);
            groups.set(row.key, g);
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await srv.stop();
  }
  const list = [...groups.values()].map((g) => ({ ...g, routes: [...g.routes], personas: [...g.personas], widths: [...g.widths] }))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
  writeFileSync(path.join(out, 'inventory.json'), JSON.stringify(list, null, 2));
  for (const g of list) {
    console.log(`${g.kind.padEnd(7)} ${String(g.count).padStart(4)}  ${g.key.slice(0, 70).padEnd(70)} ${String(g.w).padStart(6)}x${String(g.h).padEnd(5)} r${g.radius} b[${g.border}] bg[${g.bg}] ${g.font} ${g.routes.slice(0, 3).join(' ')}`);
  }
  console.log(`inventory: ${list.length} class groups -> ${path.relative(REPO, path.join(out, 'inventory.json'))}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
