/**
 * The dashboard Check Out tile (lane b2, no migration: src/HomePage.jsx over
 * src/attendanceState.js). Lane b2 seeds Sam checked in by tag 2h 45m before
 * the fixture clock, the state the 2026-09-08 report was filed from.
 *
 * Claims under test, each in both directions and in both migration states:
 *  - checked in: "Checked in", "since <in time, LA>", a 44px Check Out button,
 *    no NFC hint, no error, no retry, never "Status unavailable";
 *  - one tap writes EXACTLY one OUT {location 'button', method null} and the
 *    tile flips to "Not checked in" with the NFC hint and no button;
 *  - positive control: Riley, whose only open IN is two days old (stale, past
 *    the 10 h cap), reads "Not checked in" with no button on the same fixture.
 *
 * This is the dashboard half only. tools/e2e/checkin.mjs (npm run
 * test:checkin) owns the /checkin and /checkin-volunteer paths.
 */
import { P } from './_util.mjs';

const H = 3_600_000;

async function tile(t) {
  return t.evaluate(() => {
    const txt = (s) => (document.querySelector(s)?.textContent || '').replace(/\s+/g, ' ').trim() || null;
    const btn = document.querySelector('button.mb-checkout[data-tour=checkout]');
    return {
      status: txt('.mb-status'),
      since: txt('.mb-you-since'),
      button: btn ? btn.textContent.trim() : null,
      buttonH: btn ? Math.round(btn.getBoundingClientRect().height * 10) / 10 : null,
      hint: document.querySelectorAll('.mb-nfc-hint').length,
      error: document.querySelectorAll('.mb-you-error').length,
      retry: document.querySelectorAll('.mb-retry').length,
      unavailable: (document.body.textContent || '').includes('Status unavailable'),
    };
  });
}

const laClock = (ms) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });

export default {
  async run(t) {
    for (const mig of ['all', 'none']) {
      t.as(`mig ${mig} · student`);
      await t.open('/dashboard', { persona: 'student', mig, reset: true, ready: '.mb-status' });
      await t.settle();
      const sam = (await t.rows('attendance_events')).filter((e) => e.user_id === P.student.id).sort((a, b) => a.event_time.localeCompare(b.event_time));
      const open = sam.at(-1);
      const now = await t.evaluate(() => Date.now());
      t.check('precondition: Sam\'s last event is lane b2\'s tag IN, 2h 45m before the clock', open?.type === 'in' && Math.abs(now - Date.parse(open.event_time) - 2.75 * H) < 5 * 60_000,
        `${open?.type} at ${open?.event_time}, ${Math.round((now - Date.parse(open?.event_time)) / 60_000)} min ago`);
      const before = await tile(t);
      t.eq('checked in: status, since, Check Out, and none of hint / error / retry / unavailable', { ...before, buttonH: undefined },
        { status: 'Checked in', since: `since ${laClock(Date.parse(open.event_time))}`, button: 'Check Out', hint: 0, error: 0, retry: 0, unavailable: false, buttonH: undefined });
      t.check('Check Out at least 44px tall', before.buttonH >= 44, `${before.buttonH}px`);
      await t.noHScroll();
      await t.shot(`checked-in-mig-${mig}`);
      const n0 = sam.length;
      await t.press('button.mb-checkout[data-tour=checkout]');
      await t.page.waitForFunction(() => document.querySelector('.mb-status')?.textContent.trim() === 'Not checked in', null, { timeout: 15_000 }).catch(() => {});
      await t.settle();
      const added = (await t.rows('attendance_events')).filter((e) => e.user_id === P.student.id).slice(n0);
      t.check('exactly one new row: OUT, location button, method null', added.length === 1 && added[0].type === 'out' && added[0].location === 'button' && added[0].method == null,
        JSON.stringify(added.map((e) => ({ type: e.type, location: e.location, method: e.method }))));
      const after = await tile(t);
      t.eq('after: Not checked in, the NFC hint, no button, no error', { status: after.status, button: after.button, hint: after.hint, error: after.error },
        { status: 'Not checked in', button: null, hint: 1, error: 0 });
      await t.shot(`checked-out-mig-${mig}`);

      t.as(`mig ${mig} · student2 (positive control)`);
      await t.open('/dashboard', { persona: 'student2', mig, ready: '.mb-status' });
      await t.settle();
      const riley = await tile(t);
      t.eq('a stale two-day-old IN reads Not checked in, with no Check Out button (1 for Sam on the same fixture)', { status: riley.status, button: riley.button, hint: riley.hint },
        { status: 'Not checked in', button: null, hint: 1 });
    }
  },
};
