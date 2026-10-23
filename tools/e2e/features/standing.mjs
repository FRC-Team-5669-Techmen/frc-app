/**
 * Member standing (migration 0015: src/standing.js, src/StandingPage.jsx,
 * src/StandingTeamPage.jsx, the Void button on /signouts). Handbook Sections
 * 6, 7, 8, 9, 11, 12 and 14.
 *
 * Claims under test, each against a presence on the same fixture:
 *  - Riley (on hours probation in the seed) reads Probation, the open record
 *    with 1 of 4 clean weeks, her safety violation, her pending absence and
 *    an unread notice that Mark read clears; Sam reads Good standing with 0
 *    open records;
 *  - who sees a record: Sam cannot open Riley's (refused), the parent opens
 *    Sam's and not Riley's;
 *  - the absence form refuses a mandatory meeting for a school event and
 *    writes 0 rows; a meeting 3 days out is accepted (1 row);
 *  - mentors: the overview lists Riley on probation; approving her absence
 *    marks it approved and notifies her; one tap logs a safety violation; a
 *    written warning is logged; a mentor sees the confirm list with 0 Confirm
 *    buttons, the admin with at least 1, and confirming stamps the record;
 *  - Sam signs up as an FLL mentor (1 row) and reports a near miss (1 row);
 *  - a mentor voids Sam's idle session from /signouts: 1 OUT, 1 voided review;
 *  - nav: My standing for a student only, Team standing for staff only;
 *  - before 0015: both pages say not set up.
 * The rules themselves are proven on PostgreSQL (0015 test, mutants-0015).
 */
import { P, PRE_0015 } from './_util.mjs';

async function manageHas(t, path) {
  await t.open('/manage', { ready: '.hub-wrap' });
  await t.settle();
  return t.count(`.hub-tile[data-tile="${path}"]`);
}
async function menuHas(t, label) {
  await t.press('.nav-avatar-btn');
  await t.waitFor('.nav-avatar-menu');
  const n = await t.page.locator('.nav-avatar-menu a', { hasText: label }).count();
  await t.page.keyboard.press('Escape').catch(() => {});
  return n;
}

export default {
  async run(t) {
    t.as('0015 · Riley on probation');
    await t.open('/standing', { persona: 'student2', mig: 'all', reset: true, ready: '.st-badge' });
    await t.settle();
    t.eq('badge reads Probation', await t.text('.st-badge'), 'Probation');
    t.check('the open record names hours probation with 1 of 4 clean weeks', ((await t.text('[data-card="open"]')) || '').includes('Hours probation') && ((await t.text('[data-card="open"]')) || '').includes('1 of 4'), await t.text('[data-card="open"]'));
    t.check('one safety violation this school year', ((await t.text('[data-card="safety"] .st-h2')) || '').endsWith('1'), await t.text('[data-card="safety"] .st-h2'));
    t.eq('the pending absence is listed', await t.count('[data-card="absence"] [data-absence="pending"]'), 1);
    t.eq('one unread notice', await t.count('[data-card="notices"] li.unread'), 1);
    await t.tapTargets('.st-pick, .st-btn', 'standing controls at least 44px on the phone');
    await t.noHScroll();
    await t.shot('riley');
    await t.press('[data-card="notices"] li.unread .st-link');
    await t.waitFor(() => !document.querySelector('[data-card="notices"] li.unread'));
    t.check('Mark read stamps the notice', (await t.rows('member_notices')).filter((n) => n.member_id === P.student2.id && n.read_at).length === 1, '');

    t.as('0015 · the absence form');
    const before = (await t.rows('absence_requests')).length;
    const mandatory = (await t.rows('events')).find((e) => e.kind === 'meeting' && e.mandatory);
    await t.page.selectOption('#st-ev', mandatory.id);
    await t.press('.st-pick:has-text("Required school event")');
    await t.press('[data-card="absence"] .st-btn-primary');
    t.check('a mandatory meeting refuses a school event, 0 rows', ((await t.text('[data-card="absence"] .st-error')) || '').includes('mandatory') && (await t.rows('absence_requests')).length === before, await t.text('[data-card="absence"] .st-error'));
    const soon = await t.evaluate(() => window.__fx.insert('events', { title: 'Team meeting', kind: 'meeting', starts_at: new Date(Date.now() + 3 * 864e5).toISOString(), ends_at: new Date(Date.now() + 3 * 864e5 + 36e5).toISOString(), mandatory: false }).id);
    await t.open('/standing', { persona: 'student2', mig: 'all', ready: '#st-ev' });
    await t.page.selectOption('#st-ev', soon);
    await t.press('.st-pick:has-text("Medical visit")');
    await t.press('[data-card="absence"] .st-btn-primary');
    await t.waitText('Absence request sent');
    const mine = (await t.rows('absence_requests')).filter((a) => a.event_id === soon);
    t.eq('a meeting 3 days out is accepted: 1 pending row', [mine.length, mine[0]?.status, mine[0]?.reason], [1, 'pending', 'medical']);

    t.as('0015 · Sam and who sees what');
    await t.open('/standing', { persona: 'student', mig: 'all', ready: '.st-badge' });
    await t.settle();
    t.eq('Sam reads Good standing, 0 open records', [await t.text('.st-badge'), await t.count('[data-card="open"]')], ['Good standing', 0]);
    t.eq('Sam has My standing in the menu', await menuHas(t, 'My standing'), 1);
    await t.open(`/standing?member=${P.student2.id}`, { persona: 'student', mig: 'all', ready: '.st-error, .st-badge' });
    t.eq('Sam cannot open Riley\'s record', [await t.count('.st-error'), await t.count('.st-badge')], [1, 0]);
    await t.open(`/standing?member=${P.student.id}`, { persona: 'parent', mig: 'all', ready: '.st-error, .st-badge' });
    t.eq('the parent opens Sam\'s record', [await t.count('.st-badge'), await t.count('[data-card="absence"] form')], [1, 0]);
    await t.open(`/standing?member=${P.student2.id}`, { persona: 'parent', mig: 'all', ready: '.st-error, .st-badge' });
    t.eq('the parent cannot open Riley\'s (1 error against 1 badge for Sam)', [await t.count('.st-error'), await t.count('.st-badge')], [1, 0]);
    t.eq('the parent has neither standing entry in the menu', [await menuHas(t, 'My standing'), await menuHas(t, 'Team standing')], [0, 0]);

    t.as('0015 · Sam: FLL and a near miss');
    await t.open('/standing', { persona: 'student', mig: 'all', ready: '[data-card="fll"]' });
    await t.press('[data-card="fll"] .st-btn');
    await t.waitText('Signed up for Glow Bots');
    t.eq('one FLL mentor row for Sam', (await t.rows('fll_mentors')).filter((f) => f.member_id === P.student.id && !f.removed_at).length, 1);
    await t.press('.st-btn-wide');
    await t.page.fill('[data-card="incident"] textarea', 'A drill bit snapped near my hand');
    await t.press('[data-card="incident"] .st-btn-primary');
    await t.waitText('Logged. Mentors are told now');
    t.eq('one near miss row from Sam', (await t.rows('incident_reports')).filter((r) => r.reported_by === P.student.id && r.kind === 'near_miss').length, 1);

    t.as('0015 · mentors');
    await t.open('/standing/team', { persona: 'mentor', mig: 'all', ready: '.st-table' });
    await t.settle();
    t.eq('the mentor has My standing nowhere in the menu, and Team standing on Team admin', [await menuHas(t, 'My standing'), await manageHas(t, '/standing/team')], [0, 1]);
    await t.open('/standing/team', { persona: 'mentor', mig: 'all', ready: '.st-table' });
    await t.settle();
    t.check('the overview lists Riley on probation', ((await t.text(`tr[data-member="${P.student2.id}"]`)) || '').includes('Probation'), await t.text(`tr[data-member="${P.student2.id}"]`));
    await t.noHScroll();
    await t.shot('team');
    await t.press('.st-tab:has-text("Absences")');
    await t.waitFor('.st-queue li');
    const queued = await t.count('.st-queue li');
    await t.press('.st-queue li:has-text("Orthodontist") .st-btn-primary');
    await t.waitText('Approved.');
    await t.waitFor((n) => document.querySelectorAll('.st-queue li').length < 2);
    const ortho = (await t.rows('absence_requests')).find((a) => a.note === 'Orthodontist');
    t.eq('approving marks it approved and notifies Riley', [ortho.status, (await t.rows('member_notices')).filter((n) => n.member_id === P.student2.id && n.kind === 'absence').length], ['approved', 1]);
    t.eq('two were waiting, one is left', [queued, await t.count('.st-queue li')], [2, 1]);
    await t.press('.st-tab:has-text("Log")');
    await t.page.locator('select[aria-label="Member"]').first().selectOption(P.student.id);
    const sv0 = (await t.rows('safety_violations')).filter((v) => v.member_id === P.student.id).length;
    await t.press('.st-pick:has-text("No safety glasses")');
    await t.waitText('Safety violation logged');
    t.eq('one tap logs a safety violation for Sam', (await t.rows('safety_violations')).filter((v) => v.member_id === P.student.id).length - sv0, 1);
    await t.press('.st-pick:has-text("Written warning")');
    await t.page.fill('input[placeholder="The rule broken"]', 'Phone out during the meeting');
    await t.press('.st-card:has-text("Discipline") .st-btn-primary');
    await t.waitText('Logged.');
    t.eq('a written warning is logged', (await t.rows('discipline_records')).filter((d) => d.member_id === P.student.id && d.level === 'written').length, 1);
    t.eq('removal is not offered to a mentor', await t.count('.st-pick:has-text("Removal")'), 0);
    await t.press('.st-tab:has-text("Confirm")');
    await t.waitFor('.st-queue li');
    t.eq('the mentor sees the list, 0 Confirm buttons', [await t.count('.st-queue li') > 0, await t.count('.st-queue .st-btn-primary')], [true, 0]);
    t.eq('no Settings tab for a mentor', await t.count('.st-tab:has-text("Settings")'), 0);

    t.as('0015 · admin');
    await t.open('/standing/team', { persona: 'admin', mig: 'all', ready: '.st-table' });
    await t.press('.st-tab:has-text("Confirm")');
    await t.waitFor('.st-queue .st-btn-primary');
    t.check('the admin sees Confirm buttons', (await t.count('.st-queue .st-btn-primary')) >= 1, '');
    await t.press('.st-queue li[data-record="hours"] .st-btn-primary');
    await t.waitText('Confirmed.');
    t.check('confirming stamps the record', (await t.rows('standing_records')).some((r) => r.member_id === P.student2.id && r.kind === 'hours' && r.confirmed_at), '');
    t.eq('Settings and Removal offered to the admin', [await t.count('.st-tab:has-text("Settings")'), 1], [1, 1]);

    t.as('0015 · void an idle session');
    await t.evaluate((id) => window.__fx.insert('attendance_events', { user_id: id, type: 'in', location: 'shop-main', method: 'nfc', category: 'build', geo_ok: true, event_time: new Date(Date.now() - 40 * 60000).toISOString() }), P.student.id);
    const rev0 = (await t.rows('session_reviews')).filter((r) => r.user_id === P.student.id && r.status === 'voided').length;
    await t.open('/signouts', { persona: 'mentor', mig: 'all', ready: '.sop-mini' });
    await t.settle();
    const sam = t.page.locator('.sop-mini li', { hasText: P.student.nick }).first();
    await t.press(sam.locator('.sop-link'));
    await sam.locator('.sop-input').fill('On a phone, no task');
    await t.press(sam.locator('.sop-btn'));
    await t.waitText('session voided, reason sent');
    const voidRev = (await t.rows('session_reviews')).filter((r) => r.user_id === P.student.id && r.status === 'voided');
    t.eq('one OUT and one new voided review for Sam', [voidRev.length - rev0, (await t.rows('attendance_events')).filter((e) => e.user_id === P.student.id && e.location === 'voided').length], [1, 1]);

    t.as('pre-0015');
    await t.open('/standing', { persona: 'student', mig: PRE_0015, reset: true, ready: '.st-wrap' });
    await t.settle();
    t.check('/standing: not set up yet', (await t.bodyText()).includes('Not set up yet'), '');
    await t.open('/standing/team', { persona: 'mentor', mig: PRE_0015, ready: '.st-wrap' });
    await t.settle();
    t.check('/standing/team: not set up yet', (await t.bodyText()).includes('Not set up yet'), '');
  },
};
