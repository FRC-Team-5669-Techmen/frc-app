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
 * instead of being papered over by the harness. OFF is the same page load
 * with the class removed (common.mjs says why that pair differs in nothing
 * else). `--extras false` skips the persona-only pages and the states.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  REPO, flag, ensureDir, launchBrowser, watchConsole, ROUTES, APP_PLATE, SHOP, CLOCK,
  server, pinnedContext, fxUrl, settlePage, plateOn, setPlate, fullShot, slug, frames,
} from './common.mjs';
import { PERSONA_PAGES, STATES } from './states.mjs';

const args = process.argv.slice(2);
const set = String(flag(args, 'set', 'both'));
const personas = String(flag(args, 'personas', 'admin,student')).split(',').filter(Boolean);
const widths = String(flag(args, 'widths', '375,1440')).split(',').map(Number).filter(Boolean);
const routesArg = flag(args, 'routes', 'all');
const extras = String(flag(args, 'extras', 'true')) !== 'false';
const out = ensureDir(path.resolve(REPO, String(flag(args, 'out', path.join('artifacts', 'shots', 'plate')))));

const routeList = routesArg === 'all' || routesArg === true
  ? ROUTES.map((r) => r.url)
  : String(routesArg).split(',').map((r) => r.trim()).filter(Boolean);

const report = [];

const pageBox = (page) => page.evaluate(() => ({
  overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
  height: document.documentElement.scrollHeight,
}));

async function capture(page, { persona, width, name, url, errors }) {
  const loadedOn = await plateOn(page);
  const file = (s) => path.join(out, s, persona, String(width), `${name}.png`);
  const row = { persona, width, name, route: url, finalPath: await page.evaluate(() => location.pathname + location.search), classAtLoad: loadedOn, consoleErrors: errors.length, consoleSample: errors.slice(0, 2).map((e) => e.text) };
  if (set === 'both') {
    if (APP_PLATE && !loadedOn) throw new Error(`${persona} ${width} ${name}: <html> does not carry "${APP_PLATE}" at load; main.jsx did not set it`);
    row.on = path.relative(REPO, file('on'));
    row.onBox = await pageBox(page);
    row.onShot = await fullShot(page, file('on'));
    await setPlate(page, false);
    row.off = path.relative(REPO, file('off'));
    row.offBox = await pageBox(page);
    row.offShot = await fullShot(page, file('off'));
    await setPlate(page, true);
    // A page that scrolls sideways with the plate on and not without it is a
    // broken layout a content check would pass over.
    if (row.onBox.overflowX > 0 && row.onBox.overflowX > row.offBox.overflowX) {
      console.log(`OVERFLOW  [${persona} ${width}] ${name}: ${row.onBox.overflowX}px sideways with the plate on, ${row.offBox.overflowX}px off`);
    }
  } else {
    if (loadedOn) throw new Error(`${persona} ${width} ${name}: set "${set}" expects no plate class, but <html> carries "${APP_PLATE}"`);
    row[set] = path.relative(REPO, file(set));
    row.shot = await fullShot(page, file(set));
  }
  report.push(row);
  console.log(`[${persona} ${width}] ${name.padEnd(28)} ${row.finalPath.padEnd(34)} class ${loadedOn ? 'on ' : 'off'} console ${errors.length}`);
}

async function main() {
  const srv = await server(args);
  const browser = await launchBrowser();
  try {
    for (const width of widths) {
      for (const persona of personas) {
        const { context, page } = await pinnedContext(browser, width);
        const errors = watchConsole(page);
        for (const url of routeList) {
          errors.length = 0;
          await page.goto(fxUrl(srv.origin, url, persona));
          await settlePage(page);
          await capture(page, { persona, width, name: slug(url), url, errors });
        }
        if (extras) {
          for (const st of STATES.filter((s) => s.personas.includes(persona))) {
            const own = st.fresh ? await pinnedContext(browser, width) : null;
            const p = own ? own.page : page;
            const errs = own ? watchConsole(p) : errors;
            errs.length = 0;
            await p.goto(fxUrl(srv.origin, st.url, persona));
            await settlePage(p);
            await st.run(p, srv.origin);
            await settlePage(p);
            await frames(p);
            await capture(p, { persona, width, name: st.name, url: st.url, errors: errs });
            if (own) await own.context.close();
          }
        }
        await context.close();
      }
      if (extras) {
        for (const pp of PERSONA_PAGES) {
          const { context, page } = await pinnedContext(browser, width);
          const errors = watchConsole(page);
          await page.goto(fxUrl(srv.origin, pp.url, pp.persona));
          await settlePage(page);
          await capture(page, { persona: pp.persona, width, name: pp.name, url: pp.url, errors });
          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
    await srv.stop();
  }
  const name = set === 'both' ? 'on-off' : set;
  writeFileSync(path.join(out, `${name}.json`), JSON.stringify({ clock: CLOCK.toISOString(), shop: SHOP, plateClass: APP_PLATE, set, rows: report }, null, 2));
  console.log(`plate shots: ${report.length} page states, set ${set} -> ${path.relative(REPO, out)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
