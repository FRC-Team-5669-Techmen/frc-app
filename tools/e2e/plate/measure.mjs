#!/usr/bin/env node
/**
 * The 44px sweep and the "a chip must not look pressable" check, on every
 * student-reachable route and state, with the plate class ON (and, for the
 * comparison, OFF: a second fresh load with the class suppressed).
 *
 *   node tools/e2e/plate/measure.mjs --port 5413 [--widths 375] [--personas student] [--json out.json]
 *
 * TARGETS. Every visible button, link, field, select, textarea, summary and
 * role=button/tab, AND every other element that declares `cursor: pointer`
 * outermost (its parent does not): a div or li with an onClick, a sortable
 * table head, a label acting as a toggle. The first sweep took only the
 * element types, and missed exactly those (a skill row a student taps, a jobs
 * row, Team Hours' sort heads, the coverage view's toggle label); the cursor
 * is what the app itself uses to say "this is a control", so it is what the
 * sweep reads. A checkbox or radio inside a <label> is measured as the
 * label, because the label is what a thumb hits. An <a> that is running text
 * (display inline, no border, no background, no shadow, inside a paragraph)
 * is a text link, not a control: it is counted and listed separately, never
 * silently dropped. Anything inside a .frc-deck (the /_ds specimen) is out of
 * scope. A target under 44px tall is a finding: selector, text, size, route.
 *
 * CHIPS. Every non-interactive element whose class names it a chip, pill,
 * badge, tag, status, count, flag, kind or state and that draws a box. Each
 * must carry NO drop shadow (an outer shadow with blur or a downward offset
 * of 2px or more) and no pointer cursor. The POSITIVE CONTROL is the same
 * parse run over the keys: a raised key must have one, so a parser that
 * could not see shadows at all would fail here instead of passing.
 *
 * Prints one line per finding and a summary per width; exit 1 on any finding
 * with the class on.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO, flag, ensureDir, launchBrowser, ROUTES, server, pinnedContext, fxUrl, settlePage, plateOn, slug, frames } from './common.mjs';
import { PERSONA_PAGES, STATES } from './states.mjs';

const args = process.argv.slice(2);
const widths = String(flag(args, 'widths', '375')).split(',').map(Number).filter(Boolean);
const personas = String(flag(args, 'personas', 'student')).split(',').filter(Boolean);
const jsonOut = flag(args, 'json', path.join('artifacts', 'shots', 'plate', 'measure.json'));
const STUDENT_GROUPS = new Set(['public', 'member', 'checkin']);

function sweep() {
  const KEYISH = /(btn|button|submit|cancel|save|toggle|tab|opt|choice|cta|link|chip|cat|check|tick)/i;
  const CHIPPY = /(chip|pill|badge|tag|status|count|flag|kind|state)/i;
  const hidden = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return true;
    }
    return false;
  };
  const key = (el) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join('')}${el.getAttribute('type') ? `[type=${el.getAttribute('type')}]` : ''}`;
  // Split a computed box-shadow list into shadows, at commas outside parens.
  const shadows = (v) => {
    if (!v || v === 'none') return [];
    const out = []; let depth = 0; let cur = '';
    for (const ch of v) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out.map((s) => {
      const inset = /\binset\b/.test(s);
      const nums = (s.replace(/(rgba?|color|oklch|hsla?)\([^)]*\)/g, '').match(/-?\d*\.?\d+px/g) || []).map(parseFloat);
      const [x = 0, y = 0, blur = 0, spread = 0] = nums;
      return { inset, x, y, blur, spread };
    });
  };
  const hasDrop = (el) => shadows(getComputedStyle(el).boxShadow).some((s) => !s.inset && (s.blur > 0 || s.y >= 2));

  // A control may widen its hit area with an absolutely positioned pseudo-
  // element instead of growing its box (the Team Hours history's close does,
  // so its glyph and focus ring keep their place). That area is what a thumb
  // hits, so it is what is measured; the row records the box as well.
  const pseudoHit = (el, r) => {
    let w = r.width; let h = r.height; let by = null;
    for (const p of ['::before', '::after']) {
      const ps = getComputedStyle(el, p);
      if (ps.content === 'none' || ps.content === 'normal' || ps.position !== 'absolute' || ps.display === 'none') continue;
      const pw = parseFloat(ps.width) || 0; const ph = parseFloat(ps.height) || 0;
      if (pw > w || ph > h) { w = Math.max(w, pw); h = Math.max(h, ph); by = p; }
    }
    return { w, h, by };
  };
  const targets = []; const textLinks = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="tab"]')) {
    if (el.closest('.frc-deck') || hidden(el)) continue;
    let t = el;
    if (el.matches('input[type="checkbox"], input[type="radio"]')) {
      const lab = el.closest('label') || (el.id && document.querySelector(`label[for="${el.id}"]`));
      if (lab) t = lab;
    }
    if (seen.has(t)) continue;
    seen.add(t);
    const cs = getComputedStyle(t);
    const r = t.getBoundingClientRect();
    const hit = pseudoHit(t, r);
    const row = { key: key(t), text: (t.textContent || t.getAttribute('aria-label') || t.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40), w: Math.round(hit.w * 10) / 10, h: Math.round(hit.h * 10) / 10, ...(hit.by ? { hit: hit.by, box: [Math.round(r.width), Math.round(r.height)] } : {}) };
    const boxless = cs.borderTopWidth === '0px' && cs.borderBottomWidth === '0px' && cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.boxShadow === 'none';
    // Not td: a link in a table cell is a row's control (the coverage
    // matrix's member names), not a sentence's.
    if (t.tagName === 'A' && cs.display === 'inline' && boxless && t.closest('p, li, span, small')) { textLinks.push(row); continue; }
    targets.push(row);
  }
  // Controls that are not control elements: the outermost element declaring
  // a pointer cursor (cursor is inherited, so a child of a clickable row is
  // the row's, not a control of its own), not inside a target already taken.
  const taken = [...seen];
  for (const el of document.querySelectorAll('body *')) {
    if (seen.has(el) || el.closest('.frc-deck')) continue;
    const cs = getComputedStyle(el);
    if (cs.cursor !== 'pointer') continue;
    if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') continue;
    if (taken.some((t) => t.contains(el) || el.contains(t) && el.matches('label'))) continue;
    if (el.matches('input, option, img, svg, path')) continue;
    if (hidden(el)) continue;
    const r = el.getBoundingClientRect();
    seen.add(el);
    targets.push({ key: key(el), text: (el.textContent || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, by: 'cursor' });
  }

  const chips = []; const keys = [];
  for (const el of document.querySelectorAll('span, div, em, strong, small, b, i, li, td, p, label')) {
    if (el.closest('.frc-deck') || hidden(el)) continue;
    const cls = typeof el.className === 'string' ? el.className : '';
    if (!CHIPPY.test(cls) || el.matches('button, a, label, input')) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const framed = cs.borderTopWidth !== '0px' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)';
    if (!framed || r.height > 40 || r.width > 320 || el.querySelector('button, a, input')) continue;
    // A pointer cursor only counts when the chip declares it: a chip inside a
    // clickable row inherits the row's pointer, and the row is the control.
    const parentCursor = el.parentElement ? getComputedStyle(el.parentElement).cursor : 'auto';
    chips.push({ key: key(el), text: (el.textContent || '').trim().slice(0, 30), drop: hasDrop(el), pointer: cs.cursor === 'pointer' && parentCursor !== 'pointer', h: Math.round(r.height * 10) / 10 });
  }
  for (const el of document.querySelectorAll('button, a[href]')) {
    if (el.closest('.frc-deck') || hidden(el)) continue;
    const cls = typeof el.className === 'string' ? el.className : '';
    const cs = getComputedStyle(el);
    if (!KEYISH.test(cls) || (cs.borderTopWidth === '0px' && cs.backgroundColor === 'rgba(0, 0, 0, 0)')) continue;
    if (el.closest('.navbar-links, .nav-dropdown-menu')) continue;
    keys.push({ key: key(el), drop: hasDrop(el) });
  }
  return { targets, textLinks, chips, keys };
}

async function main() {
  const srv = await server(args);
  const browser = await launchBrowser();
  const report = { widths, personas, pages: [] };
  try {
    for (const width of widths) {
      for (const persona of personas) {
        const pages = [
          ...ROUTES.filter((r) => STUDENT_GROUPS.has(r.group)).map((r) => ({ name: slug(r.url), url: r.url, persona })),
          ...STATES.filter((s) => s.personas.includes(persona)).map((s) => ({ name: s.name, url: s.url, persona, state: s })),
          ...PERSONA_PAGES.filter((p) => p.persona !== 'parent').map((p) => ({ name: `${p.persona}-${p.name}`, url: p.url, persona: p.persona })),
        ];
        for (const pg of pages) {
          // ON and OFF are two fresh loads; OFF suppresses the class from the
          // first frame (common.mjs), so OFF is the app as it is today.
          const load = async (suppressPlate) => {
            const { context, page } = await pinnedContext(browser, width, { suppressPlate });
            await page.goto(fxUrl(srv.origin, pg.url, pg.persona));
            await settlePage(page);
            if (pg.state) { await pg.state.run(page, srv.origin); await settlePage(page); await frames(page); }
            const cls = await plateOn(page);
            const m = await page.evaluate(sweep);
            await context.close();
            return { cls, m };
          };
          const on = await load(false);
          const off = await load(true);
          report.pages.push({ width, persona: pg.persona, name: pg.name, url: pg.url, classOn: on.cls, classOffWasOff: !off.cls, on: on.m, off: off.m });
        }
      }
    }
  } finally {
    await browser.close();
    await srv.stop();
  }

  let failures = 0;
  for (const width of widths) {
    const pages = report.pages.filter((p) => p.width === width);
    const under = []; const underOff = new Set();
    let targets = 0; let textLinks = 0; let chips = 0; let chipDrops = 0; let chipPointers = 0; let keys = 0; let keyDrops = 0; let byCursor = 0; let byCursorUnderOff = 0;
    for (const p of pages) {
      for (const t of p.off.targets) if (t.h < 44) underOff.add(`${p.name}|${t.key}|${t.text}`);
      for (const t of p.off.targets) if (t.by === 'cursor' && t.h < 44) byCursorUnderOff++;
      targets += p.on.targets.length; textLinks += p.on.textLinks.length;
      byCursor += p.on.targets.filter((t) => t.by === 'cursor').length;
      for (const t of p.on.targets) if (t.h < 44) under.push({ page: p.name, ...t });
      for (const c of p.on.chips) { chips++; if (c.drop) { chipDrops++; console.log(`CHIP DROP  [${width}] ${p.name}  ${c.key} "${c.text}"`); } if (c.pointer) { chipPointers++; console.log(`CHIP POINTER [${width}] ${p.name}  ${c.key} "${c.text}"`); } }
      for (const k of p.on.keys) { keys++; if (k.drop) keyDrops++; }
    }
    for (const u of under) console.log(`UNDER 44  [${width}] ${u.page.padEnd(26)} ${u.key.slice(0, 60).padEnd(60)} ${String(u.w).padStart(6)} x ${u.h}  "${u.text}"${underOff.has(`${u.page}|${u.key}|${u.text}`) ? '' : '  (NEW: not under with the class off)'}`);
    const uniqueOn = new Set(under.map((u) => u.key));
    console.log(`measure [${width}]: ${pages.length} pages, ${targets} targets, ${under.length} under 44px (${uniqueOn.size} distinct selectors; ${underOff.size} under with the class off), ${textLinks} text links exempt`);
    console.log(`measure [${width}]: ${byCursor} of those targets found by their pointer cursor alone (not a control element); positive control: ${byCursorUnderOff} of them are under 44px with the class off`);
    console.log(`measure [${width}]: chips ${chips}, with a drop shadow ${chipDrops}, with a pointer cursor ${chipPointers}; positive control: keys ${keys}, with a drop shadow ${keyDrops}`);
    failures += under.length + chipDrops;
  }
  ensureDir(path.dirname(path.resolve(REPO, jsonOut)));
  writeFileSync(path.resolve(REPO, jsonOut), JSON.stringify(report, null, 2));
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
