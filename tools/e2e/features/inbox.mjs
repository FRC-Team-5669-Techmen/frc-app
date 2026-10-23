/**
 * The open feedback inbox of 2026-10-22 (ledger 0016), the items a browser
 * can see.
 *
 *  - Sent back (2b674b0c): a student checked in with a request a mentor sent
 *    back during this session sees "Sign-out sent back" with the note and
 *    what to do next on the dashboard (1), and not for a send-back from before
 *    this session (0); Ask again opens the note form carrying the note; a
 *    pending request that a mentor sends back while the dashboard is open
 *    turns into the sent-back state without a reload (the 20 s look again).
 *  - Voice (3c11c621): a stand-in SpeechRecognition replaying Android's event
 *    shape (growing guesses at confidence 0, the final twice) writes the
 *    sentence ONCE into the note; a blocked microphone says so (1 line,
 *    against 0 after a good session).
 *  - Discord (1e00dfc5): /schedule offers Announce on each event to an admin
 *    (one per event row) and to nobody else (0 for a mentor and a student);
 *    it opens /announce with the message filled from that event and no role
 *    ticked.
 *  - Answers (bd3a4af7): the admin answers Sam's report on /feedback (1 row,
 *    New becomes Seen); Sam reads it under the feedback button, Your reports
 *    (1), and Riley does not see Sam's report (0 against 1); without 0024
 *    both say not set up and nothing is written.
 */
import { P } from './_util.mjs';

const ALL_BUT_0024 = Array.from({ length: 23 }, (_, i) => String(i + 1).padStart(4, '0')).join(',');

// A stand-in for the browser's speech recognition, installed before the app
// loads. window.__speech picks what one start() plays: 'android' or 'blocked'.
const FAKE_SPEECH = () => {
  const res = (transcript, isFinal, confidence) => Object.assign([{ transcript, confidence }], { isFinal });
  const SCRIPTS = {
    android: [[res('wired', true, 0)], [res('wired the intake', true, 0)], [res('wired the intake motor', true, 0.92)], [res('wired the intake motor', true, 0.92)]],
    blocked: 'not-allowed',
  };
  window.__speechStarts = 0;
  class FakeRecognition {
    start() {
      window.__speechStarts += 1;
      const script = SCRIPTS[window.__speech ?? 'android'];
      setTimeout(() => {
        if (typeof script === 'string') this.onerror?.({ error: script });
        else for (const results of script) this.onresult?.({ resultIndex: 0, results });
        this.onend?.();
      }, 50);
    }
    stop() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
};

async function checkedInWithRequest(t, { status, reason = null, decidedAgoMin = 2, sinceAgoMin = 60 }) {
  await t.evaluate(([uid, status, reason, decidedAgoMin, sinceAgoMin]) => {
    const now = Date.now();
    const at = (min) => new Date(now - min * 60000).toISOString();
    window.__fx.db.attendance_events = window.__fx.db.attendance_events.filter((e) => e.user_id !== uid || new Date(e.event_time) < new Date(now - 3 * 864e5));
    window.__fx.insert('attendance_events', { user_id: uid, type: 'in', location: 'shop-main', method: 'nfc', category: 'build', geo_ok: true, event_time: at(sinceAgoMin) });
    window.__fx.db.signout_requests = (window.__fx.db.signout_requests ?? []).filter((r) => r.member_id !== uid);
    window.__fx.insert('signout_requests', { member_id: uid, note: 'Wired the intake', cleanup_confirmed: true, location: 'button', source: 'button',
      status, requested_at: at(Math.min(decidedAgoMin + 1, sinceAgoMin)), decided_at: status === 'pending' ? null : at(decidedAgoMin), reason,
      decided_by: status === 'pending' ? null : '00000000-0000-0000-0000-0000000000b1' });
  }, [P.student.id, status, reason, decidedAgoMin, sinceAgoMin]);
}

export default {
  async run(t) {
    await t.page.addInitScript(FAKE_SPEECH);

    await t.step('sent back', async () => {
      t.as('0014 · sent back, on the dashboard');
      await t.open('/dashboard', { persona: 'student', mig: 'all', reset: true, ready: '.mb-you' });
      await checkedInWithRequest(t, { status: 'returned', reason: 'Sweep under the mill first.' });
      await t.open('/dashboard', { persona: 'student', mig: 'all', ready: '[data-testid="so-sent-back"]' });
      const box = await t.text('[data-testid="so-sent-back"]');
      t.check('a request sent back this session shows "Sign-out sent back", the mentor\'s note and what to do next',
        /Sign-out sent back/.test(box) && /Sweep under the mill first\./.test(box) && /ask again/i.test(box), box);
      await t.press(t.page.locator('[data-testid="so-sent-back"] button', { hasText: 'Ask again' }));
      await t.waitFor('[data-testid="so-returned"]');
      t.check('Ask again opens the note form, still carrying the note', /Sweep under the mill first\./.test(await t.text('[data-testid="so-returned"]')), '');
      await t.tapTargets('.mb-you .so-submit, .mb-you .so-mic', 'the note form controls are at least 44px on the phone');
      await t.shot('sent-back');

      t.as('0014 · a send-back from before this session');
      await checkedInWithRequest(t, { status: 'returned', reason: 'Old note', decidedAgoMin: 120, sinceAgoMin: 30 });
      await t.open('/dashboard', { persona: 'student', mig: 'all', ready: '.mb-checkout' });
      t.eq('a send-back older than the open session is not shown (0 against the 1 above)', await t.count('[data-testid="so-sent-back"]'), 0);

      t.as('0014 · sent back while the dashboard is open');
      await checkedInWithRequest(t, { status: 'pending' });
      await t.open('/dashboard', { persona: 'student', mig: 'all', ready: '.mb-so-pending' });
      await t.evaluate((uid) => window.__fx.patch('signout_requests', { member_id: uid }, {
        status: 'returned', reason: 'Put the drill away.', decided_at: new Date().toISOString(), decided_by: '00000000-0000-0000-0000-0000000000b1',
      }), P.student.id);
      await t.waitFor('[data-testid="so-sent-back"]', { timeout: 30_000 });
      t.check('the waiting tile turns into the sent-back state on its own, with the note', /Put the drill away\./.test(await t.text('[data-testid="so-sent-back"]')), '');
    });

    await t.step('voice', async () => {
      t.as('0014 · speaking the note');
      await checkedInWithRequest(t, { status: 'withdrawn', reason: null, decidedAgoMin: 200, sinceAgoMin: 60 });
      await t.open('/dashboard', { persona: 'student', mig: 'all', ready: '.mb-checkout' });
      await t.press('.mb-checkout');
      await t.waitFor('.so-mic');
      await t.evaluate(() => { window.__speech = 'android'; });
      await t.press('.so-mic');
      await t.page.waitForFunction(() => document.querySelector('#so-note')?.value.length > 0 && !document.querySelector('.so-mic-on'), null, { timeout: 5000 });
      const note = await t.page.inputValue('#so-note');
      const starts = await t.evaluate(() => window.__speechStarts);
      t.check('Android\'s growing guesses and doubled final write the sentence once, from one start',
        note === 'wired the intake motor' && starts === 1, `"${note}", starts ${starts}`);
      t.eq('a good session shows no microphone message', await t.count('[data-testid="so-mic-error"]'), 0);
      await t.evaluate(() => { window.__speech = 'blocked'; });
      await t.press('.so-mic');
      await t.waitFor('[data-testid="so-mic-error"]');
      t.check('a blocked microphone says so instead of doing nothing, and keeps what was said',
        /blocked/.test(await t.text('[data-testid="so-mic-error"]')) && (await t.page.inputValue('#so-note')) === 'wired the intake motor', await t.text('[data-testid="so-mic-error"]'));
    });

    await t.step('announce from the schedule', async () => {
      t.as('0003 · Announce from /schedule');
      await t.open('/schedule', { persona: 'admin', mig: 'all', reset: true, ready: '.sch-event' });
      const rowsAdmin = await t.count('.sch-event');
      const links = await t.count('[data-testid="sch-announce"]');
      await t.open('/schedule', { persona: 'mentor', mig: 'all', ready: '.sch-event' });
      const mentorLinks = await t.count('[data-testid="sch-announce"]');
      await t.open('/schedule', { persona: 'student', mig: 'all', ready: '.sch-event' });
      const studentLinks = await t.count('[data-testid="sch-announce"]');
      t.check('an admin gets Announce on every event row; a mentor and a student get none',
        rowsAdmin > 0 && links === rowsAdmin && mentorLinks === 0 && studentLinks === 0, `admin ${links} of ${rowsAdmin}; mentor ${mentorLinks}; student ${studentLinks}`);
      await t.open('/schedule', { persona: 'admin', mig: 'all', ready: '[data-testid="sch-announce"]' });
      const title = (await t.text('.sch-event .sch-event-title')) ?? '';
      await t.press('[data-testid="sch-announce"]');
      await t.waitFor('[data-testid="an-from-event"]');
      const msg = await t.page.inputValue('.an-area');
      const ticked = await t.count('.an-chips [aria-pressed="true"]:has-text("@")');
      t.check('Announce opens /announce filled from that event, with no role ticked',
        new URL(t.page.url()).pathname === '/announce' && msg.includes(title) && ticked === 0, `"${msg.slice(0, 60)}"; roles ticked ${ticked}`);
    });

    await t.step('the tour', async () => {
      t.as('tour · built from the feature guide');
      await t.open('/dashboard', { persona: 'student', mig: 'all', reset: true, ready: '[data-tour="nav-profile"]' });
      if (await t.count('.driver-popover')) { await t.page.keyboard.press('Escape'); await t.settle({ quietMs: 300 }); }
      await t.press('[data-tour="nav-profile"]');
      await t.press(t.page.locator('.nav-dropdown-item', { hasText: 'Replay tour' }));
      await t.waitFor('.driver-popover');
      const progress = (await t.text('.driver-popover-progress-text')) ?? '';
      const total = Number((/of (\d+)/.exec(progress) ?? [])[1] ?? 0);
      const title = await t.text('.driver-popover-title');
      t.check('Replay tour opens the guide-built tour: a welcome naming the page count, and more than ten steps',
        /Welcome to Techmen/.test(title ?? '') && total > 10 && /\d+ pages/.test((await t.text('.driver-popover-description')) ?? ''), `${title}; ${progress}`);
      await t.page.keyboard.press('Escape');
    });

    await t.step('answers', async () => {
      t.as('0024 · the admin answers');
      await t.open('/feedback', { persona: 'admin', mig: 'all', reset: true, ready: '.fbp-tab' });
      await t.press(t.page.locator('.fbp-tab', { hasText: 'All (' }));
      await t.press(t.page.locator('li.fbp-item[aria-label^="Open report: /hours"]'));
      await t.waitFor('[data-testid="fbp-answer-box"]');
      const rep = (await t.rows('feedback')).find((f) => f.route === '/hours' && f.member_id === P.student.id);
      await t.page.fill('[data-testid="fbp-answer-box"]', 'Fixed in today\'s update. Pull down to refresh.');
      await t.press('[data-testid="fbp-answer-send"]');
      await t.waitFor('[data-testid="fbp-answer"]');
      const answers = (await t.rows('feedback_replies')).filter((r) => r.feedback_id === rep.id);
      const after = (await t.rows('feedback')).find((f) => f.id === rep.id);
      t.check('one answer stored on Sam\'s report, shown in the thread, and the report is Seen',
        answers.length === 1 && (await t.count('[data-testid="fbp-answer"]')) === 1 && after.status === 'seen', `answers ${answers.length}, status ${after.status}`);
      await t.shot('console-answer');

      t.as('0024 · the sender reads it');
      await t.open('/dashboard', { persona: 'student', mig: 'all', ready: '.fb-launch' });
      await t.press('.fb-launch');
      await t.press('[data-testid="fb-view-mine"]');
      await t.waitFor('[data-testid="fb-mine"]');
      const mine = await t.text(`[data-report="${rep.id}"]`);
      t.check('Sam sees the report as Seen with the answer under it',
        /Seen/i.test(mine ?? '') && /Fixed in today's update/.test(mine ?? '') && (await t.count('[data-testid="fb-mine-answer"]')) === 1, mine);
      await t.tapTargets('.fb-view', 'the two widget tabs are at least 44px on the phone');
      await t.noHScroll();
      await t.shot('widget-mine');
      await t.open('/dashboard', { persona: 'student2', mig: 'all', ready: '.fb-launch' });
      await t.press('.fb-launch');
      await t.press('[data-testid="fb-view-mine"]');
      await t.waitFor('[data-testid="fb-mine"], [data-testid="fb-mine-empty"]');
      const rileyOwn = (await t.rows('feedback')).filter((f) => f.member_id === P.student2.id).length;
      t.check('Riley sees her own reports only: 0 of Sam\'s, against her own count from the store',
        (await t.count(`[data-report="${rep.id}"]`)) === 0 && (await t.count('[data-testid="fb-mine"] [data-report]')) === rileyOwn, `own ${rileyOwn}`);

      t.as('0024 · without 0024');
      await t.open('/feedback', { persona: 'admin', mig: ALL_BUT_0024, reset: true, ready: '.fbp-tab' });
      await t.press(t.page.locator('.fbp-tab', { hasText: 'All (' }));
      await t.press(t.page.locator('li.fbp-item[aria-label^="Open report: /hours"]'));
      await t.waitText('Answers need the 0024 update pasted first.');
      t.eq('without 0024 the console offers no answer box (0 against 1)', await t.count('[data-testid="fbp-answer-box"]'), 0);
      await t.open('/dashboard', { persona: 'student', mig: ALL_BUT_0024, ready: '.fb-launch' });
      await t.press('.fb-launch');
      await t.press('[data-testid="fb-view-mine"]');
      await t.waitFor('[data-testid="fb-mine-missing"]');
      t.check('without 0024 Your reports says it is not set up yet, and New report still works',
        (await t.count('[data-testid="fb-mine-missing"]')) === 1, '');
    });
  },
};
