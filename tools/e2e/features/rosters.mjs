/**
 * Event rosters (migration 0016: src/RostersPage.jsx). Handbook Sections 13,
 * 16 and 18.
 *
 * Claims under test, each against a presence on the same fixture:
 *  - the list shows Fixture Regional as not posted;
 *  - a draft roster: Sam (a student) reads 0 roles, the mentor reads Sam's
 *    scout role with its reason;
 *  - eligibility: Riley (hours probation) as Driver shows the blocker and the
 *    Assign button is disabled; as Scout there is no blocker and assigning
 *    writes 1 row;
 *  - posting writes the roster row and tells each member with a role; Sam
 *    then reads 2 roles;
 *  - attendance: Casey marked absent opens meetings probation, Sam present
 *    opens none;
 *  - Riley declares a conflict (1 row), the mentor reads it;
 *  - before 0016: the list says not set up.
 */
import { P, PRE_0015 } from './_util.mjs';

const EV = '16000000-0000-4000-8000-000000000001';

export default {
  async run(t) {
    t.as('0016 · mentor');
    await t.open('/rosters', { persona: 'mentor', mig: 'all', reset: true, ready: '.st-list' });
    t.check('Fixture Regional is listed, not posted', ((await t.text(`[data-event="${EV}"]`)) || '').includes('Not posted'), await t.text(`[data-event="${EV}"]`));
    await t.open(`/rosters/${EV}`, { persona: 'mentor', mig: 'all', ready: '[data-card="roles"]' });
    await t.settle();
    t.check('the mentor reads Sam as scout with the reason', ((await t.text('[data-role="scout"]')) || '').includes('Steady scouting'), await t.text('[data-role="scout"]'));
    await t.page.selectOption('[data-form="assign"] select[aria-label="Member"]', P.student2.id);
    await t.page.selectOption('[data-form="assign"] select[aria-label="Role"]', 'driver');
    await t.page.fill('[data-form="assign"] input', 'Fast hands');
    await t.waitFor('[data-blocker]');
    t.check('Riley as Driver: the blocker shows, Assign disabled', ((await t.text('[data-blocker]')) || '').includes('probation') && await t.page.locator('[data-form="assign"] .st-btn-primary').isDisabled(), await t.text('[data-blocker]'));
    await t.page.selectOption('[data-form="assign"] select[aria-label="Role"]', 'scout');
    await t.waitFor(() => !document.querySelector('[data-blocker]'));
    await t.press('[data-form="assign"] .st-btn-primary');
    await t.waitText('Assigned.');
    t.eq('Riley as Scout: 1 role row', (await t.rows('event_roles')).filter((r) => r.event_id === EV && r.member_id === P.student2.id).length, 1);
    await t.noHScroll();
    await t.shot('mentor');

    t.as('0016 · draft is staff only');
    await t.open(`/rosters/${EV}`, { persona: 'student', mig: 'all', ready: '[data-card="roles"]' });
    await t.settle();
    t.eq('Sam reads 0 roles before posting', await t.count('[data-role]'), 0);

    t.as('0016 · post');
    await t.open(`/rosters/${EV}`, { persona: 'mentor', mig: 'all', ready: '[data-card="roles"]' });
    await t.press('[data-card="roles"] .st-btn-primary:has-text("Post")');
    await t.waitText('Everyone with a role was told');
    t.eq('the roster row and a notice each for Sam and Riley', [(await t.rows('event_rosters')).filter((r) => r.event_id === EV).length,
      (await t.rows('member_notices')).filter((n) => n.kind === 'roster').length], [1, 2]);
    await t.open(`/rosters/${EV}`, { persona: 'student', mig: 'all', ready: '[data-role]' });
    t.eq('Sam now reads 2 roles (0 before)', await t.count('[data-role]'), 2);

    t.as('0016 · attendance');
    await t.open(`/rosters/${EV}`, { persona: 'mentor', mig: 'all', ready: '[data-card="attendance"]' });
    await t.press(`[data-attend="${P.exempt.id}"] .st-pick:has-text("Absent")`);
    await t.settle();
    await t.press(`[data-attend="${P.student.id}"] .st-pick:has-text("Present")`);
    await t.settle();
    const recs = await t.rows('standing_records');
    t.eq('Casey absent opens meetings probation; Sam present opens none',
      [recs.filter((r) => r.member_id === P.exempt.id && r.kind === 'meetings').length, recs.filter((r) => r.member_id === P.student.id && r.kind === 'meetings').length], [1, 0]);
    await t.tapTargets('[data-card="attendance"] .st-pick', 'attendance buttons at least 44px on the phone');

    t.as('0016 · conflicts');
    await t.open(`/rosters/${EV}`, { persona: 'student2', mig: 'all', ready: '[data-card="conflicts"] input' });
    await t.page.fill('[data-card="conflicts"] input', 'Cousin wedding on the Saturday');
    await t.press('[data-card="conflicts"] .st-btn-primary');
    await t.waitText('Conflict declared');
    t.eq('one conflict row for Riley', (await t.rows('member_conflicts')).filter((c) => c.member_id === P.student2.id && !c.withdrawn_at).length, 1);
    await t.open(`/rosters/${EV}`, { persona: 'mentor', mig: 'all', ready: '[data-card="conflicts"]' });
    t.check('the mentor reads it', ((await t.text('[data-card="conflicts"]')) || '').includes('Cousin wedding'), '');

    t.as('pre-0016');
    await t.open('/rosters', { persona: 'mentor', mig: `${PRE_0015},0015`, reset: true, ready: '.st-wrap' });
    await t.settle();
    t.check('/rosters: not set up yet', (await t.bodyText()).includes('Not set up yet'), '');
  },
};
