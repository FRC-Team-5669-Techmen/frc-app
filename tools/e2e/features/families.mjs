/**
 * Families and records (migration 0017). Handbook Sections 1, 9, 13, 16, 17,
 * 18, 19 and 22.
 *
 * Claims under test, each against a presence on the same fixture:
 *  - the family link, signed out: Sam's page opens, GroupMe ticks a checklist
 *    row, emergency information saves (1 row), the parent signs the current
 *    version (1 row); a wrong token reads "Link not valid";
 *  - emergency information: the mentor's sheet lists Riley's contacts; the
 *    linked parent sees Sam's values, a student does not;
 *  - driver documents: Sam uploads a license (1 row, 1 stored object), the
 *    mentor opens it (1 view logged), Riley sees 0 of Sam's;
 *  - the leaderboard ranks students by hours, highest first; a mentor with
 *    more hours than any student is listed apart (0 on the board, 1 apart);
 *  - sub-team status: a student reads Programming at risk with 0 buttons, the
 *    mentor rates Mechanical (1 row);
 *  - the no-photo list: the mentor adds Riley (1 row); a student who is not on
 *    the media sub-team reads none of it;
 *  - /standing: Sam's checklist, the shop-tools note, Discord ticked by Sam,
 *    no Buddy button for Sam and one for the mentor, 9 letter lines;
 *  - the admin publishes a handbook version: 1 row and a notice to members;
 *  - before 0017: the family link and driver documents say not available.
 */
import { P, PRE_0015 } from './_util.mjs';

const TOKEN = '41000000-0000-4000-8000-000000000001';
const PRE_0017 = `${PRE_0015},0015,0016`;

async function fillMedical(t) {
  const f = (label, v) => t.page.getByLabel(label, { exact: true }).first().fill(v);
  await f('Emergency contact 1, name', 'Pat Parent');
  await t.page.locator('[data-form="medical"] input').nth(1).fill('626-555-0199');
  await f('Emergency contact 2, name', 'Jo Parent');
  await t.page.locator('[data-form="medical"] input').nth(4).fill('626-555-0198');
  await t.page.getByLabel('Allergies').fill('Bee stings');
}

export default {
  async run(t) {
    t.as('0017 · the family link, signed out');
    await t.open(`/family/${TOKEN}`, { persona: 'signedout', mig: 'all', reset: true, ready: '.st-title' });
    await t.settle();
    t.check('Sam\'s page opens', ((await t.text('.st-title')) || '').includes(P.student.nick), await t.text('.st-title'));
    t.check('the checklist lists GroupMe not done', (await t.count('[data-card="checklist"] [data-item="groupme"].bad')) === 1, '');
    await t.press('[data-card="checklist"] .st-btn');
    await t.waitFor('[data-card="checklist"] [data-item="groupme"]:not(.bad)');
    t.eq('GroupMe ticked from the link: 1 row', (await t.rows('onboarding_items')).filter((o) => o.member_id === P.student.id && o.item === 'groupme').length, 1);
    await fillMedical(t);
    await t.press('[data-form="medical"] .st-btn-primary');
    await t.waitText('Saved. Keep it current.');
    const med = (await t.rows('member_medical')).filter((m) => m.member_id === P.student.id);
    t.eq('emergency information saved: 1 row with the allergy', [med.length, med[0]?.allergies], [1, 'Bee stings']);
    await t.page.check('[data-card="sign"] input[type="checkbox"]');
    await t.page.fill('[data-card="sign"] input.st-input', 'Pat Parent');
    await t.press('[data-card="sign"] .st-btn-primary');
    await t.waitText('Signed. Thank you.');
    t.eq('the parent signed the current version: 1 row', (await t.rows('parent_acknowledgments')).filter((a) => a.member_id === P.student.id && a.version === '2026-10-20').length, 1);
    await t.tapTargets('[data-card] .st-btn, [data-card] .st-check', 'family page controls at least 44px on the phone');
    await t.noHScroll();
    await t.shot('family');
    await t.open('/family/41000000-0000-4000-8000-0000000000ff', { persona: 'signedout', mig: 'all', ready: '.st-title' });
    t.eq('a wrong token reads Link not valid', await t.text('.st-title'), 'Link not valid');

    t.as('0017 · emergency information');
    await t.open('/emergency-info', { persona: 'mentor', mig: 'all', ready: '[data-table="emergency"]' });
    t.check('the mentor sheet lists Riley\'s contact', ((await t.text('[data-table="emergency"]')) || '').includes('Dana Student'), '');
    await t.open(`/emergency-info?member=${P.student.id}`, { persona: 'parent', mig: 'all', ready: '[data-form="medical"]' });
    t.eq('the linked parent sees Sam\'s allergy', await t.page.getByLabel('Allergies').inputValue(), 'Bee stings');
    await t.open(`/emergency-info?member=${P.student.id}`, { persona: 'student2', mig: 'all', ready: '[data-form="medical"]' });
    t.eq('another student sees an empty form (0 against the parent\'s values)', await t.page.getByLabel('Allergies').inputValue(), '');

    t.as('0017 · driver documents');
    await t.open('/driver-docs', { persona: 'student', mig: 'all', ready: '[data-card="upload"]' });
    await t.page.setInputFiles('input[data-kind="license"]', { name: 'license.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-jpeg') });
    await t.waitText('Only staff mentors can see it');
    const docs = (await t.rows('driver_documents')).filter((d) => d.owner_id === P.student.id);
    const objects = await t.evaluate(() => (window.__fx.db.__storage ?? []).length);
    t.eq('Sam\'s license: 1 row, stored', [docs.length, docs[0]?.kind, objects >= 1], [1, 'license', true]);
    await t.open('/driver-docs', { persona: 'student2', mig: 'all', ready: '[data-card="mine"]' });
    t.eq('Riley sees 0 of Sam\'s documents and no staff list', [await t.count('[data-card="all"]'), await t.count('[data-card="mine"] [data-doc]')], [0, 0]);
    await t.open('/driver-docs', { persona: 'mentor', mig: 'all', ready: '[data-card="all"]' });
    const popup = t.page.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
    await t.press('[data-card="all"] [data-doc="license"] .st-btn');
    await popup;
    await t.settle();
    t.eq('the mentor opened it: 1 view logged (1 row in the list for Sam)', [(await t.rows('driver_document_views')).length, await t.count('[data-card="all"] [data-doc]')], [1, 1]);

    t.as('0017 · leaderboard');
    await t.open('/leaderboard', { persona: 'student', mig: 'all', ready: '.st-board li' });
    // A mentor with more hours than any student: on one shared board the
    // mentor would rank first. The student board must not list the mentor.
    await t.evaluate((id) => {
      const at = (h) => new Date(Date.now() - h * 36e5).toISOString();
      window.__fx.insert('attendance_events', { user_id: id, type: 'in', location: 'shop-main', method: 'nfc', category: 'build', geo_ok: true, event_time: at(30) });
      window.__fx.insert('attendance_events', { user_id: id, type: 'out', location: 'shop-main', method: 'nfc', category: 'build', geo_ok: null, event_time: at(2) });
    }, P.mentor.id);
    await t.open('/leaderboard', { persona: 'student', mig: 'all', ready: '.st-board li' });
    t.eq('the mentor is listed apart, never on the student board (0 against 1)', [await t.count(`[data-board="students"] [data-member="${P.mentor.id}"]`), await t.count(`[data-board="adults"] [data-member="${P.mentor.id}"]`)], [0, 1]);
    t.eq('Sam is on the student board (1) and not with the adults (0)', [await t.count(`[data-board="students"] [data-member="${P.student.id}"]`), await t.count(`[data-board="adults"] [data-member="${P.student.id}"]`)], [1, 0]);
    const hours = await t.evaluate(() => [...document.querySelectorAll('.st-board li')].map((li) => li.querySelector('span:last-child').textContent));
    const toH = (s) => { const m = s.match(/(\d+)h(?: (\d+)m)?/); return m ? Number(m[1]) + Number(m[2] ?? 0) / 60 : 0; };
    const vals = hours.map(toH);
    t.check('members ranked by hours, highest first', vals.length > 2 && vals.every((v, i) => i === 0 || v <= vals[i - 1] + 1e-9), `${vals.length} rows, top ${hours[0]}`);
    await t.noHScroll();

    t.as('0017 · sub-team status');
    await t.open('/status-reports', { persona: 'student', mig: 'all', ready: '[data-subteam="Programming"]' });
    t.check('a student reads Programming at risk, with 0 buttons', ((await t.text('[data-subteam="Programming"]')) || '').includes('At risk') && (await t.count('.st-pick')) === 0, await t.text('[data-subteam="Programming"]'));
    await t.open('/status-reports', { persona: 'mentor', mig: 'all', ready: '[data-subteam="Mechanical"] .st-pick' });
    await t.press('[data-subteam="Mechanical"] .st-pick:has-text("On track")');
    await t.waitText('Mechanical: saved.');
    t.eq('the mentor rated Mechanical: 1 row', (await t.rows('subteam_status_reports')).filter((r) => r.subteam === 'Mechanical' && r.status === 'green').length, 1);

    t.as('0017 · no-photo list');
    await t.open('/no-photo', { persona: 'mentor', mig: 'all', ready: '.st-title' });
    await t.page.selectOption('select[aria-label="Member"]', P.student2.id);
    await t.press('.st-btn-primary');
    await t.waitText('Added.');
    t.eq('the mentor adds Riley: 1 row, listed', [(await t.rows('media_exceptions')).length, await t.count(`[data-nophoto="${P.student2.id}"]`)], [1, 1]);
    await t.open('/no-photo', { persona: 'student', mig: 'all', ready: '.st-title' });
    await t.settle();
    t.eq('Sam (not on the media sub-team) reads 0 rows', await t.count('[data-nophoto]'), 0);

    t.as('0017 · checklist on /standing');
    await t.open('/standing', { persona: 'student', mig: 'all', ready: '[data-card="checklist"]' });
    t.eq('the shop-tools note shows', await t.count('[data-card="shopgate"]'), 1);
    t.eq('no Done button on the buddy step for Sam', await t.count('[data-item="buddy"] .st-link'), 0);
    await t.press('[data-item="discord"] .st-link');
    await t.waitFor('[data-item="discord"]:not(.bad)');
    t.eq('Sam ticks Discord: 1 row', (await t.rows('onboarding_items')).filter((o) => o.member_id === P.student.id && o.item === 'discord').length, 1);
    t.eq('the letter progress has 9 lines', await t.count('[data-card="letter"] li'), 9);
    await t.open(`/standing?member=${P.student.id}`, { persona: 'mentor', mig: 'all', ready: '[data-card="checklist"]' });
    t.eq('the mentor has the buddy button (1 against 0 for Sam)', await t.count('[data-item="buddy"] .st-link'), 1);

    t.as('0017 · handbook change feed');
    await t.open('/handbook?tab=sign', { persona: 'admin', mig: 'all', ready: '[data-card="changes"]' });
    await t.page.fill('.hb-publish textarea', 'Clarified the FLL sign-out.');
    await t.page.fill('.hb-publish input[aria-label="Version"]', '2026-11-01');
    await t.press('.hb-publish .hb-btn-primary');
    await t.waitText('Every member was told');
    t.eq('one new version and notices sent', [(await t.rows('handbook_versions')).length, (await t.rows('member_notices')).filter((n) => n.kind === 'handbook').length > 3], [2, true]);
    await t.open('/handbook?tab=sign', { persona: 'student', mig: 'all', ready: '[data-card="changes"]' });
    t.eq('a student reads the feed, no publish form', [await t.count('[data-card="changes"] li'), await t.count('.hb-publish')], [2, 0]);

    t.as('pre-0017');
    await t.open(`/family/${TOKEN}`, { persona: 'signedout', mig: PRE_0017, reset: true, ready: '.st-title' });
    t.eq('the family link: not available', await t.text('.st-title'), 'Not available');
    await t.open('/driver-docs', { persona: 'student', mig: PRE_0017, ready: '.st-title' });
    await t.settle();
    t.check('driver documents: not set up yet', (await t.bodyText()).includes('Not set up yet'), '');
  },
};
