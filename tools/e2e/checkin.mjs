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
 * Every "writes nothing" assertion is paired with a positive control: the same
 * page, on the same fixture, writing when the condition is lifted. A check
 * that can only ever observe zero writes would pass against a page that has
 * stopped writing altogether.
 *
 * Time is Playwright's fake clock, installed at a fixed Thursday afternoon in
 * LA and fast-forwarded past the 60 s duplicate-tap window between taps, so
 * the run takes seconds of real time rather than minutes and never depends on
 * when it is run.
 *
 * Prints exactly one summary line, `checkin e2e: N/N passed (375 and 1440)`,
 * and exits non-zero on any failure. Screenshots go to artifacts/e2e/.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO, VIEWPORTS, flag, startFixtureServer, launchBrowser, newContext, watchConsole, ensureDir, waitForFixture } from './lib.mjs';

const args = process.argv.slice(2);
const PORT = Number(flag(args, 'port', process.env.FIXTURE_PORT || 5401));
const VERBOSE = !!flag(args, 'verbose', false);
const OUT = ensureDir(path.join(REPO, 'artifacts', 'e2e'));

// Fixture personas (src/dev/fixture/personas.js).
const STUDENT = '00000000-0000-0000-0000-0000000000c1';
const EXEMPT = '00000000-0000-0000-0000-0000000000c3';

// Geofence centres from src/geo.js. 0.018 deg of latitude is about 2.0 km.
const SHOP = { latitude: 34.04155, longitude: -118.086826, accuracy: 10 };
const FAR = { latitude: 34.04155 + 0.018, longitude: -118.086826, accuracy: 10 };
const FLL = { latitude: 34.042134, longitude: -118.086326, accuracy: 10 };

// A weekday afternoon in LA (Thursday 2026-10-01, 4:00 PM PDT): the shop is open.
const CLOCK_START = new Date('2026-10-01T16:00:00-07:00');
const PAST_DUPLICATE_WINDOW = 61_000;

// Console errors this run expects and names, never a blanket pattern. Empty:
// the check-in paths log nothing on the happy path or on a geofence refusal.
const EXPECTED_CONSOLE = [];

const results = [];
const log = (...m) => { if (VERBOSE) console.log(...m); };

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function main() {
  const server = await startFixtureServer({ port: PORT, quiet: !VERBOSE });
  const browser = await launchBrowser();
  try {
    for (const vp of [VIEWPORTS[375], VIEWPORTS[1440]]) {
      await runViewport(browser, server.origin, vp);
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
  const page = await context.newPage();
  const consoleErrors = watchConsole(page);
  // Location permission through CDP, scoped to THIS context. Measured here:
  // context.clearPermissions() leaves the next request pending forever (a
  // prompt nobody can answer in headless Chromium, and every later request
  // then times out), and Browser.setPermission without the context id lands
  // on the default context and changes nothing. 'denied' is what a student
  // who tapped Block gets: an immediate PERMISSION_DENIED.
  const cdp = await context.newCDPSession(page);
  const { targetInfo } = await cdp.send('Target.getTargetInfo');
  const setGeoPermission = (setting) => cdp.send('Browser.setPermission', {
    permission: { name: 'geolocation' }, setting, origin, browserContextId: targetInfo.browserContextId,
  });
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${vp.name}-${name}.png`), fullPage: true }).catch(() => {});
  const press = async (locator) => (vp.hasTouch ? locator.tap() : locator.click());

  // ── helpers bound to this page ──────────────────────────────────────────
  const events = (uid) => page.evaluate((id) => window.__fx.rows('attendance_events')
    .filter((e) => e.user_id === id).sort((a, b) => a.event_time.localeCompare(b.event_time)), uid);
  const text = () => page.evaluate(() => document.body.textContent || '');
  const waitText = async (needle, timeout = 15_000) => {
    try {
      await page.waitForFunction((n) => (document.body.textContent || '').includes(n), needle, { timeout });
    } catch {
      const t = (await text()).replace(/\s+/g, ' ').slice(0, 300);
      throw new Error(`expected "${needle}" on ${new URL(page.url()).pathname}; page reads: ${t}`);
    }
  };
  const go = async (url) => {
    await page.goto(origin + url);
    await waitForFixture(page);
  };
  const tick = () => context.clock.fastForward(PAST_DUPLICATE_WINDOW);
  const confirmButton = () => page.locator('button', { hasText: 'Confirm check-in' });
  const lastType = async (uid) => (await events(uid)).at(-1)?.type ?? null;
  // Leave the student checked OUT before a step that needs it, through the
  // real NFC path, and say so if the store disagrees afterwards.
  const ensureOut = async (uid) => {
    if ((await lastType(uid)) !== 'in') return;
    await tick();
    await go('/checkin?loc=shop-main');
    await waitText('CHECKED OUT');
  };

  async function step(id, name, fn) {
    const t0 = Date.now();
    try {
      const detail = await fn();
      results.push({ vp: vp.name, id, name, ok: true, detail: detail ?? null, ms: Date.now() - t0 });
      await shot(id);
      log(`  ok   [${vp.name}] ${id} ${detail ?? ''}`);
    } catch (e) {
      results.push({ vp: vp.name, id, name, ok: false, detail: e.message, url: page.url(), ms: Date.now() - t0 });
      await shot(`${id}-FAIL`);
      log(`  FAIL [${vp.name}] ${id} ${e.message}`);
    }
  }

  // ── setup: a freshly reseeded store, signed in as the student ────────────
  await go('/_fixture?__fx=persona:student,mig:all,reset');
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
    const before = (await events(STUDENT)).length;
    await go('/checkin?loc=shop-main');
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('CHECKED IN');
    const after = await events(STUDENT);
    const added = after.slice(before);
    assert(added.length === 1, `expected exactly 1 new event, got ${added.length}`);
    const e = added[0];
    assert(e.type === 'in' && e.category === 'build' && e.geo_ok === true, `new event is ${JSON.stringify({ type: e.type, category: e.category, geo_ok: e.geo_ok })}`);
    assert(e.location === 'shop-main' && e.method === 'nfc', `location/method ${e.location}/${e.method}`);
    return `1 IN, category ${e.category}, geo_ok ${e.geo_ok}`;
  });

  // b. Dashboard Check Out.
  await step('b-dashboard-checkout', 'dashboard reads Checked in, Check Out flips it and writes an OUT', async () => {
    await tick();
    await go('/dashboard');
    await page.waitForSelector('.mb-status', { timeout: 15_000 });
    const status = (await page.locator('.mb-status').textContent())?.trim();
    assert(status === 'Checked in', `status tile reads "${status}" before Check Out`);
    const btn = page.locator('button.mb-checkout', { hasText: 'Check Out' });
    assert((await btn.count()) === 1, 'no Check Out button while checked in');
    const before = (await events(STUDENT)).length;
    await press(btn);
    await page.waitForFunction(() => document.querySelector('.mb-status')?.textContent?.trim() === 'Not checked in', null, { timeout: 15_000 })
      .catch(async () => { throw new Error(`tile still reads "${(await page.locator('.mb-status').textContent())?.trim()}" after Check Out`); });
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'out', `expected 1 new OUT, got ${JSON.stringify(added.map((e) => e.type))}`);
    assert((await page.locator('button.mb-checkout').count()) === 0, 'Check Out button still shown after checking out');
    return `tile Checked in -> Not checked in, 1 OUT (location ${added[0].location})`;
  });

  // c. In, out, in, out on the same day: the open check-out bug report.
  await step('c1-nfc-checkin-again', 'a second NFC check-in the same day succeeds', async () => {
    await tick();
    const before = (await events(STUDENT)).length;
    await go('/checkin?loc=shop-main');
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('CHECKED IN');
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'in', `expected 1 new IN, got ${JSON.stringify(added.map((e) => e.type))}`);
    return '1 IN (third event today)';
  });
  let checkoutWrites = null;
  await step('c2-nfc-checkout', 'the next NFC tap checks OUT (not back to the check-in screen)', async () => {
    await tick();
    const before = (await events(STUDENT)).length;
    await go('/checkin?loc=shop-main');
    await waitText('CHECKED OUT').catch(async (e) => {
      const onConfirm = (await text()).includes('Tap to confirm your check-in');
      throw new Error(onConfirm ? 'NFC tap after an in/out/in day showed the CHECK-IN confirm screen instead of checking out' : e.message);
    });
    const added = (await events(STUDENT)).slice(before);
    checkoutWrites = added.length;
    assert(added.length === 1 && added[0].type === 'out', `expected 1 new OUT, got ${JSON.stringify(added.map((e) => e.type))}`);
    const today = (await events(STUDENT)).filter((e) => e.event_time >= todayStart).map((e) => e.type).join(',');
    assert(today === 'in,out,in,out', `today's sequence is ${today}`);
    return `1 OUT; today reads ${today}`;
  });

  // d. A duplicate tap inside 60 s reads ALREADY and writes nothing. Control:
  //    the same page wrote 1 event in c2, outside the window.
  await step('d-duplicate-tap', 'a second tap within 60 s reads ALREADY and writes nothing', async () => {
    const before = (await events(STUDENT)).length;
    await go('/checkin?loc=shop-main');
    await waitText('ALREADY OUT');
    await page.waitForTimeout(400);
    const after = (await events(STUDENT)).length;
    assert(after === before, `duplicate tap wrote ${after - before} event(s)`);
    assert(checkoutWrites >= 1, `positive control missing: the out-of-window tap (c2) wrote ${checkoutWrites}`);
    return `0 writes inside the window, against ${checkoutWrites} write(s) by the same page outside it (c2)`;
  });

  // e1. Out of range: refused, nothing written. Control: back in range, writes.
  await step('e1-geofence-range', '2 km away reads Not at the shop and writes nothing; in range it writes', async () => {
    await tick();
    await context.setGeolocation(FAR);
    const before = (await events(STUDENT)).length;
    await go('/checkin?loc=shop-main');
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('Not at the shop');
    const refused = (await events(STUDENT)).length - before;
    assert(refused === 0, `out-of-range tap wrote ${refused} event(s)`);
    await shot('e1-geofence-range-refused');
    await context.setGeolocation(SHOP);
    await press(confirmButton());
    await waitText('CHECKED IN');
    const control = (await events(STUDENT)).slice(before);
    assert(control.length === 1 && control[0].type === 'in' && control[0].geo_ok === true, `in-range control wrote ${JSON.stringify(control.map((e) => e.type))}`);
    await ensureOut(STUDENT);
    return `0 writes at 2 km, against 1 IN from the same screen at the shop`;
  });

  // e2. Permission denied: refused, nothing written. Control: granted, writes.
  await step('e2-geofence-denied', 'denied location reads Location denied and writes nothing; granted it writes', async () => {
    await tick();
    await setGeoPermission('denied');
    const before = (await events(STUDENT)).length;
    await go('/checkin?loc=shop-main');
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('Location denied');
    const refused = (await events(STUDENT)).length - before;
    assert(refused === 0, `denied tap wrote ${refused} event(s)`);
    await shot('e2-geofence-denied-refused');
    await setGeoPermission('granted');
    await context.setGeolocation(SHOP);
    await press(confirmButton());
    await waitText('CHECKED IN');
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
    const studentBefore = (await events(STUDENT)).length;
    await go('/checkin?loc=shop-main');
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('Location denied');
    const studentWrote = (await events(STUDENT)).length - studentBefore;
    assert(studentWrote === 0, `non-exempt student wrote ${studentWrote} with no location`);

    await go('/_fixture?__fx=persona:exempt');
    const exempt = await page.evaluate((id) => window.__fx.rows('profiles').find((p) => p.id === id)?.geofence_exempt, EXEMPT);
    assert(exempt === true, 'fixture exempt persona is not geofence_exempt');
    const before = (await events(EXEMPT)).length;
    await go('/checkin?loc=shop-main');
    await waitText('Tap to confirm your check-in');
    await press(confirmButton());
    await waitText('CHECKED IN');
    const added = (await events(EXEMPT)).slice(before);
    assert(added.length === 1 && added[0].type === 'in' && added[0].geo_ok === false, `exempt check-in wrote ${JSON.stringify(added.map((e) => ({ type: e.type, geo_ok: e.geo_ok })))}`);
    await setGeoPermission('granted');
    await go('/_fixture?__fx=persona:student');
    return `exempt: 1 IN with geo_ok false and no location permission; non-exempt in the same context: 0 writes`;
  });

  // f. Volunteer check-in at the FLL room, then check out by tapping again.
  await step('f1-volunteer-checkin', '/checkin-volunteer at the FLL room writes a volunteer IN', async () => {
    await ensureOut(STUDENT);
    await tick();
    await context.setGeolocation(FLL);
    const before = (await events(STUDENT)).length;
    await go('/checkin-volunteer?loc=fll-room');
    await waitText('Tap to confirm volunteer check-in');
    await press(confirmButton());
    await waitText('VOLUNTEER · CHECKED IN');
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'in' && added[0].category === 'volunteer' && added[0].geo_ok === true,
      `volunteer check-in wrote ${JSON.stringify(added.map((e) => ({ type: e.type, category: e.category, geo_ok: e.geo_ok })))}`);
    return '1 IN, category volunteer, geo_ok true';
  });
  await step('f2-volunteer-checkout', 'tapping /checkin-volunteer again later checks out', async () => {
    await tick();
    const before = (await events(STUDENT)).length;
    await go('/checkin-volunteer?loc=fll-room');
    await waitText('VOLUNTEER · CHECKED OUT');
    const added = (await events(STUDENT)).slice(before);
    assert(added.length === 1 && added[0].type === 'out', `expected 1 OUT, got ${JSON.stringify(added.map((e) => e.type))}`);
    await context.setGeolocation(SHOP);
    return '1 OUT';
  });

  // g. Signed out: bounced to /login with the pending check-in saved. Control:
  //    signing in delivers the visitor back to that exact check-in.
  await step('g-signed-out-bounce', 'a signed-out visitor is bounced to /login with the check-in saved', async () => {
    await tick();
    await go('/_fixture?__fx=persona:signedout');
    const before = (await events(STUDENT)).length;
    await go('/checkin?loc=shop-main');
    await page.waitForURL((u) => u.pathname === '/login', { timeout: 15_000 });
    const pending = await page.evaluate(() => sessionStorage.getItem('pendingCheckin'));
    assert(pending === '/checkin?loc=shop-main', `pendingCheckin is ${JSON.stringify(pending)}`);
    assert((await events(STUDENT)).length === before, 'a signed-out visit wrote an event');
    await shot('g-signed-out-login');
    await page.evaluate(() => window.__fx.setPersona('student'));
    await page.waitForURL((u) => u.pathname === '/checkin' && u.search === '?loc=shop-main', { timeout: 15_000 });
    await waitText('Tap to confirm your check-in');
    const cleared = await page.evaluate(() => sessionStorage.getItem('pendingCheckin'));
    assert(cleared === null, 'pendingCheckin was not consumed after sign-in');
    return `bounced to /login with pendingCheckin=${pending}; signing in returned to it (0 writes while signed out)`;
  });

  // Zero unexpected console errors across the whole viewport run.
  const unexpected = consoleErrors.filter((e) => !EXPECTED_CONSOLE.some((re) => re.test(e.text)));
  results.push({
    vp: vp.name,
    id: 'z-console',
    name: 'no unexpected console errors',
    ok: unexpected.length === 0,
    detail: unexpected.length ? unexpected.slice(0, 5).map((e) => `${e.type}: ${e.text} @ ${e.url}`).join(' | ') : `0 errors, ${blocked.length} external request(s) blocked`,
  });
  await context.close();
}

main().catch((e) => {
  console.error(e);
  console.log(`checkin e2e: 0/${results.length || 1} passed (375 and 1440)`);
  process.exit(1);
});
