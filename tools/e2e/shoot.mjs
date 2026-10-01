#!/usr/bin/env node
/**
 * Full-page screenshots of any routes, as any fixture persona, at any widths.
 *
 *   node tools/e2e/shoot.mjs --persona admin --mig all --widths 375,1440 \
 *     --routes /dashboard,/hours --out artifacts/shots/<name> \
 *     [--url http://127.0.0.1:PORT] [--port 5401] [--root-class NAME] [--no-reset]
 *     [--plate on|off]
 *
 * --routes all (or omitting --routes) shoots every route in
 * src/dev/fixture/routes.js, which tests/fixture-routes.test.js holds equal
 * to App.jsx's route table. --url reuses a running fixture server; otherwise
 * one is booted on --port and stopped afterwards. --root-class adds a class to
 * <html> before each shot (for comparing a styling switch on and off).
 * --plate on|off photographs the app's plate (src/plate.js) on or off: `on`
 * asserts main.jsx put the class on <html> (the tool never adds it, so a
 * broken switch fails here), `off` removes it before each shot. Without the
 * flag the page is photographed as it loads. tools/e2e/plate/ is the full
 * on/off/base harness; this flag is the one-route quick look.
 *
 * Per route it prints, and writes to <out>/shots.json: the final path (a
 * redirect is a finding, not a pass), console errors, the error answers the
 * fixture gave the page (a missing column, an RLS refusal, an RPC that does
 * not exist), and whether the page rendered a non-empty main area -- the text
 * outside the nav bar and the feedback launcher, measured from textContent.
 *
 * The store is reset once per width (before the first route), so routes that
 * write when opened (/checkin) see the same starting store at every width.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO, flag, viewportFor, startFixtureServer, launchBrowser, newContext, watchConsole, ensureDir, waitForFixture } from './lib.mjs';
import { waitForApp } from '../browser-verify/browser.mjs';
import { ROUTES } from '../../src/dev/fixture/routes.js';
import { APP_PLATE } from '../../src/plate.js';

const args = process.argv.slice(2);
const persona = String(flag(args, 'persona', 'admin'));
const mig = String(flag(args, 'mig', 'all'));
const widths = String(flag(args, 'widths', '375,1440')).split(',').map((w) => Number(w.trim())).filter(Boolean);
const routesArg = flag(args, 'routes', 'all');
const urlArg = flag(args, 'url', null);
const port = Number(flag(args, 'port', process.env.FIXTURE_PORT || 5401));
const rootClass = flag(args, 'root-class', null);
const reset = !flag(args, 'no-reset', false);
const plate = flag(args, 'plate', null);
if (plate !== null && plate !== 'on' && plate !== 'off') throw new Error(`--plate takes on or off, not ${plate}`);
const out = ensureDir(path.resolve(REPO, String(flag(args, 'out', path.join('artifacts', 'shots', `${persona}-${mig}`)))));

const routes = routesArg === 'all' || routesArg === true
  ? ROUTES.map((r) => r.url)
  : String(routesArg).split(',').map((r) => r.trim()).filter(Boolean);

const slug = (u) => (u === '/' ? 'root' : u.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, ''));

async function main() {
  const server = urlArg ? { origin: String(urlArg).replace(/\/$/, ''), stop: async () => {} } : await startFixtureServer({ port });
  const browser = await launchBrowser();
  const report = [];
  try {
    for (const width of widths) {
      const vp = viewportFor(width);
      const { context, blocked } = await newContext(browser, vp);
      if (rootClass) {
        await context.addInitScript((cls) => {
          const add = () => document.documentElement && document.documentElement.classList.add(cls);
          add();
          document.addEventListener('DOMContentLoaded', add);
        }, String(rootClass));
      }
      const page = await context.newPage();
      const errors = watchConsole(page);
      const controls = [`persona:${persona}`, `mig:${mig}`, reset ? 'reset' : null].filter(Boolean).join(',');
      await page.goto(`${server.origin}/_fixture?__fx=${controls}`);
      await waitForFixture(page);
      if ((await page.evaluate(() => window.__fx.persona)) !== persona) throw new Error(`persona ${persona} did not take`);

      for (const url of routes) {
        errors.length = 0;
        const t0 = Date.now();
        await page.goto(server.origin + url);
        const ready = await waitForApp(page, { timeoutMs: 30_000 });
        const isFixture = await page.evaluate(() => !!window.__fx).catch(() => false);
        await page.waitForTimeout(300);
        if (rootClass) await page.evaluate((cls) => document.documentElement.classList.add(cls), String(rootClass));
        if (plate === 'on' && APP_PLATE && !(await page.evaluate((cls) => document.documentElement.classList.contains(cls), APP_PLATE))) {
          throw new Error(`--plate on: <html> does not carry "${APP_PLATE}" on ${url}; src/main.jsx did not set it`);
        }
        if (plate === 'off' && APP_PLATE) {
          await page.evaluate((cls) => document.documentElement.classList.remove(cls), APP_PLATE);
          await page.waitForTimeout(100);
        }
        const measured = await page.evaluate(() => {
          const root = document.getElementById('root');
          const clone = root ? root.cloneNode(true) : document.body.cloneNode(true);
          for (const el of clone.querySelectorAll('nav, .navbar, .fb-launch, .fb-panel, script, style')) el.remove();
          const mainText = (clone.textContent || '').replace(/\s+/g, ' ').trim();
          const fxErrors = (window.__fx?.calls ?? []).filter((c) => c.error).map((c) => `${c.kind} ${c.table ?? c.name} ${c.error}`);
          return {
            path: location.pathname + location.search,
            mainChars: mainText.length,
            mainSample: mainText.slice(0, 120),
            errorBoundary: !!document.querySelector('.eb-wrap'),
            splash: !!document.querySelector('.splash') && mainText.length === 0,
            fxErrors,
          };
        });
        const file = path.join(out, `${persona}-${vp.name}-${slug(url)}${plate ? `-plate-${plate}` : ''}.png`);
        // A very tall page (the /_ds specimen is tens of thousands of px) can
        // outrun a full-page capture; fall back to the viewport and say so.
        let shotKind = 'full';
        try {
          await page.screenshot({ path: file, fullPage: true, timeout: 30_000 });
        } catch {
          shotKind = 'viewport';
          await page.screenshot({ path: file, timeout: 30_000 }).catch(() => { shotKind = 'none'; });
        }
        const row = {
          persona, mig, width: vp.name, route: url, plate: plate ?? 'as loaded',
          finalPath: measured.path,
          redirected: measured.path.split('?')[0] !== url.split('?')[0],
          rendered: ready.rendered && measured.mainChars > 0 && !measured.errorBoundary,
          mainChars: measured.mainChars,
          mainSample: measured.mainSample,
          errorBoundary: measured.errorBoundary,
          consoleErrors: errors.length,
          consoleSample: errors.slice(0, 3).map((e) => e.text),
          fixtureErrors: measured.fxErrors,
          fixtureMode: isFixture,
          ms: Date.now() - t0,
          png: path.relative(REPO, file),
          shot: shotKind,
        };
        report.push(row);
        console.log([
          `[${vp.name}] ${url}`.padEnd(46),
          row.redirected ? `-> ${row.finalPath}` : 'ok',
          `console ${row.consoleErrors}`,
          `fixture-errors ${row.fixtureErrors.length}${row.fixtureErrors.length ? ` (${[...new Set(row.fixtureErrors)].slice(0, 3).join('; ')})` : ''}`,
          row.rendered ? `main ${row.mainChars} chars` : `EMPTY${row.errorBoundary ? ' (error boundary)' : ''}`,
          row.shot === 'full' ? null : `shot: ${row.shot}`,
        ].filter(Boolean).join(' | '));
      }
      if (blocked.length) console.log(`[${vp.name}] ${blocked.length} external request(s) blocked`);
      await context.close();
    }
  } finally {
    await browser.close();
    await server.stop();
  }
  writeFileSync(path.join(out, 'shots.json'), JSON.stringify(report, null, 2));
  const empty = report.filter((r) => !r.rendered).length;
  const withErrors = report.filter((r) => r.consoleErrors > 0).length;
  console.log(`shoot: ${report.length} shot(s), ${report.length - empty} rendered, ${empty} empty, ${withErrors} with console errors -> ${path.relative(REPO, out)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
