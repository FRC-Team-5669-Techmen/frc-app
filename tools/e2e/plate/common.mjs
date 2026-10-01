/**
 * Shared plumbing for the plate tools (docs/SHAPES.md):
 *
 *   shots.mjs     every route and state, class on and off, into
 *                 artifacts/shots/plate/<set>/<persona>/<width>/<slug>.png
 *   compare.mjs   decoded-pixel diff of two shot sets (N identical of N)
 *   measure.mjs   the 44px sweep and the "chips do not look pressable" check
 *   inventory.mjs every control, chip and panel the app draws, by class
 *
 * A screenshot comparison is only worth anything if the same tree renders the
 * same pixels twice. Everything here that could move between two runs of one
 * tree is pinned:
 *
 *   - the clock: Playwright's fixed time (Date.now is constant, timers still
 *     run), Thursday 2026-10-01 4:00 PM in Los Angeles, the same instant
 *     tools/e2e/checkin.mjs starts at, so the fixture seeds the same rows;
 *   - randomness: Math.random and crypto.randomUUID are replaced by seeded,
 *     counting stand-ins before any page script runs (the fixture gives seed
 *     rows without a fixed id a randomUUID, and some lists sort by id);
 *   - motion: the context emulates prefers-reduced-motion: reduce (every
 *     spinner and flash in the app already honours it) and a style tag sets
 *     `transition: none` and `animation: none` on everything, because toggling
 *     the root class mid-page would otherwise be photographed mid-transition;
 *   - fonts: document.fonts.ready is awaited before every shot;
 *   - the store: reseeded per route (`?__fx=persona:X,mig:all,reset` on the
 *     route itself), so no route's picture depends on which route ran first.
 *
 * The OFF picture of a route is a second, FRESH load with the class
 * suppressed from the first frame (`pinnedContext(..., { suppressPlate })`),
 * which is the app exactly as the constant set to '' leaves it. Removing the
 * class from the ON page instead (`setPlate`, kept for quick looks) leaves
 * traces a fresh load does not: a pointer resting where a click was in the
 * plated layout, and native selects Chromium does not return to their
 * unstyled size after a style change within one load.
 *
 * Three more pins, each found by a run that did not repeat: the rasteriser
 * (DETERMINISTIC_ARGS), /_ds photographed as its first screen (fullShot), and
 * the build stamp, which differs between a checkout and an archive unless the
 * server runs with VERCEL_GIT_COMMIT_SHA set (docs/SHAPES.md).
 */
import path from 'node:path';
import { chromium } from 'playwright-core';
import { REPO, flag, viewportFor, startFixtureServer, newContext, watchConsole, ensureDir, waitForFixture } from '../lib.mjs';
import { waitForApp, resolveExecutable, LAUNCH_ARGS } from '../../browser-verify/browser.mjs';
import { ROUTES } from '../../../src/dev/fixture/routes.js';
import { APP_PLATE } from '../../../src/plate.js';

export { REPO, flag, viewportFor, watchConsole, ensureDir, waitForFixture, waitForApp, ROUTES, APP_PLATE };

export const CLOCK = new Date('2026-10-01T16:00:00-07:00');
export const SHOP = { latitude: 34.04155, longitude: -118.086826, accuracy: 10 };
export const STUDENT_ID = '00000000-0000-0000-0000-0000000000c1';

export const FREEZE_CSS = '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }';

export const slug = (u) => (u === '/' ? 'root' : u.replace(/^\//, '').split('?')[0].replace(/[^a-z0-9]+/gi, '_').replace(/_+$/, ''));

/**
 * The container's Chromium (tools/browser-verify/browser.mjs's resolution
 * chain and launch arguments) plus the flags that make its rasteriser repeat
 * itself. Measured without them: two runs of the SAME tree differed by 7 to
 * 217 pixels on 4 of 56 pages, every one an antialiased edge (the avatar's
 * circle, calendar cell borders) -- the multi-threaded tiled rasteriser does
 * not promise the same coverage at a tile seam twice. One raster thread and no
 * partial raster make it repeat; the flags change nothing for base and plate
 * alike, since every set is shot through this one function.
 */
export const DETERMINISTIC_ARGS = ['--num-raster-threads=1', '--disable-partial-raster', '--disable-threaded-animation', '--disable-threaded-scrolling'];

export async function launchBrowser() {
  const { path: exe, tried } = resolveExecutable();
  if (!exe) throw new Error(`No Chromium binary found. Tried:\n${tried.map((t) => `  ${t.path}`).join('\n')}`);
  return chromium.launch({ executablePath: exe, args: [...LAUNCH_ARGS, ...DETERMINISTIC_ARGS] });
}

/** `--url` reuses a running server (unchecked, e.g. a base tree); otherwise boot this checkout's. */
export async function server(args) {
  const urlArg = flag(args, 'url', null);
  if (urlArg) return { origin: String(urlArg).replace(/\/$/, ''), stop: async () => {}, reused: true };
  const port = Number(flag(args, 'port', process.env.FIXTURE_PORT || 5401));
  return startFixtureServer({ port });
}

/** A context with the pinned clock, randomness and motion described above. */
export async function pinnedContext(browser, width, { geolocation = SHOP, permissions = ['geolocation'], suppressPlate = false } = {}) {
  const vp = viewportFor(width);
  const { context, blocked } = await newContext(browser, vp, { geolocation, permissions });
  // The plate OFF from the first frame: main.jsx's `classList.add(APP_PLATE)`
  // still runs and adds nothing, exactly as if the constant were ''.
  if (suppressPlate && APP_PLATE) {
    await context.addInitScript((cls) => {
      const add = DOMTokenList.prototype.add;
      DOMTokenList.prototype.add = function plateSuppressedAdd(...tokens) { return add.apply(this, tokens.filter((t) => t !== cls)); };
    }, APP_PLATE);
  }
  await context.clock.setFixedTime(CLOCK);
  await context.addInitScript(() => {
    let s = 0x2545f491;
    Math.random = () => {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    let n = 0;
    const hex = (v, len) => v.toString(16).padStart(len, '0');
    const ru = () => { n += 1; return `fe${hex(n, 6)}-0000-4000-8000-${hex(n, 12)}`; };
    try { Object.defineProperty(globalThis.crypto, 'randomUUID', { value: ru, configurable: true }); } catch { /* ignore */ }
  });
  // The freeze is in the document from its first byte, not added after load:
  // /_ds runs in-page proofs on 60 to 320 ms timers, and a style tag landing
  // between two of them made the same tree render two different pages.
  await context.addInitScript((css) => {
    const put = () => {
      const st = document.createElement('style');
      st.setAttribute('data-plate-freeze', '');
      st.textContent = css;
      (document.head || document.documentElement).appendChild(st);
    };
    if (document.documentElement) put(); else document.addEventListener('DOMContentLoaded', put);
  }, FREEZE_CSS);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  return { vp, context, page, blocked };
}

/** The route URL with the fixture controls appended (persona, every migration, a fresh store). */
export function fxUrl(origin, url, persona, { reset = true } = {}) {
  const controls = [`persona:${persona}`, 'mig:all', reset ? 'reset' : null].filter(Boolean).join(',');
  return `${origin}${url}${url.includes('?') ? '&' : '?'}__fx=${controls}`;
}

/** Wait until the page has rendered, then pin motion and fonts. */
export async function settlePage(page, { quietMs = null } = {}) {
  const ready = await waitForApp(page, { timeoutMs: 30_000 });
  await page.evaluate(() => document.fonts.ready.then(() => true)).catch(() => {});
  // Quiet: the element count, the text length and the page height have not
  // changed for quietMs (longer on /_ds, whose proofs chain their timers).
  const quiet = quietMs ?? (new URL(page.url()).pathname === '/_ds' ? 2500 : 600);
  await page.waitForFunction((ms) => {
    const sig = `${document.getElementsByTagName('*').length}:${(document.body?.textContent || '').length}:${document.documentElement.scrollHeight}`;
    const now = performance.now();
    if (window.__plateSig !== sig) { window.__plateSig = sig; window.__plateSigAt = now; return false; }
    return now - window.__plateSigAt >= ms;
  }, quiet, { timeout: 30_000, polling: 100 }).catch(() => {});
  await frames(page);
  return ready;
}

export async function frames(page, n = 2) {
  await page.evaluate((count) => new Promise((resolve) => {
    let left = count;
    const step = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), n).catch(() => {});
}

/** Whether <html> carries the plate class right now, as main.jsx set it. */
export async function plateOn(page) {
  if (!APP_PLATE) return false;
  return page.evaluate((cls) => document.documentElement.classList.contains(cls), APP_PLATE);
}

export async function setPlate(page, on) {
  if (!APP_PLATE) return;
  await page.evaluate(({ cls, want }) => document.documentElement.classList.toggle(cls, want), { cls: APP_PLATE, want: !!on });
  await frames(page);
}

/**
 * A full-page PNG, except on /_ds: the specimen is 77,000px tall at 1440, and
 * a full-page capture that tall comes back with unpainted (black) tiles in
 * different places on two runs of the same tree (measured: 271,697 and
 * 297,822 px). /_ds gets its first screen only; styles.mjs proves the rest of
 * it element by element instead.
 */
export async function fullShot(page, file) {
  ensureDir(path.dirname(file));
  if (new URL(page.url()).pathname === '/_ds') {
    await page.screenshot({ path: file, timeout: 30_000 });
    return 'viewport';
  }
  try {
    await page.screenshot({ path: file, fullPage: true, timeout: 30_000 });
    return 'full';
  } catch {
    await page.screenshot({ path: file, timeout: 30_000 }).catch(() => null);
    return 'viewport';
  }
}

export { REPO as ROOT };
