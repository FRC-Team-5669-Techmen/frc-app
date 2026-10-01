#!/usr/bin/env node
/**
 * The standing check-in / check-out end-to-end test (npm run test:checkin).
 *
 *   node tools/e2e/checkin.mjs [--port 5401] [--keep-server] [--verbose]
 *
 * Boots `vite --mode fixture` (or reuses a fixture server already on the
 * port), launches the container's Chromium in America/Los_Angeles, and at two
 * viewports -- 375x812 (a touch phone with a phone user agent) and 1440x900 --
 * walks the real /checkin, /checkin-volunteer and dashboard Check Out paths
 * from a freshly reset fixture store, asserting both what the screen says and
 * what was written to the store.
 *
 * A TAG TAP IS A NEW TAB. An NFC tag hands the phone's browser a URL, and the
 * browser opens it as a fresh navigation with no history state (Chrome on
 * Android, Safari on iOS). That is what the tag routes key on: a history entry
 * that already carries their marker is a page shown AGAIN (a back gesture, a
 * reload, a restored tab), which must never write on its own, because the
 * silent write on re-show WAS the 2026-09-08 check-out bug. The first version
 * of this file tapped by page.goto() in the same tab; Chromium turns a
 * same-URL navigation into a reload that KEEPS history.state, so every repeat
 * "tap" was a revisit and the run read 8/24 against a correct app. Fresh taps
 * now open a new tab in the same context (localStorage, which holds the
 * fixture store and the device's last-tap record, is shared across a
 * context's tabs exactly as on a phone; sessionStorage is per tab), and the
 * revisit paths are pinned by their own R and V steps, the same-tab repeat
 * included (R7), so neither model can change silently.
 *
 * Every "writes nothing" assertion is paired with a positive control: the same
 * page, on the same fixture, writing when the condition is lifted. A check
 * that can only ever observe zero writes would pass against a page that has
 * stopped writing altogether.
 *
 * Time is Playwright's fake clock, installed at a fixed Thursday afternoon in
 * LA and fast-forwarded past the 60 s duplicate-tap window between taps, so
 * the run takes seconds of real time rather than minutes and never depends on
 * when it is run. The clock is the context's, shared by every tab.
 *
 * Prints exactly one summary line, `checkin e2e: N/N passed (375 and 1440)`,
 * and exits non-zero on any failure. Screenshots go to artifacts/e2e/.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  REPO, VIEWPORTS, flag, startFixtureServer, launchBrowser, newContext, watchContextConsole,
  setTabVisibility, ensureDir, waitForFixture,
} from './lib.mjs';

const args = process.argv.slice(2);
const PORT = Number(flag(args, 'port', process.env.FIXTURE_PORT || 5401));
const VERBOSE = !!flag(args, 'verbose', false);
// --only M runs just the midnight presence step (its own context per width).
const ONLY = flag(args, 'only', null);
const OUT = ensureDir(path.join(REPO, 'artifacts', 'e2e'));

// Fixture personas (src/dev/fixture/personas.js).
const STUDENT = '00000000-0000-0000-0000-0000000000c1';
const EXEMPT = '00000000-0000-0000-0000-0000000000c3';
const MENTOR = '00000000-0000-0000-0000-0000000000b1';

// Geofence centres from src/geo.js. 0.018 deg of latitude is about 2.0 km.
const SHOP = { latitude: 34.04155, longitude: -118.086826, accuracy: 10 };
const FAR = { latitude: 34.04155 + 0.018, longitude: -118.086826, accuracy: 10 };
const FLL = { latitude: 34.042134, longitude: -118.086326, accuracy: 10 };

const SHOP_TAG = '/checkin?loc=shop-main';
const FLL_TAG = '/checkin-volunteer?loc=fll-room';

// A weekday afternoon in LA (Thursday 2026-10-01, 4:00 PM PDT): the shop is open.
const CLOCK_START = new Date('2026-10-01T16:00:00-07:00');
const PAST_DUPLICATE_WINDOW = 61_000;
// How long a tab sits in the background in R3/R5/R6: past the 60 s re-read
// threshold the tag routes use, the same minute as everywhere else.
const AWAY = 120_000;
// Real milliseconds to wait after a screen settles before counting rows, so a
// second write (StrictMode runs every effect twice in dev) has time to land.
const SETTLE_MS = 400;

// The fixture's persisted store (src/dev/fixture/client.js KEYS.db). Rows are
// read from it rather than from one tab's in-memory copy: it is what every tab
// writes through, so it is the database as a later tab would find it.
const STORE_KEY = '__fx_db';

// Console errors this run expects and names, never a blanket pattern. Empty:
// the check-in paths log nothing on the happy path or on a geofence refusal.
const EXPECTED_CONSOLE = [];

const results = [];
const log = (...m) => { if (VERBOSE) console.log(...m); };

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

// 4:02 PM, as the tag routes print a time.
const clockLA = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' });

async function main() {
  const server = await startFixtureServer({ port: PORT, quiet: !VERBOSE });
  const browser = await launchBrowser();
  try {
    for (const vp of [VIEWPORTS[375], VIEWPORTS[1440]]) {
      if (ONLY !== 'M') await runViewport(browser, server.origin, vp);
      await runMidnight(browser, server.origin, vp);
    }
  } finally {
    await browser.close();
    if (!flag(args, 'keep-server', false)) await server.stop();
  }

  const passed = results.filter((r) => r.ok).length;
  writeFileSync(path.join(OUT, 'checkin-results.json'), JSON.stringify({ clockStart: CLOCK_START.toISOString(), results }, null, 2));
  for (const r of results) {
    if (!r.ok || VERBOSE) console.log(`${r.ok ? 'PASS' : 'FAIL'} [${r.vp}] ${r.id} ${r.name}${r.ok ? '' : `\n     ${r.detail}`}`);
  }
  console.log(`checkin e2e: ${passed}/${results.length} passed (375 and 1440)`);
  process.exit(passed === results.length && results.length > 0 ? 0 : 1);
}

async function runViewport(browser, origin, vp) {
  const { context, blocked } = await newContext(browser, vp, { geolocation: SHOP, permissions: ['geolocation'] });
  await context.clock.install({ time: CLOCK_START });
  const consoleErrors = watchContextConsole(context);
  // R9's hook: answers for the claim_profile calls a tab makes while it BOOTS,
  // queued the moment the fixture client publishes window.__fx (before App's
  // first effect runs). __fx.failNext cannot reach them from outside, because
  // the tab does not exist yet. Armed by a one-shot localStorage key that the
  // first tab to boot consumes, so every other tab boots untouched.
  await context.addInitScript(() => {
    let plan = null;
    try {
      plan = JSON.parse(localStorage.getItem('__e2e_boot_claims') || 'null');
      if (plan) localStorage.removeItem('__e2e_boot_claims');
    } catch { /* storage unavailable: boot untouched */ }
    if (!Array.isArray(plan)) return;
    let fx;
    Object.defineProperty(window, '__fx', {
      configurable: true,
      get() { return fx; },
      set(v) { fx = v; for (const answer of plan) v.failNext('claim_profile', answer); },
    });
  });

  // ── tabs ─────────────────────────────────────────────────────────────────
  // `page` is the tab in front: what the student is looking at, and what every
  // helper below reads. A fresh tap closes the earlier tabs unless a step keeps
  // one on purpose (R6). A real phone leaves them in the background, but this
  // headless Chromium cannot hide a tab (lib.mjs setTabVisibility says what was
  // measured), so a tab left open would sit "in front" for the rest of the
  // run, which is the one state a real background tab never is.
  let page = null;
  const tabs = new Set();
  // The new tab is opened BEFORE the earlier ones close, as on a phone, and
  // for a measured reason: Chromium can drop a localStorage write made just
  // before its tab closes (the fixture store lives there), and the next tab
  // then boots from the copy before it. Closing the writer first lost the
  // write 1 time in 60; opening the next tab first, 0 in 60.
  async function newTab(url, { keep = [] } = {}) {
    const earlier = [...tabs].filter((t) => !keep.includes(t));
    const t = await context.newPage();
    tabs.add(t);
    page = t;
    await t.goto(origin + url);
    await waitForFixture(t);
    for (const old of earlier) {
      tabs.delete(old);
      await old.close().catch(() => {});
    }
    return t;
  }
  // The same tab, a new navigation: what a browser that REUSES the tab for a
  // repeat tag tap does, and how the signed-out bounce stays in one tab.
  const sameTab = async (url) => {
    await page.goto(origin + url);
    await waitForFixture(page);
  };

  // Location permission through CDP, scoped to THIS context, on a browser-level
  // session so it outlives the tabs. Measured here: context.clearPermissions()
  // leaves the next request pending forever (a prompt nobody can answer in
  // headless Chromium, and every later request then times out), and
  // Browser.setPermission without the context id lands on the default context
  // and changes nothing. 'denied' is what a student who tapped Block gets: an
  // immediate PERMISSION_DENIED.
  await newTab('/_fixture?__fx=persona:student,mig:all,reset');
  const pageCdp = await context.newCDPSession(page);
  const { targetInfo } = await pageCdp.send('Target.getTargetInfo');
  await pageCdp.detach();
  const cdp = await browser.newBrowserCDPSession();
  const setGeoPermission = (setting) => cdp.send('Browser.setPermission', {
    permission: { name: 'geolocation' }, setting, origin, browserContextId: targetInfo.browserContextId,
  });

  // A fullPage screenshot of a touch-emulated page DROPS the emulation for
  // the rest of that page (measured, playwright-core 1.62.1 / Chromium 141:
  // (pointer: coarse) and maxTouchPoints 1 before it, fine and 0 after, across
  // reloads), so a later 375 step on the same tab would tap the desktop
  // layout. After every shot touch is put back through a CDP session kept
  // open per page (an Emulation override lives only as long as the session
  // that set it) and the pointer is read again; touchShots is reported as
  // z-touch at the end of the viewport.
  const touchCdp = new WeakMap();
  const touchShots = [];
  const shot = async (name, tab = page) => {
    await tab.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`), fullPage: true }).catch(() => {});
    if (!vp.hasTouch || tab.isClosed()) return;
    try {
      const dropped = !(await tab.evaluate(() => matchMedia('(pointer: coarse)').matches));
      let session = touchCdp.get(tab);
      if (!session) { session = await context.newCDPSession(tab); touchCdp.set(tab, session); }
      await session.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
      const after = await tab.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, points: navigator.maxTouchPoints }));
      touchShots.push({ name, dropped, ...after });
    } catch (e) {
      touchShots.push({ name, dropped: null, coarse: false, points: null, error: e.message });
    }
  };
  const press = async (locator) => (vp.hasTouch ? locator.tap() : locator.click());

  // ── helpers bound to the tab in front ────────────────────────────────────
  const events = (uid) => page.evaluate(({ id, key }) => {
    let db = {};
    try { db = JSON.parse(localStorage.getItem(key) || '{}'); } catch { /* read below as empty */ }
    return (db.attendance_events ?? []).filter((e) => e.user_id === id).sort((a, b) => a.event_time.localeCompare(b.event_time));
  }, { id: uid, key: STORE_KEY });
  const count = async (uid) => (await events(uid)).length;
  const text = (tab = page) => tab.evaluate(() => document.body.textContent || '');
  const waitText = async (needle, { tab = page, timeout = 15_000 } = {}) => {
    try {
      await tab.waitForFunction((n) => (document.body.textContent || '').includes(n), needle, { timeout });
    } catch {
      const t = (await text(tab)).replace(/\s+/g, ' ').slice(0, 300);
      throw new Error(`expected "${needle}" on ${new URL(tab.url()).pathname}; page reads: ${t}`);
    }
  };
  const settle = () => page.waitForTimeout(SETTLE_MS);
  const tick = () => context.clock.fastForward(PAST_DUPLICATE_WINDOW);
  const confirmButton = (tab = page) => tab.locator('button', { hasText: 'Confirm check-in' });
  const checkOutButton = (tab = page) => tab.locator('button', { hasText: /^Check out$/ });
  const lastType = async (uid) => (await events(uid)).at(-1)?.type ?? null;
  // The attendance_events reads a tab has made: proof that a re-read ran, so a
  // receipt that "stayed up" did so because it still held, not because the
  // tab never looked again.
  const reads = (tab) => tab.evaluate(() => window.__fx.calls.filter((c) => c.kind === 'select' && c.table === 'attendance_events').length);
  // Two minutes in the background, then back in front (lib.mjs setTabVisibility).
  const away = async (tab) => {
    await setTabVisibility(tab, 'hidden');
    await context.clock.fastForward(AWAY);
    await setTabVisibility(tab, 'visible');
  };
  // Leave the student checked OUT before a step that needs it, through a real
  // fresh tap, and say so if the store disagrees afterwards.
  const ensureOut = async (uid) => {
    if ((await lastType(uid)) !== 'in') return;
    await tick();
    await newTab(SHOP_TAG);
    await waitText('CHECKED OUT');
    assert((await lastType(uid)) === 'out', 'could not leave the student checked out before the step');
  };
  // A fresh shop-tag check-in, confirmed: the receipt every R step starts from.
  const checkInByTag = async () => {
    await tick();
    const t = await newTab(SHOP_TAG);
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('CHECKED IN');
    return t;
  };

  async function step(id, name, fn) {
    const t0 = Date.now();
    try {
      const detail = await fn();
      results.push({ vp: vp.name, id, name, ok: true, detail: detail ?? null, ms: Date.now() - t0 });
      await shot(id);
      log(`  ok   [${vp.name}] ${id} ${detail ?? ''}`);
    } catch (e) {
      results.push({ vp: vp.name, id, name, ok: false, detail: e.message, url: page?.url() ?? null, ms: Date.now() - t0 });
      await shot(`${id}-FAIL`);
      log(`  FAIL [${vp.name}] ${id} ${e.message}`);
    }
  }

  // ── setup: a freshly reseeded store, signed in as the student ────────────
  // The test owns its starting state. A feature fixture may legitimately give
  // the student a session (the contract lets a plugin append rows for any
  // persona: the check-out lane seeds Sam checked in 2h45m ago), so today's
  // attendance for the two personas this test drives is cleared here, after
  // the reset and before the first step, rather than assumed absent. Today
  // (LA) is exactly what /checkin reads; anything older is at least 16 h old
  // at the 4 PM clock, past the 10 h session cap, so it cannot read as in.
  const todayStart = new Date('2026-10-01T00:00:00-07:00').toISOString();
  const cleared = await page.evaluate(({ ids, since }) => {
    const db = window.__fx.db;
    const before = db.attendance_events.length;
    db.attendance_events = db.attendance_events.filter((e) => !(ids.includes(e.user_id) && Date.parse(e.event_time) >= since));
    window.__fx.save();
    return before - db.attendance_events.length;
  }, { ids: [STUDENT, EXEMPT], since: Date.parse(todayStart) });
  log(`  setup: cleared ${cleared} attendance event(s) from today for the test personas`);
  const seeded = await events(STUDENT);
  assert(!seeded.some((e) => e.event_time >= todayStart), 'the student still has a check-in today after setup; the test needs a clean day');

  // a. NFC check-in at the shop.
  await step('a-nfc-checkin', 'NFC check-in at the shop writes one build IN with geo_ok true', async () => {
    const before = await count(STUDENT);
    await newTab(SHOP_TAG);
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('CHECKED IN');
    await settle();
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1, `expected exactly 1 new event, got ${added.length}`);
    const e = added[0];
    assert(e.type === 'in' && e.category === 'build' && e.geo_ok === true, `new event is ${JSON.stringify({ type: e.type, category: e.category, geo_ok: e.geo_ok })}`);
    assert(e.location === 'shop-main' && e.method === 'nfc', `location/method ${e.location}/${e.method}`);
    return `1 IN, category ${e.category}, geo_ok ${e.geo_ok}`;
  });

  // b. Dashboard Check Out.
  await step('b-dashboard-checkout', 'dashboard reads Checked in, Check Out flips it and writes an OUT', async () => {
    await tick();
    await newTab('/dashboard');
    await page.waitForSelector('.mb-status', { timeout: 15_000 });
    const status = (await page.locator('.mb-status').textContent())?.trim();
    assert(status === 'Checked in', `status tile reads "${status}" before Check Out`);
    const btn = page.locator('button.mb-checkout', { hasText: 'Check Out' });
    assert((await btn.count()) === 1, 'no Check Out button while checked in');
    const before = await count(STUDENT);
    await press(btn);
    await page.waitForFunction(() => document.querySelector('.mb-status')?.textContent?.trim() === 'Not checked in', null, { timeout: 15_000 })
      .catch(async () => { throw new Error(`tile still reads "${(await page.locator('.mb-status').textContent())?.trim()}" after Check Out`); });
    await settle();
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'out', `expected 1 new OUT, got ${JSON.stringify(added.map((e) => e.type))}`);
    assert((await page.locator('button.mb-checkout').count()) === 0, 'Check Out button still shown after checking out');
    return `tile Checked in -> Not checked in, 1 OUT (location ${added[0].location})`;
  });

  // c. In, out, in, out on the same day: the open check-out bug report.
  await step('c1-nfc-checkin-again', 'a second NFC check-in the same day succeeds', async () => {
    await tick();
    const before = await count(STUDENT);
    await newTab(SHOP_TAG);
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('CHECKED IN');
    await settle();
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'in', `expected 1 new IN, got ${JSON.stringify(added.map((e) => e.type))}`);
    return '1 IN (third event today)';
  });
  let checkoutWrites = null;
  await step('c2-nfc-checkout', 'the next NFC tap checks OUT (not back to the check-in screen)', async () => {
    await tick();
    const before = await count(STUDENT);
    await newTab(SHOP_TAG);
    await waitText('CHECKED OUT').catch(async (e) => {
      const onConfirm = (await text()).includes('Tap to confirm your check-in');
      throw new Error(onConfirm ? 'NFC tap after an in/out/in day showed the CHECK-IN confirm screen instead of checking out' : e.message);
    });
    await settle();
    const added = (await events(STUDENT)).slice(before);
    checkoutWrites = added.length;
    assert(added.length === 1 && added[0].type === 'out', `expected 1 new OUT, got ${JSON.stringify(added.map((e) => e.type))}`);
    const today = (await events(STUDENT)).filter((e) => e.event_time >= todayStart).map((e) => e.type).join(',');
    assert(today === 'in,out,in,out', `today's sequence is ${today}`);
    return `1 OUT; today reads ${today}`;
  });

  // d. A duplicate tap inside 60 s reads ALREADY and writes nothing. Control:
  //    the same tag wrote 1 event in c2, outside the window.
  await step('d-duplicate-tap', 'a second tap within 60 s reads ALREADY and writes nothing', async () => {
    const before = await count(STUDENT);
    await newTab(SHOP_TAG);
    await waitText('ALREADY OUT');
    await settle();
    const after = await count(STUDENT);
    assert(after === before, `duplicate tap wrote ${after - before} event(s)`);
    assert(checkoutWrites >= 1, `positive control missing: the out-of-window tap (c2) wrote ${checkoutWrites}`);
    return `0 writes inside the window, against ${checkoutWrites} write(s) by the same tag outside it (c2)`;
  });

  // e1. Out of range: refused, nothing written. Control: back in range, writes.
  await step('e1-geofence-range', '2 km away reads Not at the shop and writes nothing; in range it writes', async () => {
    await tick();
    await context.setGeolocation(FAR);
    const before = await count(STUDENT);
    await newTab(SHOP_TAG);
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('Not at the shop');
    const refused = (await count(STUDENT)) - before;
    assert(refused === 0, `out-of-range tap wrote ${refused} event(s)`);
    await shot('e1-geofence-range-refused');
    await context.setGeolocation(SHOP);
    await press(confirmButton());
    await waitText('CHECKED IN');
    await settle();
    const control = (await events(STUDENT)).slice(before);
    assert(control.length === 1 && control[0].type === 'in' && control[0].geo_ok === true, `in-range control wrote ${JSON.stringify(control.map((e) => e.type))}`);
    await ensureOut(STUDENT);
    return `0 writes at 2 km, against 1 IN from the same screen at the shop`;
  });

  // e2. Permission denied: refused, nothing written. Control: granted, writes.
  await step('e2-geofence-denied', 'denied location reads Location denied and writes nothing; granted it writes', async () => {
    await tick();
    await setGeoPermission('denied');
    const before = await count(STUDENT);
    await newTab(SHOP_TAG);
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('Location denied');
    const refused = (await count(STUDENT)) - before;
    assert(refused === 0, `denied tap wrote ${refused} event(s)`);
    await shot('e2-geofence-denied-refused');
    await setGeoPermission('granted');
    await context.setGeolocation(SHOP);
    await press(confirmButton());
    await waitText('CHECKED IN');
    await settle();
    const control = (await events(STUDENT)).slice(before);
    assert(control.length === 1 && control[0].type === 'in', `granted control wrote ${JSON.stringify(control.map((e) => e.type))}`);
    await ensureOut(STUDENT);
    return `0 writes with permission denied, against 1 IN once granted`;
  });

  // e3. A geofence-exempt student checks in with no location at all. Control:
  //     a non-exempt student in the same no-location context is refused.
  await step('e3-exempt-no-location', 'an exempt student checks in with no location; a non-exempt one cannot', async () => {
    await tick();
    await setGeoPermission('denied');
    const studentBefore = await count(STUDENT);
    await newTab(SHOP_TAG);
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('Location denied');
    const studentWrote = (await count(STUDENT)) - studentBefore;
    assert(studentWrote === 0, `non-exempt student wrote ${studentWrote} with no location`);

    await newTab('/_fixture?__fx=persona:exempt');
    const exempt = await page.evaluate((id) => window.__fx.rows('profiles').find((p) => p.id === id)?.geofence_exempt, EXEMPT);
    assert(exempt === true, 'fixture exempt persona is not geofence_exempt');
    const before = await count(EXEMPT);
    await newTab(SHOP_TAG);
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('CHECKED IN');
    await settle();
    const added = (await events(EXEMPT)).slice(before);
    assert(added.length === 1 && added[0].type === 'in' && added[0].geo_ok === false, `exempt check-in wrote ${JSON.stringify(added.map((e) => ({ type: e.type, geo_ok: e.geo_ok })))}`);
    await setGeoPermission('granted');
    await newTab('/_fixture?__fx=persona:student');
    return `exempt: 1 IN with geo_ok false and no location permission; non-exempt in the same context: 0 writes`;
  });

  // f. Volunteer check-in at the FLL room, then check out by tapping again.
  await step('f1-volunteer-checkin', '/checkin-volunteer at the FLL room writes a volunteer IN', async () => {
    await ensureOut(STUDENT);
    await tick();
    await context.setGeolocation(FLL);
    const before = await count(STUDENT);
    await newTab(FLL_TAG);
    await waitText('Tap to confirm volunteer check-in');
    await press(confirmButton());
    await waitText('VOLUNTEER · CHECKED IN');
    await settle();
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'in' && added[0].category === 'volunteer' && added[0].geo_ok === true,
      `volunteer check-in wrote ${JSON.stringify(added.map((e) => ({ type: e.type, category: e.category, geo_ok: e.geo_ok })))}`);
    return '1 IN, category volunteer, geo_ok true';
  });
  await step('f2-volunteer-checkout', 'tapping /checkin-volunteer again later checks out', async () => {
    await tick();
    const before = await count(STUDENT);
    await newTab(FLL_TAG);
    await waitText('VOLUNTEER · CHECKED OUT');
    await settle();
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'out', `expected 1 OUT, got ${JSON.stringify(added.map((e) => e.type))}`);
    await context.setGeolocation(SHOP);
    return '1 OUT';
  });

  // ── R: a page shown AGAIN never writes on its own (lane b2's fix) ─────────
  // Each refusal is paired with the write the member makes on purpose.

  // R1. The reported path: check in, VIEW STATUS to the dashboard, back-swipe.
  await step('R1-back-swipe', 'back from VIEW STATUS onto a check-in receipt asks (0 writes); the tap writes 1 OUT', async () => {
    await ensureOut(STUDENT);
    const before = await count(STUDENT);
    await checkInByTag();
    const inRow = (await events(STUDENT)).slice(before);
    assert(inRow.length === 1 && inRow[0].type === 'in', `check-in wrote ${JSON.stringify(inRow.map((e) => e.type))}`);
    await press(page.locator('a', { hasText: 'VIEW STATUS' }));
    await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 15_000 });
    await page.waitForFunction(() => document.querySelector('.mb-status')?.textContent?.trim() === 'Checked in', null, { timeout: 15_000 });
    await tick();
    const mid = await count(STUDENT);
    await page.goBack();
    await page.waitForURL((u) => u.pathname === '/checkin', { timeout: 15_000 });
    const since = `Checked in since ${clockLA(inRow[0].event_time)}`;
    await waitText(since);
    await settle();
    assert((await count(STUDENT)) === mid, `the back-swipe wrote ${(await count(STUDENT)) - mid} event(s)`);
    assert(!(await text()).includes('CHECKED OUT'), 'the back-swipe checked the student out on its own');
    assert((await checkOutButton().count()) === 1, 'no Check out button on the re-shown page');
    await press(checkOutButton());
    await waitText('CHECKED OUT');
    await settle();
    const added = (await events(STUDENT)).slice(mid);
    assert(added.length === 1 && added[0].type === 'out', `the Check out tap wrote ${JSON.stringify(added.map((e) => e.type))}`);
    return `back-swipe: "${since}" with a Check out button, 0 writes; one tap: 1 OUT`;
  });

  // R2. A reload of a check-in receipt: inside the window it reads ALREADY,
  //     past it it asks; neither writes. Control: a fresh tap then checks out.
  await step('R2-reload-receipt', 'reloading a check-in receipt never writes; a fresh tap from the same state does', async () => {
    await ensureOut(STUDENT);
    await checkInByTag();
    const base = await count(STUDENT);
    await page.reload();
    await waitForFixture(page);
    await waitText('ALREADY IN');
    await settle();
    assert((await count(STUDENT)) === base, `a reload inside the window wrote ${(await count(STUDENT)) - base}`);
    await tick();
    await page.reload();
    await waitForFixture(page);
    await waitText('Checked in since');
    await settle();
    assert((await count(STUDENT)) === base, `a reload past the window wrote ${(await count(STUDENT)) - base}`);
    assert((await checkOutButton().count()) === 1, 'no Check out button after the reload');
    await newTab(SHOP_TAG);
    await waitText('CHECKED OUT');
    await settle();
    const added = (await events(STUDENT)).slice(base);
    assert(added.length === 1 && added[0].type === 'out', `the fresh tap wrote ${JSON.stringify(added.map((e) => e.type))}`);
    return 'reload: ALREADY IN, then "Checked in since", 0 writes; a fresh tap in a new tab: 1 OUT with no confirm';
  });

  // R3. A CHECKED OUT receipt left in the background and brought back stays a
  //     receipt: it never turns into the check-in prompt (the 2026-09-08
  //     report's words). Control: the same tab, after another tab checked the
  //     student IN meanwhile, is replaced by the current status.
  await step('R3-hidden-out-receipt', 'a CHECKED OUT receipt hidden 2 min stays a receipt (0 writes); it updates when another tab checks in', async () => {
    await ensureOut(STUDENT);
    await checkInByTag();
    await tick();
    const a = await newTab(SHOP_TAG);
    await waitText('CHECKED OUT');
    await settle();
    const base = await count(STUDENT);
    const r0 = await reads(a);
    await away(a);
    await a.waitForFunction((n) => window.__fx.calls.filter((c) => c.kind === 'select' && c.table === 'attendance_events').length > n, r0, { timeout: 15_000 })
      .catch(() => { throw new Error('the tab did not re-read when it came back'); });
    await settle();
    const t = await text(a);
    assert(t.includes('CHECKED OUT'), `the receipt was replaced: ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
    assert(!t.includes('Tap to confirm your check-in'), 'a CHECKED OUT receipt turned into the check-in prompt');
    assert((await count(STUDENT)) === base, `the re-read wrote ${(await count(STUDENT)) - base}`);
    const r1 = await reads(a);
    await shot('R3-hidden-out-receipt-held', a);

    // Control: B checks in while A is in the background; A then shows the open
    // session and asks, rather than keeping a receipt that is no longer true.
    await tick();
    const b = await newTab(SHOP_TAG, { keep: [a] });
    await waitText('Tap to confirm your check-in');
    await press(confirmButton(b));
    await waitText('CHECKED IN');
    await settle();
    const withB = await count(STUDENT);
    assert(withB === base + 1, `tab B wrote ${withB - base}, expected 1 IN`);
    await b.close();
    tabs.delete(b);
    page = a;
    await away(a);
    await waitText('Checked in since');
    await settle();
    assert((await count(STUDENT)) === withB, `tab A wrote ${(await count(STUDENT)) - withB} on coming back`);
    await press(checkOutButton());
    await waitText('CHECKED OUT');
    return `held: CHECKED OUT, ${r1 - r0} re-read(s), 0 writes; after another tab checked in: "Checked in since", 0 writes`;
  });

  // R5. The same for a CHECKED IN receipt that still holds.
  await step('R5-hidden-in-receipt', 'a CHECKED IN receipt hidden 2 min stays a receipt, with a re-read and 0 writes', async () => {
    await ensureOut(STUDENT);
    const a = await checkInByTag();
    await settle();
    const base = await count(STUDENT);
    const r0 = await reads(a);
    await away(a);
    await a.waitForFunction((n) => window.__fx.calls.filter((c) => c.kind === 'select' && c.table === 'attendance_events').length > n, r0, { timeout: 15_000 })
      .catch(() => { throw new Error('the tab did not re-read when it came back'); });
    await settle();
    const t = await text(a);
    assert(t.includes('CHECKED IN'), `the receipt was replaced: ${t.replace(/\s+/g, ' ').slice(0, 160)}`);
    assert(!t.includes('Checked in since') && !t.includes('Tap to confirm'), 'a CHECKED IN receipt that still holds turned into a prompt');
    assert((await count(STUDENT)) === base, `the re-read wrote ${(await count(STUDENT)) - base}`);
    return `held: CHECKED IN, ${(await reads(a)) - r0} re-read(s), 0 writes (R6 is the receipt that no longer holds)`;
  });

  // R6. Positive control for R5: page A shows CHECKED IN, a fresh tap in a new
  //     tab B checks out (+1), and A brought back refreshes to the check-in
  //     prompt with nothing written by A.
  await step('R6-receipt-no-longer-holds', 'a CHECKED IN receipt refreshes to the check-in prompt after another tab checked out; A writes nothing', async () => {
    await ensureOut(STUDENT);
    const a = await checkInByTag();
    await settle();
    await tick();
    const before = await count(STUDENT);
    const b = await newTab(SHOP_TAG, { keep: [a] });
    await waitText('CHECKED OUT');
    await settle();
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'out', `the fresh tap in tab B wrote ${JSON.stringify(added.map((e) => e.type))}`);
    const base = await count(STUDENT);
    await b.close();
    tabs.delete(b);
    page = a;
    await away(a);
    await waitText('Tap to confirm your check-in');
    await settle();
    assert(!(await text()).includes('CHECKED IN ·'), 'the stale CHECKED IN receipt is still shown');
    assert((await count(STUDENT)) === base, `tab A wrote ${(await count(STUDENT)) - base} on coming back`);
    return 'tab B: 1 OUT; tab A back after 2 min: "Tap to confirm your check-in", 0 writes';
  });

  // R7. The known cost of the fix, pinned so it cannot change silently: a
  //     browser that REUSES the tab for a repeat tag tap (same URL, same tab)
  //     presents it as a revisit, so check-out takes one tap instead of zero.
  await step('R7-same-tab-repeat-tap', 'the same URL again in the same tab asks (0 writes); one tap writes 1 OUT', async () => {
    await ensureOut(STUDENT);
    await checkInByTag();
    await tick();
    const base = await count(STUDENT);
    await sameTab(SHOP_TAG);
    await waitText('Checked in since');
    await settle();
    assert((await count(STUDENT)) === base, `the same-tab repeat wrote ${(await count(STUDENT)) - base}`);
    assert(!(await text()).includes('CHECKED OUT'), 'the same-tab repeat checked out with no tap; if this is now intended, update R7 and the README');
    await press(checkOutButton());
    await waitText('CHECKED OUT');
    await settle();
    const added = (await events(STUDENT)).slice(base);
    assert(added.length === 1 && added[0].type === 'out', `the Check out tap wrote ${JSON.stringify(added.map((e) => e.type))}`);
    return 'same tab, same URL: "Checked in since" and 0 writes; one tap: 1 OUT';
  });

  // R8. App re-runs claim_profile every time a tab comes back (supabase-js
  //     emits SIGNED_IN on hidden -> visible; the fixture does too). A
  //     transient error on that call must not swap the page for the access
  //     gate under a student about to check out. Control in the same step: a
  //     real "no" from the same call DOES show the gate, so the step can see
  //     it, and the real "yes" after it brings back a page that asks (the
  //     re-mount is a revisit) rather than writing.
  await step('R8-resume-claim-error', 'a claim_profile error as the tab comes back leaves the page up; a real "no" shows the access gate; 0 writes', async () => {
    await ensureOut(STUDENT);
    const a = await checkInByTag();
    await settle();
    const base = await count(STUDENT);
    const claims = () => a.evaluate(() => window.__fx.calls.filter((c) => c.kind === 'rpc' && c.name === 'claim_profile'));
    const nextClaim = async (n) => a.waitForFunction((k) => window.__fx.calls.filter((c) => c.kind === 'rpc' && c.name === 'claim_profile').length > k, n, { timeout: 15_000 })
      .catch(() => { throw new Error('the tab did not re-run claim_profile when it came back'); });

    const c0 = (await claims()).length;
    await a.evaluate(() => window.__fx.failNext('claim_profile', { error: { message: 'TypeError: Failed to fetch', code: '' } }));
    await away(a);
    await nextClaim(c0);
    await settle();
    const answered = (await claims()).slice(c0);
    assert(answered.some((c) => c.injected && c.error), `the injected failure was not what claim_profile answered: ${JSON.stringify(answered)}`);
    assert((await a.locator('.gate-wrap').count()) === 0, 'a transient claim_profile error replaced the page with the access gate');
    assert((await text(a)).includes('CHECKED IN'), 'the check-in receipt is gone after a transient claim_profile error');
    await shot('R8-resume-claim-error-held', a);

    // Control: a real "no" shows the gate ...
    const c1 = (await claims()).length;
    await a.evaluate(() => window.__fx.failNext('claim_profile', { data: false }));
    await away(a);
    await nextClaim(c1);
    await a.waitForSelector('.gate-wrap', { timeout: 15_000 })
      .catch(() => { throw new Error('control: a real "no" from claim_profile did not show the access gate'); });
    await shot('R8-resume-claim-error-gate', a);
    // ... and the real "yes" the store gives brings the app back, asking.
    await away(a);
    await a.waitForFunction(() => !document.querySelector('.gate-wrap'), null, { timeout: 15_000 });
    await waitText('Checked in since');
    await settle();
    assert((await count(STUDENT)) === base, `the gate and the re-mount wrote ${(await count(STUDENT)) - base}`);
    await press(checkOutButton());
    await waitText('CHECKED OUT');
    return 'error on resume: receipt up, no gate; a real "no": the gate; the real "yes": back to "Checked in since", 0 writes throughout';
  });

  // R9. Every boot runs claim_profile twice at once (getSession and
  //     INITIAL_SESSION). A fresh tag tap whose first claim answers yes and
  //     whose second fails must still check the student out: the failure
  //     arrives after the approval is held, so it keeps it. Read before the
  //     call instead, the failure saw nothing held and the access gate
  //     replaced the page (measured on the reviewer's mutant). Control in the
  //     same step: a real "no" first shows the gate and writes nothing.
  await step('R9-boot-claim-race', 'a fresh tap whose second boot claim fails still checks out (1 OUT, no gate); a real "no" first shows the gate (0 writes)', async () => {
    const failed = { error: { message: 'TypeError: Failed to fetch', code: '' } };
    const bootClaims = async (plan) => {
      await page.evaluate((p) => localStorage.setItem('__e2e_boot_claims', JSON.stringify(p)), plan);
      await tick();
      await newTab(SHOP_TAG);
    };
    const answered = () => page.evaluate(() => window.__fx.calls
      .filter((c) => c.kind === 'rpc' && c.name === 'claim_profile')
      .map((c) => `${c.injected ? 'injected ' : ''}${c.error ? 'error' : 'ok'}`));

    await ensureOut(STUDENT);
    await checkInByTag();
    const base = await count(STUDENT);
    await bootClaims([{ data: true }, failed, failed, failed]);
    await waitText('CHECKED OUT').catch(async (e) => {
      throw new Error((await page.locator('.gate-wrap').count()) ? 'a failed boot claim after a yes replaced the tag page with the access gate' : e.message);
    });
    await settle();
    const claims = await answered();
    assert(claims[0] === 'injected ok' && claims.includes('injected error'), `the boot claims answered ${JSON.stringify(claims)}, not a yes followed by a failure`);
    assert((await page.locator('.gate-wrap').count()) === 0, 'the access gate is up after the check-out');
    const added = (await events(STUDENT)).slice(base);
    assert(added.length === 1 && added[0].type === 'out', `the fresh tap wrote ${JSON.stringify(added.map((e) => e.type))}`);

    // Control: the same tap, the student checked in, a real "no" first.
    await checkInByTag();
    const withIn = await count(STUDENT);
    await bootClaims([{ data: false }, failed, failed, failed]);
    await page.waitForSelector('.gate-wrap', { timeout: 15_000 })
      .catch(() => { throw new Error('control: a real "no" at boot did not show the access gate'); });
    await settle();
    assert((await count(STUDENT)) === withIn, `control: the gated tap wrote ${(await count(STUDENT)) - withIn}`);
    await shot('R9-boot-claim-race-gate');
    // Leave the student checked out through an ordinary tap.
    await ensureOut(STUDENT);
    return `boot claims ${claims.join(', ')}: CHECKED OUT, 1 OUT, no gate; a real "no" first: the gate, 0 writes`;
  });

  // R10. The same resume re-reads member_roles. A transient error there used
  //      to set roles to [], so a mentor (no member_applications row: staff
  //      are never asked) was read as the member track and the application
  //      form replaced the dashboard, Check Out and all. Now the roles held
  //      for that member stand (src/claimApproval.js nextRoles). Control in
  //      the same step: a real empty answer DOES show the form, so the step
  //      can see it; the real roles after it bring the dashboard back, and the
  //      mentor checks out with one tap. On /dashboard App.jsx is the only
  //      member_roles reader, so an answer queued here is App's.
  await step('R10-resume-roles-error', 'a checked-in mentor: a member_roles error as the tab comes back keeps the dashboard and Check Out (no form); a real empty answer shows the form; then 1 OUT', async () => {
    const rolesAnswer = (tab, answer) => tab.evaluate((ans) => {
      const sb = window.__fx.supabase;
      if (!sb.__e2eRoles) {
        const from = sb.from;
        sb.__e2eRoles = { queue: [], served: 0 };
        sb.from = (table) => {
          const next = table === 'member_roles' ? sb.__e2eRoles.queue.shift() : undefined;
          if (!next) return from(table);
          sb.__e2eRoles.served += 1;
          const result = { data: next.data ?? null, error: next.error ?? null, count: null, status: next.error ? 0 : 200 };
          const q = { then: (res, rej) => new Promise((r) => setTimeout(r, 25)).then(() => result).then(res, rej) };
          for (const m of ['select', 'eq', 'in', 'order', 'limit', 'single', 'maybeSingle']) q[m] = () => q;
          return q;
        };
      }
      sb.__e2eRoles.queue.push(ans);
      return sb.__e2eRoles.served;
    }, answer);
    const served = (tab, n) => tab.waitForFunction((k) => window.__fx.supabase.__e2eRoles.served > k, n, { timeout: 15_000 })
      .catch(() => { throw new Error('the tab did not re-read member_roles when it came back'); });
    const checkOut = (tab) => tab.locator('button.mb-checkout[data-tour=checkout]');
    try {
      await tick();
      await newTab('/_fixture?__fx=persona:mentor');
      const pre = await page.evaluate((uid) => {
        window.__fx.insert('attendance_events', { user_id: uid, type: 'in', event_time: new Date(Date.now() - 30 * 60_000).toISOString(), location: 'shop-main', method: 'nfc', category: 'build', geo_ok: true });
        return { apps: window.__fx.rows('member_applications').filter((r) => r.member_id === uid).length, roles: window.__fx.rows('member_roles').filter((r) => r.member_id === uid).map((r) => r.role) };
      }, MENTOR);
      assert(pre.apps === 0 && pre.roles.join() === 'mentor', `precondition: the mentor holds ${pre.apps} application(s) and roles ${pre.roles.join(',')}`);
      const a = await newTab('/dashboard');
      await checkOut(a).waitFor({ timeout: 15_000 });
      const base = await count(MENTOR);

      // A transient error: the dashboard and its Check Out stay.
      let n = await rolesAnswer(a, { error: { message: 'TypeError: Failed to fetch', code: '' } });
      await away(a);
      await served(a, n);
      await settle();
      await settle();
      assert((await a.locator('.ma-wrap').count()) === 0, 'a member_roles error as the tab came back put the mentor behind the application form');
      assert((await checkOut(a).count()) === 1 && (await a.locator('.mb-status').textContent())?.trim() === 'Checked in', 'the dashboard lost "Checked in" or its Check Out after a member_roles error');
      await shot('R10-resume-roles-error-held', a);

      // Control: a real empty answer is a member with no roles, and the form shows.
      n = await rolesAnswer(a, { data: [] });
      await away(a);
      await served(a, n);
      await a.waitForSelector('.ma-wrap', { timeout: 15_000 })
        .catch(() => { throw new Error('control: a real empty member_roles answer did not show the application form'); });
      await shot('R10-resume-roles-error-form', a);

      // The real roles again: the dashboard is back, nothing was written, one tap checks out.
      await away(a);
      await checkOut(a).waitFor({ timeout: 15_000 });
      assert((await count(MENTOR)) === base, `the form and the re-mount wrote ${(await count(MENTOR)) - base}`);
      await press(checkOut(a));
      await a.waitForFunction(() => document.querySelector('.mb-status')?.textContent.trim() === 'Not checked in', null, { timeout: 15_000 });
      await settle();
      const added = (await events(MENTOR)).slice(base);
      assert(added.length === 1 && added[0].type === 'out', `Check Out wrote ${JSON.stringify(added.map((e) => e.type))}`);
      return 'error on resume: dashboard and Check Out up, no form; a real empty answer: the form; the real roles: back, 0 writes, then 1 OUT';
    } finally {
      // Every later step taps as the student.
      await newTab('/_fixture?__fx=persona:student');
    }
  });

  // ── V: the volunteer tag's switch and revisit ────────────────────────────

  // V1. The FLL tag over an open BUILD session offers the switch and writes
  //     nothing until tapped; the tap closes the build session and opens a
  //     volunteer one.
  await step('V1-volunteer-switch', 'the volunteer tag over a build session asks to switch (0 writes); the tap writes OUT + volunteer IN', async () => {
    await ensureOut(STUDENT);
    await context.setGeolocation(SHOP);
    await checkInByTag();
    await tick();
    await context.setGeolocation(FLL);
    const base = await count(STUDENT);
    await newTab(FLL_TAG);
    await waitText('Tap to switch to volunteer hours');
    await waitText('You have a normal session open');
    await settle();
    assert((await count(STUDENT)) === base, `the switch offer wrote ${(await count(STUDENT)) - base} on arrival`);
    await press(page.locator('button', { hasText: 'Switch to volunteer' }));
    await waitText('VOLUNTEER · CHECKED IN');
    await waitText('Switched from a normal session to volunteer.');
    await settle();
    const added = (await events(STUDENT)).slice(base);
    assert(added.length === 2 && added[0].type === 'out' && added[1].type === 'in' && added[1].category === 'volunteer' && added[1].geo_ok === true,
      `the switch wrote ${JSON.stringify(added.map((e) => ({ type: e.type, category: e.category, geo_ok: e.geo_ok })))}`);
    return 'arrival: switch offer, 0 writes; tap: OUT (build session closed) + IN volunteer, geo_ok true';
  });

  // V2. A reloaded volunteer receipt asks before checking out.
  await step('V2-volunteer-reload', 'reloading a volunteer receipt asks (0 writes); the tap writes 1 volunteer OUT', async () => {
    assert((await lastType(STUDENT)) === 'in', 'V2 needs the volunteer session V1 opened');
    await tick();
    const base = await count(STUDENT);
    await page.reload();
    await waitForFixture(page);
    await waitText('Volunteering since');
    await settle();
    assert((await count(STUDENT)) === base, `the reload wrote ${(await count(STUDENT)) - base}`);
    assert(!(await text()).includes('VOLUNTEER · CHECKED OUT'), 'the reload checked out with no tap');
    await press(checkOutButton());
    await waitText('VOLUNTEER · CHECKED OUT');
    await settle();
    const added = (await events(STUDENT)).slice(base);
    assert(added.length === 1 && added[0].type === 'out' && added[0].category === 'volunteer', `the Check out tap wrote ${JSON.stringify(added.map((e) => ({ type: e.type, category: e.category })))}`);
    return 'reload: "Volunteering since" and 0 writes; tap: 1 OUT, category volunteer';
  });

  // V3. Back from VIEW STATUS onto a volunteer check-in receipt asks; a fresh
  //     volunteer tap in a new tab, from that same state, checks out at once.
  await step('V3-volunteer-back-swipe', 'back onto a volunteer receipt asks (0 writes); a fresh volunteer tap checks out with no confirm', async () => {
    await ensureOut(STUDENT);
    await tick();
    await context.setGeolocation(FLL);
    await newTab(FLL_TAG);
    await waitText('Tap to confirm volunteer check-in');
    await press(confirmButton());
    await waitText('VOLUNTEER · CHECKED IN');
    await press(page.locator('a', { hasText: 'VIEW STATUS' }));
    await page.waitForURL((u) => u.pathname === '/dashboard', { timeout: 15_000 });
    // Wait for the dashboard itself, not just its URL. React Router moves the
    // URL first and renders the lazy route inside a transition, keeping the
    // tag page MOUNTED until the chunk arrives; a back gesture before then
    // returns to a page that never left, which is no revisit at all (measured:
    // the receipt simply stays, 0 writes).
    await page.waitForFunction(() => document.querySelector('.mb-status')?.textContent?.trim() === 'Checked in', null, { timeout: 15_000 });
    await tick();
    const base = await count(STUDENT);
    await page.goBack();
    await page.waitForURL((u) => u.pathname === '/checkin-volunteer', { timeout: 15_000 });
    await waitText('Volunteering since');
    await settle();
    assert((await count(STUDENT)) === base, `the back-swipe wrote ${(await count(STUDENT)) - base}`);
    await newTab(FLL_TAG);
    await waitText('VOLUNTEER · CHECKED OUT');
    await settle();
    const added = (await events(STUDENT)).slice(base);
    assert(added.length === 1 && added[0].type === 'out', `the fresh volunteer tap wrote ${JSON.stringify(added.map((e) => e.type))}`);
    await context.setGeolocation(SHOP);
    return 'back-swipe: "Volunteering since", 0 writes; a fresh tap in a new tab: 1 OUT with no confirm';
  });

  // g. Signed out: bounced to /login with the pending check-in saved. Control:
  //    signing in delivers the visitor back to that exact check-in. One tab
  //    throughout: pendingCheckin is sessionStorage, which is per tab.
  await step('g-signed-out-bounce', 'a signed-out visitor is bounced to /login with the check-in saved', async () => {
    await ensureOut(STUDENT);
    await tick();
    await newTab('/_fixture?__fx=persona:signedout');
    const before = await count(STUDENT);
    await sameTab(SHOP_TAG);
    await page.waitForURL((u) => u.pathname === '/login', { timeout: 15_000 });
    const pending = await page.evaluate(() => sessionStorage.getItem('pendingCheckin'));
    assert(pending === SHOP_TAG, `pendingCheckin is ${JSON.stringify(pending)}`);
    assert((await count(STUDENT)) === before, 'a signed-out visit wrote an event');
    await shot('g-signed-out-login');
    await page.evaluate(() => window.__fx.setPersona('student'));
    await page.waitForURL((u) => u.pathname === '/checkin' && u.search === '?loc=shop-main', { timeout: 15_000 });
    await waitText('Tap to confirm your check-in');
    const cleared = await page.evaluate(() => sessionStorage.getItem('pendingCheckin'));
    assert(cleared === null, 'pendingCheckin was not consumed after sign-in');
    return `bounced to /login with pendingCheckin=${pending}; signing in returned to it (0 writes while signed out)`;
  });

  // Every full-page shot at the phone width left its tab with a coarse
  // pointer and one touch point, so the steps after it tapped the phone
  // layout. `dropped` counts the shots that had lost touch before the restore:
  // the trap is real wherever it is above 0, and the restore is what put it back.
  if (vp.hasTouch) {
    const bad = touchShots.filter((t) => !(t.coarse && t.points === 1));
    const droppedOn = touchShots.filter((t) => t.dropped).map((t) => t.name);
    const dropped = droppedOn.length;
    results.push({
      vp: vp.name,
      id: 'z-touch',
      name: 'every full-page shot leaves the phone tab with a coarse pointer',
      ok: touchShots.length > 0 && bad.length === 0,
      detail: bad.length
        ? bad.slice(0, 5).map((t) => `${t.name}: pointer ${t.coarse ? 'coarse' : 'fine'}, maxTouchPoints ${t.points}${t.error ? ` (${t.error})` : ''}`).join(' | ')
        : `${touchShots.length} shots: ${dropped} of ${touchShots.length} had dropped to a fine pointer${dropped ? ` (${droppedOn.slice(0, 6).join(', ')})` : ''}, all ${touchShots.length} coarse with 1 touch point after the restore`,
    });
  }

  // Zero unexpected console errors across the whole viewport run, every tab.
  const unexpected = consoleErrors.filter((e) => !EXPECTED_CONSOLE.some((re) => re.test(e.text)));
  results.push({
    vp: vp.name,
    id: 'z-console',
    name: 'no unexpected console errors',
    ok: unexpected.length === 0,
    detail: unexpected.length ? unexpected.slice(0, 5).map((e) => `${e.type}: ${e.text} @ ${e.url}`).join(' | ') : `0 errors, ${blocked.length} external request(s) blocked`,
  });
  await cdp.detach().catch(() => {});
  await context.close();
}

// ── M: presence across LA midnight ──────────────────────────────────────────
// Its own context, because it needs its own clock: 12:30 AM, when a session
// opened at 11:40 PM is still inside the 10 h cap. The member's tile has always
// read such a session as checked in (attendanceState.currentStatus); the board
// (/display) and the glance (the Team pulse tile) read attendance from local
// midnight and so dropped it, until they read from presenceSinceISO(). Control:
// the same row moved to 1:40 PM the day before (not today, past the cap) reads
// absent on all three, so "present" is not just every name on the board.
const MIDNIGHT_CLOCK = new Date('2026-10-01T00:30:00-07:00');
async function runMidnight(browser, origin, vp) {
  const { context } = await newContext(browser, vp, {});
  await context.clock.install({ time: MIDNIGHT_CLOCK });
  const consoleErrors = watchContextConsole(context);
  let page = await context.newPage();
  // Next tab first, then close the one before (see newTab in runViewport).
  const open = async (url) => {
    const earlier = page;
    page = await context.newPage();
    await page.goto(origin + url);
    await waitForFixture(page);
    await earlier.close().catch(() => {});
  };
  const id = 'M-midnight-presence';
  const name = 'a check-in at 11:40 PM reads present at 12:30 AM on the tile, the glance and the board; past the cap, absent on all three';
  const t0 = Date.now();
  try {
    await page.goto(origin + '/_fixture?__fx=persona:student,mig:all,reset');
    await waitForFixture(page);
    // Sam's newest event must be the planted IN: drop his last 26 h (a feature
    // seed may hold a session for him) and plant one at 11:40 PM.
    const planted = await page.evaluate(({ uid, since, at }) => {
      const db = window.__fx.db;
      db.attendance_events = db.attendance_events.filter((e) => !(e.user_id === uid && Date.parse(e.event_time) >= since));
      window.__fx.save();
      const row = window.__fx.insert('attendance_events', { user_id: uid, type: 'in', event_time: at, location: 'shop-main', method: 'nfc', category: 'build', geo_ok: true });
      const p = window.__fx.rows('profiles').find((r) => r.id === uid);
      return { rowId: row.id, name: p?.nickname?.trim() || p?.full_name?.trim() };
    }, { uid: STUDENT, since: MIDNIGHT_CLOCK.getTime() - 26 * 3600_000, at: new Date('2026-09-30T23:40:00-07:00').toISOString() });
    assert(planted.name, 'no display name for the student persona');

    // What this tab's copy of the store says about Sam: the planted row's time
    // and his newest event. Every read carries it, so a failure names the data
    // the page was looking at rather than only what it showed.
    const storeSays = () => page.evaluate(({ uid, rowId }) => {
      const evs = window.__fx.rows('attendance_events').filter((e) => e.user_id === uid).sort((a, b) => a.event_time.localeCompare(b.event_time));
      const last = evs.at(-1);
      return `planted ${evs.find((e) => e.id === rowId)?.event_time ?? 'MISSING'}, newest ${last ? `${last.type} ${last.event_time}` : 'none'}`;
    }, { uid: STUDENT, rowId: planted.rowId });
    const readTile = async () => {
      await open('/dashboard');
      await page.waitForSelector('.mb-status', { timeout: 15_000 });
      await page.waitForFunction(() => /^\d+/.test([...document.querySelectorAll('a.mb-tile')].find((t) => t.textContent.includes('present now'))?.querySelector('.mb-tile-big')?.textContent ?? ''), null, { timeout: 15_000 });
      return {
        ...(await page.evaluate(() => ({
          status: document.querySelector('.mb-status')?.textContent?.trim(),
          glance: parseInt([...document.querySelectorAll('a.mb-tile')].find((t) => t.textContent.includes('present now')).querySelector('.mb-tile-big').textContent, 10),
        }))),
        store: await storeSays(),
      };
    };
    const readBoard = async () => {
      await open('/_fixture?__fx=persona:mentor');
      await open('/display');
      await page.waitForSelector('.pb-count-now', { timeout: 15_000 });
      const out = await page.evaluate((who) => {
        const row = [...document.querySelectorAll('li.pb-row')].find((li) => li.querySelector('.pb-name')?.textContent?.trim() === who);
        return { count: parseInt(document.querySelector('.pb-count-now').textContent, 10), row: row ? (row.classList.contains('pb-present') ? 'present' : 'absent') : 'missing' };
      }, planted.name);
      out.store = await storeSays();
      await open('/_fixture?__fx=persona:student');
      return out;
    };

    const inTile = await readTile();
    const inBoard = await readBoard();
    await page.screenshot({ path: path.join(OUT, `${vp.name}-${id}-in.png`), fullPage: true }).catch(() => {});
    assert(inTile.status === 'Checked in', `tile reads "${inTile.status}" for a session opened at 11:40 PM (${inTile.store})`);
    assert(inBoard.row === 'present', `the board shows ${planted.name} ${inBoard.row} while the tile reads Checked in (${inBoard.store})`);

    // Control: the same row, 1:40 PM the day before.
    const hits = await page.evaluate(({ rowId, at }) => window.__fx.patch('attendance_events', { id: rowId }, { event_time: at }), { rowId: planted.rowId, at: new Date('2026-09-30T13:40:00-07:00').toISOString() });
    assert(hits === 1, `the control patch matched ${hits} row(s) (${await storeSays()})`);
    const outTile = await readTile();
    const outBoard = await readBoard();
    assert(outTile.status === 'Not checked in', `control: tile reads "${outTile.status}" for a session past the cap (${outTile.store})`);
    assert(outBoard.row === 'absent', `control: the board shows ${planted.name} ${outBoard.row} past the cap (${outBoard.store})`);
    assert(inBoard.count - outBoard.count === 1, `the board count moved by ${inBoard.count - outBoard.count}, expected 1 (${inBoard.count} -> ${outBoard.count})`);
    assert(inTile.glance - outTile.glance === 1, `the glance count moved by ${inTile.glance - outTile.glance}, expected 1 (${inTile.glance} -> ${outTile.glance})`);
    const unexpected = consoleErrors.filter((e) => !EXPECTED_CONSOLE.some((re) => re.test(e.text)));
    assert(unexpected.length === 0, `console: ${unexpected.slice(0, 3).map((e) => e.text).join(' | ')}`);
    results.push({ vp: vp.name, id, name, ok: true, ms: Date.now() - t0,
      detail: `11:40 PM: tile Checked in, ${planted.name} present on the board (${inBoard.count}), glance ${inTile.glance}; 1:40 PM the day before: Not checked in, absent (${outBoard.count}), glance ${outTile.glance}` });
    log(`  ok   [${vp.name}] ${id}`);
  } catch (e) {
    results.push({ vp: vp.name, id, name, ok: false, detail: e.message, url: page.url(), ms: Date.now() - t0 });
    await page.screenshot({ path: path.join(OUT, `${vp.name}-${id}-FAIL.png`), fullPage: true }).catch(() => {});
    log(`  FAIL [${vp.name}] ${id} ${e.message}`);
  }
  await context.close();
}

main().catch((e) => {
  console.error(e);
  console.log(`checkin e2e: 0/${results.length || 1} passed (375 and 1440)`);
  process.exit(1);
});
