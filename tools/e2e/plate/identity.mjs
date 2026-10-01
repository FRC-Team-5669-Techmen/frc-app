#!/usr/bin/env node
/**
 * No identity edge is recoloured. The plate repaints NEUTRAL edges: a key's
 * resting --border-strong becomes the load-bearing hairline, a panel's
 * --border becomes the panel edge. It must never repaint an edge whose colour
 * MEANS something: the gold "on" edge of a chosen answer, a pending request's
 * gold-dim rail, the fault red of a destructive or overdue row, a report key's
 * gold identity border. The first review found three of those by eye
 * (`.pr-choice-on`, `.rp-btn-print`, `.ar-card`), each caused by a class
 * missing from an exclusion list; this finds every one on every page, so the
 * next one is not left to a reviewer.
 *
 *   node tools/e2e/plate/identity.mjs --port 5413 [--widths 1440] [--personas admin,student] [--json out.json]
 *
 * For each page (every route as each persona, the persona-only pages, every
 * state), two fresh loads: ON, and OFF with the class suppressed from the
 * first frame (common.mjs). Every element's four border sides are read in
 * both. A side is an IDENTITY edge when, OFF, it has width and a colour with
 * chroma (max - min of r, g, b over 24 of 255; the app's borders are greys
 * and its meaningful edges are gold, red and the category and role hues). A
 * finding is an identity side whose colour differs ON.
 *
 * DELIBERATE, and listed so they are not findings: the lit sort keys' gold
 * edge moves INSIDE the hairline as the broken ring (docs/SHAPES.md, call 2),
 * and the nav pads drop the old gold underline (the pad's face, LED and word
 * carry the state). Each is matched by selector and reported as allowed.
 *
 * POSITIVE CONTROL, every run: /access-requests as admin is loaded ON with the
 * first review's bug put back in memory (`.ar-card { border-color: panel edge }`
 * over every side), and the check must report the pending rail. A checker
 * that could not see a recoloured edge would pass anything.
 *
 * Exit 1 on any finding, or if the control is not caught.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO, flag, ensureDir, launchBrowser, ROUTES, server, pinnedContext, fxUrl, settlePage, frames, slug } from './common.mjs';
import { PERSONA_PAGES, STATES } from './states.mjs';

const args = process.argv.slice(2);
const widths = String(flag(args, 'widths', '1440')).split(',').map(Number).filter(Boolean);
const personas = String(flag(args, 'personas', 'admin,student')).split(',').filter(Boolean);
const jsonOut = flag(args, 'json', path.join('artifacts', 'shots', 'plate', 'identity.json'));

const ALLOWED = [
  { selector: ':is(.jobs-sort-btn, .roster-sort-btn).active', why: 'the lit sort key: its gold edge moves inside the hairline as the broken ring' },
  { selector: '.navbar-links :is(.nav-link, .nav-dropdown-trigger)', why: 'the nav pad: the old gold underline goes; the lit face, the LED and the gold word carry the state' },
];

function readEdges(allowed) {
  const chroma = (c) => {
    const m = c.match(/[\d.]+/g);
    if (!m) return { chroma: 0, alpha: 0 };
    const [r, g, b, a = 1] = m.map(Number);
    return { chroma: Math.max(r, g, b) - Math.min(r, g, b), alpha: a };
  };
  const out = [];
  const all = document.querySelectorAll('body *');
  all.forEach((el, i) => {
    if (el.closest('.frc-deck')) return;
    const cs = getComputedStyle(el);
    const sides = {};
    for (const side of ['top', 'right', 'bottom', 'left']) {
      const w = parseFloat(cs[`border-${side}-width`]) || 0;
      if (w === 0 || cs[`border-${side}-style`] === 'none') continue;
      sides[side] = cs[`border-${side}-color`];
    }
    if (!Object.keys(sides).length) return;
    const allow = allowed.find((a) => el.matches(a.selector));
    out.push({
      i,
      key: `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}`,
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30),
      sides,
      identity: Object.fromEntries(Object.entries(sides).map(([s, c]) => { const k = chroma(c); return [s, k.alpha > 0.05 && k.chroma > 24]; })),
      allowed: allow ? allow.why : null,
    });
  });
  return { count: all.length, edges: out };
}

function compare(on, off) {
  // Same DOM both loads (the plate changes no markup), so document order
  // pairs them; if the counts ever differ, pair by key and occurrence.
  const byIndex = on.count === off.count;
  const nth = (list) => { const seen = new Map(); return list.map((e) => { const n = seen.get(e.key) || 0; seen.set(e.key, n + 1); return [`${e.key}#${n}`, e]; }); };
  const onMap = byIndex ? new Map(on.edges.map((e) => [e.i, e])) : new Map(nth(on.edges));
  const findings = []; const allowed = []; let identitySides = 0;
  for (const [k, o] of byIndex ? off.edges.map((e) => [e.i, e]) : nth(off.edges)) {
    for (const [side, isId] of Object.entries(o.identity)) {
      if (!isId) continue;
      identitySides++;
      const n = onMap.get(k);
      const now = n?.sides?.[side] ?? '(no border)';
      if (now === o.sides[side]) continue;
      const row = { key: o.key, text: o.text, side, off: o.sides[side], on: now };
      if (n?.allowed || o.allowed) allowed.push({ ...row, why: n?.allowed || o.allowed }); else findings.push(row);
    }
  }
  return { findings, allowed, identitySides, pairedBy: byIndex ? 'index' : 'key' };
}

async function load(browser, origin, width, pg, { suppressPlate, inject = null }) {
  const { context, page } = await pinnedContext(browser, width, { suppressPlate });
  await page.goto(fxUrl(origin, pg.url, pg.persona));
  await settlePage(page);
  if (pg.state) { await pg.state.run(page, origin); await settlePage(page); }
  if (inject) await page.addStyleTag({ content: inject });
  await frames(page);
  const r = await page.evaluate(readEdges, ALLOWED);
  await context.close();
  return r;
}

async function main() {
  const srv = await server(args);
  const browser = await launchBrowser();
  const report = { widths, personas, pages: [], control: null };
  let failures = 0;
  try {
    // The positive control first: if it is not caught, nothing after it means anything.
    const ctlPage = { name: 'access_requests', url: '/access-requests', persona: 'admin' };
    const ctlOff = await load(browser, srv.origin, widths[0], ctlPage, { suppressPlate: true });
    const ctlOn = await load(browser, srv.origin, widths[0], ctlPage, { suppressPlate: false, inject: ':root.tm-plate .ar-card { border-color: var(--tm-panel-edge) !important; }' });
    const ctl = compare(ctlOn, ctlOff);
    const caught = ctl.findings.filter((f) => f.key.includes('.ar-card') && f.side === 'left').length;
    report.control = { caught, findings: ctl.findings.length };
    console.log(`identity control: the first review's .ar-card bug put back in memory -> ${caught} pending rail(s) reported (${caught ? 'CAUGHT' : 'MISSED'})`);
    if (!caught) failures++;

    for (const width of widths) {
      const pages = [];
      for (const persona of personas) {
        for (const r of ROUTES) pages.push({ name: slug(r.url), url: r.url, persona });
        for (const st of STATES.filter((s) => s.personas.includes(persona))) pages.push({ name: st.name, url: st.url, persona, state: st });
      }
      for (const p of PERSONA_PAGES) pages.push({ name: `${p.persona}-${p.name}`, url: p.url, persona: p.persona });
      let sides = 0; let found = 0; let allowedN = 0;
      for (const pg of pages) {
        const off = await load(browser, srv.origin, width, pg, { suppressPlate: true });
        const on = await load(browser, srv.origin, width, pg, { suppressPlate: false });
        const c = compare(on, off);
        sides += c.identitySides; found += c.findings.length; allowedN += c.allowed.length;
        report.pages.push({ width, persona: pg.persona, name: pg.name, ...c });
        for (const f of c.findings) console.log(`RECOLOURED [${width}] ${pg.persona}/${pg.name}  ${f.key} "${f.text}" ${f.side}: ${f.off} -> ${f.on}`);
      }
      console.log(`identity [${width}]: ${pages.length} pages, ${sides} identity edge sides, ${found} recoloured, ${allowedN} recoloured on purpose (${ALLOWED.length} listed rules)`);
      failures += found;
    }
  } finally {
    await browser.close();
    await srv.stop();
  }
  ensureDir(path.dirname(path.resolve(REPO, jsonOut)));
  writeFileSync(path.resolve(REPO, jsonOut), JSON.stringify(report, null, 2));
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
