#!/usr/bin/env node
/**
 * Every route, as admin and as student, at 375 and 1440, with the plate class
 * ON and OFF, plus the persona-only pages and the main interactive states.
 *
 *   node tools/e2e/plate/shots.mjs --port 5413                    # on + off, this checkout
 *   node tools/e2e/plate/shots.mjs --url http://127.0.0.1:5413 --set base
 *   node tools/e2e/plate/shots.mjs --port 5413 --routes /dashboard,/schedule --personas student --widths 375
 *
 * --set both (default) writes on/ and off/; any other name (base, const-empty)
 * photographs the page exactly as it loads, after asserting <html> does NOT
 * carry the plate class, into <out>/<set>/. Output:
 *
 *   artifacts/shots/plate/<set>/<persona>/<width>/<slug>.png
 *   artifacts/shots/plate/<set>.json     one row per shot: route, final path,
 *                                        class at load, console errors, size
 *
 * ON is the page as main.jsx leaves it: the tool never ADDS the class, it
 * asserts the class is there, so a broken wiring in main.jsx fails here
 * instead of being papered over by the harness.
 *
 * OFF is a FRESH load of the same page in a second context whose init script
 * makes `classList.add(APP_PLATE)` a no-op, so main.jsx's one line runs and
 * adds nothing: the page is built from its first frame without the class,
 * exactly as with the constant set to ''. The first version removed the
 * class from the ON page instead, and 18 of 176 of those OFF shots differed
 * from the base: a pointer resting where a state's click left it in the
 * plated layout, and native selects that Chromium does not return to their
 * unstyled size after a style change in the same load. `--off toggle` keeps
 * that quicker mode for a look, never for the proof.
 *
 * `--extras false` skips the persona-only pages and the states.
 * `--routes none` skips the route table; `--states all|none|review|<names>`
 * picks the states (`review` is REVIEW_STATES, the views the first visual
 * review opened by hand); `--persona-pages false` skips the persona pages.
 * That is how a base set is extended by exactly the states added since it
 * was shot:
 *
 *   node tools/e2e/plate/shots.mjs --url http://127.0.0.1:5413 --set base --routes none --states review --persona-pages false
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  REPO, flag, ensureDir, launchBrowser, watchConsole, ROUTES, APP_PLATE, SHOP, CLOCK,
  server, pinnedContext, fxUrl, settlePage, plateOn, setPlate, fullShot, slug, frames,
} from './common.mjs';
import { PERSONA_PAGES, STATES, REVIEW_STATES } from './states.mjs';

const args = process.argv.slice(2);
const set = String(flag(args, 'set', 'both'));
const personas = String(flag(args, 'personas', 'admin,student')).split(',').filter(Boolean);
const widths = String(flag(args, 'widths', '375,1440')).split(',').map(Number).filter(Boolean);
const routesArg = flag(args, 'routes', 'all');
const extras = String(flag(args, 'extras', 'true')) !== 'false';
const out = ensureDir(path.resolve(REPO, String(flag(args, 'out', path.join('artifacts', 'shots', 'plate')))));
const offMode = String(flag(args, 'off', 'fresh'));
if (offMode !== 'fresh' && offMode !== 'toggle') throw new Error(`--off takes fresh or toggle, not ${offMode}`);

// A lane is one pass over every page: its folder, whether the plate class is
// suppressed at load, and what <html> must carry when the shot is taken.
const LANES = set !== 'both'
  ? [{ name: set, suppress: false, expect: false }]
  : offMode === 'toggle'
    ? [{ name: 'on', suppress: false, expect: true, toggleOff: true }]
    : [{ name: 'on', suppress: false, expect: true }, { name: 'off', suppress: true, expect: false }];

const routeList = routesArg === 'all' || routesArg === true
  ? ROUTES.map((r) => r.url)
  : routesArg === 'none'
    ? []
    : String(routesArg).split(',').map((r) => r.trim()).filter(Boolean);
const statesArg = String(flag(args, 'states', 'all'));
const stateList = statesArg === 'all'
  ? STATES
  : statesArg === 'none'
    ? []
    : statesArg === 'review'
      ? REVIEW_STATES
      : STATES.filter((st) => statesArg.split(',').includes(st.name));
const personaPages = extras && String(flag(args, 'persona-pages', 'true')) !== 'false';

const report = [];

const pageBox = (page) => page.evaluate(() => ({
  overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  height: document.documentElement.scrollHeight,
}));

async function capture(page, lane, { persona, width, name, url, errors }) {
  const loadedOn = await plateOn(page);
  const file = (s) => path.join(out, s, persona, String(width), `${name}.png`);
  const row = { lane: lane.name, persona, width, name, route: url, finalPath: await page.evaluate(() => location.pathname + location.search), classAtLoad: loadedOn, consoleErrors: errors.length, consoleSample: errors.slice(0, 2).map((e) => e.text) };
  if (APP_PLATE && loadedOn !== lane.expect) {
    throw new Error(`${lane.name} ${persona} ${width} ${name}: <html> ${loadedOn ? 'carries' : 'does not carry'} "${APP_PLATE}" at load${lane.expect ? '; main.jsx did not set it' : ''}`);
  }
  row.box = await pageBox(page);
  row.png = path.relative(REPO, file(lane.name));
  row.shot = await fullShot(page, file(lane.name));
  if (lane.toggleOff) {
    await setPlate(page, false);
    row.offBox = await pageBox(page);
    row.off = path.relative(REPO, file('off'));
    row.offShot = await fullShot(page, file('off'));
    await setPlate(page, true);
  }
  report.push(row);
  console.log(`[${lane.name} ${persona} ${width}] ${name.padEnd(28)} ${row.finalPath.padEnd(34)} class ${loadedOn ? 'on ' : 'off'} console ${errors.length}`);
}

async function main() {
  const srv = await server(args);
  const browser = await launchBrowser();
  const ctx = (width, lane) => pinnedContext(browser, width, { suppressPlate: lane.suppress });
  try {
    for (const lane of LANES) {
      for (const width of widths) {
        for (const persona of personas) {
          const { context, page } = await ctx(width, lane);
          const errors = watchConsole(page);
          for (const url of routeList) {
            errors.length = 0;
            await page.goto(fxUrl(srv.origin, url, persona));
            await settlePage(page);
            await capture(page, lane, { persona, width, name: slug(url), url, errors });
          }
          if (extras) {
            for (const st of stateList.filter((x) => x.personas.includes(persona))) {
              const own = st.fresh ? await ctx(width, lane) : null;
              const p = own ? own.page : page;
              const errs = own ? watchConsole(p) : errors;
              errs.length = 0;
              await p.goto(fxUrl(srv.origin, st.url, persona));
              await settlePage(p);
              await st.run(p, srv.origin);
              await settlePage(p);
              await frames(p);
              await capture(p, lane, { persona, width, name: st.name, url: st.url, errors: errs });
              if (own) await own.context.close();
            }
          }
          await context.close();
        }
        if (personaPages) {
          for (const pp of PERSONA_PAGES) {
            const { context, page } = await ctx(width, lane);
            const errors = watchConsole(page);
            await page.goto(fxUrl(srv.origin, pp.url, pp.persona));
            await settlePage(page);
            await capture(page, lane, { persona: pp.persona, width, name: pp.name, url: pp.url, errors });
            await context.close();
          }
        }
      }
    }
  } finally {
    await browser.close();
    await srv.stop();
  }
  // A page that scrolls sideways with the plate on and not without it is a
  // broken layout a content check would pass over.
  const key = (r) => `${r.persona}/${r.width}/${r.name}`;
  const offRows = new Map(report.filter((r) => r.lane === 'off').map((r) => [key(r), r]));
  let overflow = 0;
  for (const r of report.filter((x) => x.lane === 'on')) {
    const o = r.offBox ?? offRows.get(key(r))?.box;
    if (o && r.box.overflowX > o.overflowX) { overflow++; console.log(`OVERFLOW  ${key(r)}: ${r.box.overflowX}px sideways with the plate on, ${o.overflowX}px off`); }
  }
  const name = set === 'both' ? 'on-off' : set;
  writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ clock: CLOCK.toISOString(), shop: SHOP, plateClass: APP_PLATE, set, offMode: set === 'both' ? offMode : null, rows: report }, null, 2));
  console.log(`plate shots: ${report.length} shots (${LANES.map((l) => l.name).join(' + ')}${set === 'both' && offMode === 'toggle' ? ' + off by toggle' : ''}), ${overflow} pages newly overflowing sideways -> ${path.relative(REPO, out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
