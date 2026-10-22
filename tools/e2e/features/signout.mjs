/**
 * Sign-out requests and meeting check-in (migration 0014: src/signout.js,
 * src/SignoutForm.jsx, src/SignoutsPage.jsx, both tag routes, the dashboard).
 * Handbook Sections 6 and 7.
 *
 * Claims under test, each against a presence on the same fixture:
 *  - a tag tap with a session open shows the note form and writes NOTHING; an
 *    empty note is refused (0 requests); a note plus the cleanup tick sends
 *    ONE pending request and still writes 0 OUTs; a reload shows the waiting
 *    screen and writes nothing;
 *  - /signouts: Riley (signout.approve) lists Sam's request (1), Sam (no
 *    capability) is told only approvers can (0 rows), and the Sign-outs nav
 *    entry shows for Riley and not for Sam (1 against 0); approving writes
 *    exactly one OUT carrying the note and names Riley in Decided today;
 *  - nobody sees their own request in their queue (0 for Riley, 1 for the
 *    mentor on the same request); Send back shows the reason on the tag route;
 *    Approve all closes every waiting session (2 OUTs);
 *  - a scan in the first 15 minutes of a team meeting logs PRESENT, a member
 *    already signed in who scans later logs LATE and stays signed in (0 OUTs);
 *  - the dashboard Check Out opens the note form (0 writes) and the tile then
 *    reads "waiting for approval"; an FLL session signs out directly with the
 *    note (1 OUT, 0 requests);
 *  - before 0014: /signouts says not set up, no nav entry, and the tag checks
 *    out with one tap (1 OUT).
 * The server guard (no self-OUT on a build session) is not modelled here; it
 * is proven by 0014_session_signout_rls_test.sql and mutants-0014.mjs.
 */
import { P, PRE_0014 } from './_util.mjs';

const H = 3_600_000;
const outsOf = async (t, id) => (await t.rows('attendance_events')).filter((e) => e.user_id === id && e.type === 'out');
const reqsOf = async (t, id) => (await t.rows('signout_requests')).filter((r) => r.member_id === id);

async function menuHas(t, label) {
  await t.press('.nav-avatar-btn');
  await t.waitFor('.nav-avatar-menu');
  const n = await t.page.locator('.nav-avatar-menu a', { hasText: label }).count();
  await t.page.keyboard.press('Escape').catch(() => {});
  return n;
}

async function putIn(t, id, minutesAgo, category = 'build') {
  await t.evaluate(({ id, minutesAgo, category }) => window.__fx.insert('attendance_events', {
    user_id: id, type: 'in', location: 'shop-main', method: 'nfc', category, geo_ok: true,
    event_time: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  }), { id, minutesAgo, category });
}

async function ask(t, note) {
  await t.page.fill('.so-note', note);
  await t.page.check('.so-check input');
  await t.press('.so-submit');
}

export default {
  async run(t) {
    // ── the tag route asks ────────────────────────────────────────────────
    t.as('0014 · Sam taps out');
    await t.open('/checkin?loc=shop-main', { persona: 'student', mig: 'all', reset: true, ready: '.so-form' });
    const out0 = (await outsOf(t, P.student.id)).length;
    t.eq('the note form, nothing written', [await t.count('.so-form'), (await outsOf(t, P.student.id)).length - out0, (await reqsOf(t, P.student.id)).length], [1, 0, 0]);
    t.eq('the button asks, it does not sign out', await t.text('.so-submit'), 'Ask to sign out');
    await t.tapTargets('.so-submit, .so-check', 'sign-out controls at least 44px on the phone');
    await t.noHScroll();
    await t.shot('form');
    await t.press('.so-submit');
    t.check('an empty note is refused, 0 requests', ((await t.text('.so-problem')) || '').includes('note') && (await reqsOf(t, P.student.id)).length === 0, await t.text('.so-problem'));
    await ask(t, 'Wired the intake motor');
    await t.waitFor('.checkin-pending');
    await t.settle();
    const sReq = await reqsOf(t, P.student.id);
    t.eq('one pending request with the note and the tick, 0 OUTs', [sReq.length, sReq[0]?.status, sReq[0]?.note, sReq[0]?.cleanup_confirmed, (await outsOf(t, P.student.id)).length - out0],
      [1, 'pending', 'Wired the intake motor', true, 0]);
    await t.shot('waiting');
    await t.page.reload();
    await t.waitFor('.checkin-pending');
    await t.settle();
    t.eq('a reload shows the wait and writes nothing', [(await reqsOf(t, P.student.id)).length, (await outsOf(t, P.student.id)).length - out0], [1, 0]);

    // ── approvers ─────────────────────────────────────────────────────────
    t.as('0014 · Sam is not an approver');
    await t.open('/signouts', { persona: 'student', mig: 'all', ready: '.sop-title' });
    t.eq('Sam: no queue, told who approves', [await t.count('.sop-row'), ((await t.bodyText()).includes('Only mentors and students Mr. Pina names'))], [0, true]);
    t.eq('Sam: no Sign-outs in the menu', await menuHas(t, 'Sign-outs'), 0);

    t.as('0014 · Riley approves');
    await t.open('/signouts', { persona: 'student2', mig: 'all', ready: '.sop-title' });
    await t.settle();
    t.eq('Riley: the Sign-outs entry (1 against 0 for Sam)', await menuHas(t, 'Sign-outs'), 1);
    t.eq('Riley sees Sam waiting with his note', [await t.count('.sop-row'), await t.text('.sop-row .sop-name'), await t.text('.sop-row .sop-text')], [1, P.student.nick, 'Wired the intake motor']);
    await t.tapTargets('.sop-btn', 'approve buttons at least 44px on the phone');
    await t.noHScroll();
    await t.shot('queue');
    await t.press('.sop-row .sop-btn-primary');
    await t.waitFor(() => !document.querySelector('.sop-row'));
    await t.settle();
    const sOut = (await outsOf(t, P.student.id)).slice(out0);
    t.eq('approving wrote one OUT with the note', [sOut.length, sOut[0]?.note, sOut[0]?.method], [1, 'Wired the intake motor', 'manual']);
    t.check('Decided today names Riley', ((await t.text('.sop-mini [data-decision="approved"]')) || '').includes(`by ${P.student2.nick}`), await t.text('.sop-mini [data-decision="approved"]'));

    t.as('0014 · own requests are never in your queue');
    await putIn(t, P.student2.id, 30);
    await t.evaluate(() => window.__fx.supabase.rpc('request_signout', { p_note: 'Rebuilt the bumper', p_cleanup: true, p_location: 'shop-main', p_source: 'nfc' }));
    await t.open('/signouts', { persona: 'student2', mig: 'all', ready: '.sop-title' });
    await t.settle();
    t.eq('Riley does not see her own request', await t.count('.sop-row'), 0);
    await t.open('/signouts', { persona: 'mentor', mig: 'all', ready: '.sop-row' });
    await t.settle();
    t.eq('the mentor sees it (1 against 0)', await t.count('.sop-row'), 1);
    await t.press('.sop-row .sop-btn:not(.sop-btn-primary)');
    await t.page.fill('.sop-input', 'Sweep the mill area first');
    await t.press('.sop-return .sop-btn');
    await t.waitFor(() => !document.querySelector('.sop-row'));
    await t.settle();
    t.eq('sent back, not signed out', [(await reqsOf(t, P.student2.id))[0]?.status, (await outsOf(t, P.student2.id)).filter((e) => Date.now() - Date.parse(e.event_time) < H).length], ['returned', 0]);
    await t.open('/checkin?loc=shop-main', { persona: 'student2', mig: 'all', ready: '.so-form' });
    t.check('the tag route shows the reason', ((await t.text('.so-returned')) || '').includes('Sweep the mill area first'), await t.text('.so-returned'));

    t.as('0014 · Approve all');
    await ask(t, 'Swept the mill area');
    await t.waitFor('.checkin-pending');
    await putIn(t, P.exempt.id, 50);
    await t.evaluate(() => window.__fx.setPersona('exempt'));
    await t.evaluate(() => window.__fx.supabase.rpc('request_signout', { p_note: 'Sorted fasteners', p_cleanup: true, p_location: 'shop-main', p_source: 'nfc' }));
    const before = [(await outsOf(t, P.student2.id)).length, (await outsOf(t, P.exempt.id)).length];
    await t.open('/signouts', { persona: 'mentor', mig: 'all', ready: '.sop-row' });
    await t.settle();
    t.eq('the mentor menu has Sign-outs', await menuHas(t, 'Sign-outs'), 1);
    t.eq('two waiting, one Approve all', [await t.count('.sop-row'), await t.text('.sop-card-head .sop-btn-primary')], [2, 'Approve all 2']);
    await t.press('.sop-card-head .sop-btn-primary');
    await t.waitFor(() => !document.querySelector('.sop-row'));
    await t.settle();
    t.eq('both sessions closed (1 OUT each)', [(await outsOf(t, P.student2.id)).length - before[0], (await outsOf(t, P.exempt.id)).length - before[1]], [1, 1]);

    // ── meeting check-in ─────────────────────────────────────────────────
    t.as('0014 · meeting present and late');
    const meetId = await t.evaluate(() => window.__fx.insert('events', {
      title: 'Team meeting', kind: 'meeting', starts_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      ends_at: new Date(Date.now() + 90 * 60_000).toISOString(),
    }).id);
    await t.advanceTime(2 * 60_000);
    await t.open('/checkin?loc=shop-main', { persona: 'exempt', mig: 'all', ready: '.checkin-wrap button' });
    await t.press('.checkin-wrap button');
    await t.waitFor('.checkin-meeting');
    await t.settle();
    const casey = (await t.rows('meeting_checkins')).filter((m) => m.member_id === P.exempt.id);
    t.eq('Casey checks in 7 minutes in: PRESENT, one row', [((await t.text('.checkin-meeting')) || '').startsWith('PRESENT'), casey.length, casey[0]?.status], [true, 1, 'present']);
    await t.shot('meeting-present');
    await t.evaluate((id) => window.__fx.patch('events', { id }, { starts_at: new Date(Date.now() - 25 * 60_000).toISOString() }), meetId);
    await putIn(t, P.student.id, 0);
    await t.advanceTime(2 * 60_000);
    const sOut1 = (await outsOf(t, P.student.id)).length;
    await t.open('/checkin?loc=shop-main', { persona: 'student', mig: 'all', ready: '.checkin-wrap h1' });
    await t.waitFor('.checkin-loc');
    await t.settle();
    const sam = (await t.rows('meeting_checkins')).filter((m) => m.member_id === P.student.id);
    t.eq('Sam, signed in, scans 25 minutes in: LATE, stays signed in (0 OUTs, 0 requests)',
      [((await t.text('.checkin-status')) || '').startsWith('LATE'), sam[0]?.status, (await outsOf(t, P.student.id)).length - sOut1, (await reqsOf(t, P.student.id)).filter((r) => r.status === 'pending').length],
      [true, 'late', 0, 0]);
    t.eq('Sign out instead is offered', await t.count('.checkin-secondary'), 1);
    await t.shot('meeting-late');
    await t.evaluate((id) => window.__fx.patch('events', { id }, { ends_at: new Date(Date.now() - 60_000).toISOString() }), meetId);

    // ── dashboard ─────────────────────────────────────────────────────────
    t.as('0014 · dashboard');
    await t.open('/dashboard', { persona: 'student', mig: 'all', ready: 'button.mb-checkout[data-tour=checkout]' });
    await t.settle();
    const dOut = (await outsOf(t, P.student.id)).length;
    await t.press('button.mb-checkout[data-tour=checkout]');
    await t.waitFor('.mb-you .so-form');
    t.eq('Check Out opens the note, nothing written', [await t.count('.mb-you .so-form'), (await outsOf(t, P.student.id)).length - dOut], [1, 0]);
    await ask(t, 'CAD review for the climber');
    await t.waitFor('.mb-so-wait');
    await t.settle();
    const dReq = (await reqsOf(t, P.student.id)).filter((r) => r.status === 'pending');
    t.eq('the tile waits for approval; one request from the button', [await t.count('.mb-so-wait'), dReq.length, dReq[0]?.source, (await outsOf(t, P.student.id)).length - dOut], [1, 1, 'button', 0]);
    await t.noHScroll();
    await t.shot('dashboard-waiting');

    // ── FLL signs out directly ────────────────────────────────────────────
    t.as('0014 · FLL');
    await putIn(t, P.exempt.id, 0, 'volunteer');
    await t.advanceTime(2 * 60_000);
    const fOut = (await outsOf(t, P.exempt.id)).length;
    await t.open('/checkin-volunteer?loc=fll-room', { persona: 'exempt', mig: 'all', ready: '.so-form' });
    t.eq('the FLL button signs out', await t.text('.so-submit'), 'Sign out');
    await ask(t, 'Helped team 4521 with their attachment');
    await t.waitFor('.checkin-checkout');
    await t.settle();
    const fll = (await outsOf(t, P.exempt.id)).slice(fOut);
    t.eq('one OUT with the note, no request', [fll.length, fll[0]?.note, (await reqsOf(t, P.exempt.id)).filter((r) => r.status === 'pending').length],
      [1, 'Helped team 4521 with their attachment', 0]);

    // ── quick pulse: a mentor signs someone in or out from /display ───────
    for (const [label, mig] of [['0014', 'all'], ['pre-0014', PRE_0014]]) {
      t.as(`${label} · quick pulse`);
      await t.open('/display', { persona: 'mentor', mig, reset: true, ready: '.pb-name-btn' });
      await t.advanceTime(2 * 60_000);
      const riley = t.page.locator('.pb-name-btn', { hasText: P.student2.nick }).first();
      const ins = async () => (await t.rows('attendance_events')).filter((e) => e.user_id === P.student2.id).length;
      const n0 = await ins();
      await t.press(riley);
      await t.waitFor('.qp-btn');
      t.eq('Riley reads not signed in; the button signs in', [await t.text('.qp-text'), await t.text('.qp-btn')], ['Not signed in', 'Sign in now']);
      await t.tapTargets('.qp-btn', 'the quick button at least 44px on the phone');
      await t.press('.qp-btn');
      await t.settle();
      t.eq('one tap arms it and writes nothing', [await t.text('.qp-btn'), (await ins()) - n0], [`Tap again to sign ${P.student2.nick} in`, 0]);
      await t.press('.qp-btn');
      await t.waitFor(() => document.querySelector('.qp-text')?.textContent.startsWith('Signed in'));
      await t.settle();
      const evs = (await t.rows('attendance_events')).filter((e) => e.user_id === P.student2.id).slice(n0);
      const audit = (await t.rows('attendance_audit')).filter((a) => a.member_id === P.student2.id);
      t.eq('the second tap writes one IN, by the mentor, with an audit row', [evs.length, evs[0]?.type, evs[0]?.overridden_by === P.mentor.id, audit.length > 0], [1, 'in', true, true]);
      t.check('the board shows Riley present', (await t.page.locator('.pb-row.pb-present .pb-name', { hasText: P.student2.nick }).count()) === 1, '');
      await t.shot(`quick-pulse-${label}`, { full: false });
      await t.advanceTime(2 * 60_000);
      await t.press('.qp-btn');
      await t.press('.qp-btn');
      await t.waitFor(() => document.querySelector('.qp-text')?.textContent === 'Not signed in');
      await t.settle();
      const last = (await t.rows('attendance_events')).filter((e) => e.user_id === P.student2.id).slice(n0);
      t.eq('two more taps sign her out (IN then OUT)', last.map((e) => e.type), ['in', 'out']);
      await t.page.keyboard.press('Escape');
    }

    t.as('quick pulse · a student board has no control');
    await t.open('/display', { persona: 'student', mig: 'all', ready: '.pb-name' });
    t.eq('0 name buttons and 0 quick buttons for a student', [await t.count('.pb-name-btn'), await t.count('.qp-btn')], [0, 0]);

    // ── before 0014 ───────────────────────────────────────────────────────
    t.as('pre-0014');
    await t.open('/signouts', { persona: 'mentor', mig: PRE_0014, reset: true, ready: '.sop-title' });
    t.eq('/signouts: not set up yet, no queue', [((await t.bodyText()).includes('Not set up yet')), await t.count('.sop-row')], [true, 0]);
    t.eq('no Sign-outs in the mentor menu (1 with 0014)', await menuHas(t, 'Sign-outs'), 0);
    const pOut = (await outsOf(t, P.student.id)).length;
    await t.open('/checkin?loc=shop-main', { persona: 'student', mig: PRE_0014, ready: '.checkin-checkout' });
    await t.settle();
    t.eq('the tag checks out with one tap: 1 OUT, no form', [(await outsOf(t, P.student.id)).length - pOut, await t.count('.so-form')], [1, 0]);
  },
};
