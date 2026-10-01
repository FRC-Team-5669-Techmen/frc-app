#!/usr/bin/env node
/**
 * The standing feature end-to-end specs (npm run test:features).
 *
 *   npm run test:features
 *   node tools/e2e/features.mjs --only feedback          # one feature (comma list allowed)
 *   node tools/e2e/features.mjs --port 5412             # another port (or FIXTURE_PORT)
 *   node tools/e2e/features.mjs --verbose               # every PASS line, not only FAILs
 *   node tools/e2e/features.mjs --keep-server           # leave a booted server running
 *
 * WHY THIS EXISTS. Every lane that shipped a screen on 2026-10-01 verified it
 * with a scratch harness and then deleted the harness, so its numbers were a
 * claim about the past the moment the session ended (CLAUDE.md, "A
 * measurement that cannot be repeated is a claim about the past"). This file
 * turns each lane's browser expectations into a committed spec that runs the
 * REAL app, every real route and component, against fixture mode
 * (src/dev/fixture/, `vite --mode fixture`): an in-memory Supabase seeded with
 * fictional people, no credential, no network, from a clean checkout.
 *
 * HOW IT RUNS. Boots `vite --mode fixture` through tools/e2e/lib.mjs (or
 * reuses a fixture server already serving THIS checkout on the port), launches
 * the container's Chromium, and for every spec module in tools/e2e/features/
 * runs it twice: at 375x812 (touch, `isMobile`, an Android Chrome user agent)
 * and at 1440x900, each in a fresh browser context in America/Los_Angeles
 * whose clock is Playwright's, installed at a fixed Thursday afternoon (the
 * same instant tools/e2e/checkin.mjs uses, the shop open). A spec drives both
 * migration states where its feature has a migration (`mig:all` and the
 * feature's number left out) and the personas its gate cares about.
 *
 * WHAT IT PRINTS. One line per assertion, PASS or FAIL with its measurement
 * (FAIL lines always; PASS lines with --verbose), one summary line per
 * feature, `<feature>: N/N passed (375 and 1440)`, and a final line,
 * `features e2e: N/N passed (375 and 1440)`. Exits non-zero on any failure.
 * Screenshots of every state go to artifacts/e2e/features/<feature>-<width>-
 * <state>.png and every result to artifacts/e2e/features/results.json
 * (artifacts/ is gitignored).
 *
 * THE RULES EVERY SPEC FOLLOWS (tools/e2e/features/README.md has the long
 * form): every absence is asserted against a presence on the same fixture
 * (`0 of N name buttons for a student, against N of N for a mentor`); text is
 * read with textContent, never innerText (CSS uppercases labels here); a
 * number that depends on what the seeds add up to is computed from the store
 * (`__fx.rows`) as an oracle rather than copied from a lane's claim, because
 * several lanes' seeds land on the same personas; and every run ends with 0
 * unexpected console errors per context.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, VIEWPORTS, flag, startFixtureServer, launchBrowser, newContext, watchConsole, ensureDir, waitForFixture } from './lib.mjs';
import { CLOCK_START } from './features/_util.mjs';

const args = process.argv.slice(2);
const PORT = Number(flag(args, 'port', process.env.FIXTURE_PORT || 5401));
const VERBOSE = !!flag(args, 'verbose', false);
const OUT = ensureDir(path.join(REPO, 'artifacts', 'e2e', 'features'));

// The specs, in run order. Each is tools/e2e/features/<name>.mjs.
const FEATURES = Object.freeze([
  'certifications',
  'feedback',
  'announce',
  'permissions',
  'display-history',
  'my-hours',
  'dashboard-checkout',
]);


const results = [];

/**
 * Installed before any page script runs, on every page a spec opens.
 *
 * - The clipboard is captured into window.__e2e.clip, so a copy button's text
 *   can be asserted without a permission prompt headless Chromium cannot
 *   answer.
 * - window.__fx is trapped as the fixture client assigns it, and its supabase
 *   object -- THE SAME OBJECT the app imports from src/supabase.js -- is
 *   wrapped so every insert payload is recorded (window.__e2e.inserts) and an
 *   Edge Function can be stubbed by name for one page (window.__e2e.invokes
 *   records every call either way). Nothing else about the client changes.
 */
function pageInit(stubs) {
  const e2e = { clip: [], inserts: [], invokes: [], stubs: stubs || {} };
  window.__e2e = e2e;
  try {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => { e2e.clip.push(String(text)); },
        readText: async () => e2e.clip[e2e.clip.length - 1] ?? '',
      },
    });
  } catch { /* leave the real clipboard */ }

  const STUB_MODES = {
    // What supabase-js answers when the function does not exist or cannot be
    // reached: a FunctionsFetchError, never a response.
    fetch_error: () => ({ data: null, error: { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' } }),
    // The deployed announce function with a secret missing (it names the
    // secret, never a value).
    announce_needs_setup: (body) => (body?.action === 'status'
      ? { data: { ok: true, action: 'status', ready: false, missing: ['DISCORD_BOT_TOKEN'] }, error: null }
      : { data: { ok: false, error: 'not stubbed' }, error: null }),
    // The deployed announce function with every secret set.
    announce_ready: (body) => {
      if (body?.action === 'status') return { data: { ok: true, ready: true, missing: [] }, error: null };
      if (body?.action === 'send') return { data: { ok: true, channel: body?.draft?.channel ?? 'announcements', message_id: '100000000000009999', warnings: [] }, error: null };
      return { data: { ok: false, error: 'not stubbed' }, error: null };
    },
  };

  let fx;
  const wrap = (v) => {
    const sb = v && v.supabase;
    if (!sb || sb.__e2eWrapped) return;
    sb.__e2eWrapped = true;
    const from = sb.from;
    sb.from = (table) => {
      const q = from(table);
      const insert = q && q.insert;
      if (typeof insert === 'function') {
        q.insert = function wrappedInsert(payload, opts) {
          try { e2e.inserts.push({ table, at: Date.now(), payload: JSON.parse(JSON.stringify(payload)) }); } catch { /* unserialisable: skip */ }
          return insert.call(this, payload, opts);
        };
      }
      return q;
    };
    const invoke = sb.functions && sb.functions.invoke;
    if (typeof invoke === 'function') {
      sb.functions.invoke = async (name, opts = {}) => {
        let body = opts.body;
        try { body = JSON.parse(JSON.stringify(body)); } catch { /* keep */ }
        e2e.invokes.push({ name, body });
        const mode = e2e.stubs[name];
        if (mode && STUB_MODES[mode]) return STUB_MODES[mode](body);
        return invoke(name, opts);
      };
    }
  };
  Object.defineProperty(window, '__fx', {
    configurable: true,
    get() { return fx; },
    set(v) { fx = v; try { wrap(v); } catch { /* never break the page */ } },
  });
}

class Harness {
  constructor({ browser, origin, vp, feature }) {
    this.browser = browser;
    this.origin = origin;
    this.vp = vp;
    this.width = vp.name;
    this.isPhone = !!vp.hasTouch;
    this.feature = feature;
    this.state = '';
    this.page = null;
    this.consoleErrors = [];
    this.expectedConsole = [];
  }

  async init() {
    const { context, blocked } = await newContext(this.browser, this.vp);
    this.context = context;
    this.blocked = blocked;
    await context.clock.install({ time: CLOCK_START });
    await this.newPage();
  }

  /** A fresh page in the same context (the store in localStorage carries over). */
  async newPage({ stubs = {} } = {}) {
    if (this.page) await this.page.close().catch(() => {});
    const page = await this.context.newPage();
    await page.addInitScript(pageInit, stubs);
    const errs = watchConsole(page);
    this.consoleErrors.push(errs);
    this.page = page;
    return page;
  }

  async close() {
    await this.context.close().catch(() => {});
  }

  /** Name the state the next checks belong to (printed with each line). */
  as(state) {
    this.state = state;
    return this;
  }

  /**
   * Open a route under fixture controls. `persona`, `mig` and `reset` become
   * the ?__fx= parameter (src/dev/fixture/README.md, "Controls").
   */
  async open(route, { persona, mig, reset = false, ready = null, settle = true } = {}) {
    const ctl = [persona && `persona:${persona}`, mig && `mig:${mig}`, reset && 'reset'].filter(Boolean).join(',');
    const sep = route.includes('?') ? '&' : '?';
    await this.page.goto(this.origin + route + (ctl ? `${sep}__fx=${ctl}` : ''));
    await waitForFixture(this.page);
    if (ready) await this.waitFor(ready);
    if (settle) await this.settle();
  }

  /**
   * Wait until the app stops asking the fixture for things: the call log has
   * not grown for 400 ms (the fixture answers after 25 ms). A page that polls
   * (the presence board, every 15 s) settles between polls.
   */
  async settle({ quietMs = 400, timeoutMs = 15_000 } = {}) {
    const t0 = Date.now();
    let last = -1;
    let stableSince = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const n = await this.page.evaluate(() => (window.__fx ? window.__fx.calls.length : -1)).catch(() => -1);
      if (n !== last) { last = n; stableSince = Date.now(); }
      else if (Date.now() - stableSince >= quietMs) return;
      await this.page.waitForTimeout(100);
    }
  }

  async waitFor(selector, { state = 'attached', timeout = 15_000 } = {}) {
    if (typeof selector === 'function') {
      await this.page.waitForFunction(selector, null, { timeout });
    } else {
      await this.page.waitForSelector(selector, { state, timeout });
    }
  }

  /** Wait until the page's textContent includes `needle`. Throws a readable error. */
  async waitText(needle, timeout = 15_000) {
    try {
      await this.page.waitForFunction((n) => (document.body.textContent || '').includes(n), needle, { timeout });
    } catch {
      const t = (await this.page.evaluate(() => document.body.textContent || '')).replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(`expected "${needle}" on ${new URL(this.page.url()).pathname}; page reads: ${t}`);
    }
  }

  // ── reading the page ─────────────────────────────────────────────────────
  count(selector) {
    return this.page.locator(selector).count();
  }
  /** Elements that are rendered with a box (display, visibility and every ancestor's opacity). */
  visibleCount(selector) {
    return this.page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
      }
      return true;
    }).length, selector);
  }
  /** textContent of the first match, whitespace-collapsed, or null. */
  text(selector) {
    return this.page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : null;
    }, selector);
  }
  texts(selector) {
    return this.page.evaluate((sel) => [...document.querySelectorAll(sel)]
      .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()), selector);
  }
  bodyText() {
    return this.page.evaluate(() => (document.body.textContent || '').replace(/\s+/g, ' '));
  }
  rows(table) {
    return this.page.evaluate((t) => window.__fx.rows(t), table);
  }
  calls() {
    return this.page.evaluate(() => window.__fx.calls.map((c) => ({ ...c })));
  }
  e2e() {
    return this.page.evaluate(() => JSON.parse(JSON.stringify(window.__e2e)));
  }
  evaluate(fn, arg) {
    return this.page.evaluate(fn, arg);
  }

  /** Tap on the phone, click on the laptop. */
  async press(target) {
    const loc = typeof target === 'string' ? this.page.locator(target).first() : target;
    if (this.isPhone) await loc.tap();
    else await loc.click();
  }

  // ── assertions ───────────────────────────────────────────────────────────
  check(label, ok, measurement = '') {
    const r = { feature: this.feature, vp: this.width, state: this.state, label, ok: !!ok, measurement: String(measurement ?? '') };
    results.push(r);
    if (!r.ok || VERBOSE) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.vp}] ${r.feature} · ${r.state} · ${label}${r.measurement ? ` -- ${r.measurement}` : ''}`);
    }
    return r.ok;
  }

  /** Equality with both values in the measurement. */
  eq(label, actual, expected) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    return this.check(label, a === e, a === e ? a : `got ${a}, expected ${e}`);
  }

  /** Run a block; a throw inside it is one FAIL with the message, never a crash of the run. */
  async step(label, fn) {
    try {
      await fn();
    } catch (e) {
      this.check(label, false, `threw: ${e?.message?.split('\n')[0] ?? e}`);
      await this.shot(`${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-THREW`);
    }
  }

  /** No horizontal page scroll (documentElement.scrollWidth against the viewport). */
  async noHScroll(label = 'no horizontal page scroll') {
    const m = await this.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, iw: window.innerWidth }));
    return this.check(label, m.sw <= m.cw, `scrollWidth ${m.sw}, clientWidth ${m.cw}`);
  }

  /**
   * Every VISIBLE match at least `min` px tall, at the phone width (or at
   * every width with `everyWidth`). Reports the count and the smallest.
   */
  async tapTargets(selector, label, { min = 44, everyWidth = false } = {}) {
    if (!this.isPhone && !everyWidth) return true;
    const sizes = await this.page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const shown = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
      return shown ? { h: Math.round(r.height * 10) / 10, name: (el.textContent || el.getAttribute('aria-label') || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 30) } : null;
    }).filter(Boolean), selector);
    const coarse = await this.page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    const small = sizes.filter((s) => s.h < min);
    const minH = sizes.length ? Math.min(...sizes.map((s) => s.h)) : null;
    // On the phone a fine pointer means the emulation was lost (see shot()),
    // and a size measured then is the desktop size: never a pass.
    return this.check(label, sizes.length > 0 && small.length === 0 && (!this.isPhone || coarse),
      sizes.length === 0 ? `no visible ${selector}` : `${sizes.length} visible, smallest ${minH}px, pointer ${coarse ? 'coarse' : 'fine'}${small.length ? `; under ${min}px: ${small.slice(0, 4).map((s) => `"${s.name}" ${s.h}px`).join(', ')}` : ''}`);
  }

  /**
   * A full-page screenshot, and then the phone put back.
   *
   * MEASURED HERE (playwright-core 1.62.1, Chromium 141): a fullPage
   * screenshot of a touch-emulated page DROPS the touch emulation for the
   * rest of that page's life -- before it, `(pointer: coarse)` matches and
   * navigator.maxTouchPoints is 1; after it, `(pointer: fine)` and 0, across
   * reloads. Every later check on that page then measures the DESKTOP layout
   * of a `@media (pointer: coarse)` rule (the schedule's 44px buttons read
   * 25px). So on the phone viewport touch emulation is re-enabled through CDP
   * after every full-page shot, and the tap-target check prints which
   * pointer it saw. A viewport-only shot (`full: false`) leaves it alone.
   */
  async shot(name, { full = true } = {}) {
    const file = path.join(OUT, `${this.feature}-${this.width}-${name}.png`);
    if (!full) {
      // A dialog is fixed to the viewport; a full-page capture of one shows the
      // page under it past the first screen, which is not what anyone sees.
      await this.page.screenshot({ path: file }).catch(() => {});
      return file;
    }
    await this.page.screenshot({ path: file, fullPage: true }).catch(async () => {
      await this.page.screenshot({ path: file }).catch(() => {});
    });
    if (this.isPhone) await this.restoreTouch();
    return file;
  }

  // One CDP session per page, kept open: an Emulation override lives only as
  // long as the session that set it (measured: set and detach, and the page
  // reads (pointer: fine) again).
  async restoreTouch() {
    if (!this.cdp || this.cdpPage !== this.page) {
      this.cdp = await this.context.newCDPSession(this.page);
      this.cdpPage = this.page;
    }
    await this.cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  }

  /** 0 unexpected console errors across every page this context opened. */
  consoleCheck() {
    const all = this.consoleErrors.flat();
    const unexpected = all.filter((e) => !this.expectedConsole.some((re) => re.test(e.text)));
    this.state = 'whole run';
    return this.check('0 unexpected console errors', unexpected.length === 0,
      unexpected.length ? unexpected.slice(0, 4).map((e) => `${e.type}: ${e.text.slice(0, 160)} @ ${new URL(e.url || 'http://x/').pathname}`).join(' | ')
        : `0 errors (${all.length - unexpected.length} expected), ${this.blocked.length} external request(s) blocked`);
  }
}

async function main() {
  const only = flag(args, 'only', null);
  const wanted = typeof only === 'string' ? only.split(',').map((s) => s.trim()).filter(Boolean) : FEATURES;
  const unknown = wanted.filter((w) => !FEATURES.includes(w));
  if (unknown.length) throw new Error(`unknown feature(s): ${unknown.join(', ')}. Known: ${FEATURES.join(', ')}`);

  const specs = [];
  for (const name of wanted) {
    const mod = await import(pathToFileURL(path.join(REPO, 'tools', 'e2e', 'features', `${name}.mjs`)).href);
    specs.push({ name, run: mod.default?.run ?? mod.run });
  }

  const server = await startFixtureServer({ port: PORT, quiet: !VERBOSE });
  const browser = await launchBrowser();
  try {
    for (const spec of specs) {
      for (const vp of [VIEWPORTS[375], VIEWPORTS[1440]]) {
        const t = new Harness({ browser, origin: server.origin, vp, feature: spec.name });
        await t.init();
        try {
          await spec.run(t);
        } catch (e) {
          t.check('spec ran to the end', false, `threw: ${e?.stack?.split('\n').slice(0, 3).join(' | ') ?? e}`);
          await t.shot('CRASH');
        }
        t.consoleCheck();
        await t.close();
      }
      const mine = results.filter((r) => r.feature === spec.name);
      const ok = mine.filter((r) => r.ok).length;
      console.log(`${spec.name}: ${ok}/${mine.length} passed (375 and 1440)`);
    }
  } finally {
    await browser.close();
    if (!flag(args, 'keep-server', false)) await server.stop();
  }

  writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ clockStart: CLOCK_START.toISOString(), features: wanted, results }, null, 2));
  const passed = results.filter((r) => r.ok).length;
  console.log(`features e2e: ${passed}/${results.length} passed (375 and 1440)`);
  process.exit(passed === results.length && results.length > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  console.log(`features e2e: ${results.filter((r) => r.ok).length}/${results.length || 1} passed (375 and 1440)`);
  process.exit(1);
});
