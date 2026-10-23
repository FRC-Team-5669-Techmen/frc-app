/**
 * Family link recovery (migration 0023, ledger 0016). Beach Blitz 2026: a
 * parent mistyped her email, every page link went to the wrong inbox, and
 * nothing on the mentor page could send her the right one.
 *
 * Claims under test, each against a presence on the same fixture:
 *  - the mentor page, one family: Send link queues one link email per address
 *    (1 row for Sam's one address); pressing it again in the hour queues 0
 *    (against the 1 before) and says so; a fixed typo saved, then Send link
 *    beside the new address queues exactly 1 to it; Reset links asks first
 *    (0 revoked before Yes) and then turns off every live link Sam has;
 *  - without 0023: Send link says the update is not pasted and queues 0;
 *  - the open link, a family that already started: the typo line is there in
 *    both migration states; the mentor mailto is there only when 0023 is on
 *    AND the event carries an alert email (1 against 0 and 0);
 *  - the family link /family/<token>: a Trip sign-ups card listing Sam's
 *    coming trips only (count from the store, the past trip and Riley's
 *    sign-up never listed), Sign-up not finished for Sam, Send me the
 *    sign-up link queues 1 row to Sam's address and again 0, the page text
 *    and HTML carry no address and no hub token; without 0023 the card is
 *    absent (0 against 1);
 *  - 44px floor on the new controls at 375, no sideways scroll.
 */
import { EH } from '../../../src/dev/fixture/features/eventhub.js';
import { P } from './_util.mjs';

const MANAGE = `/trips/${EH.event}/manage`;
const TOKEN = '41000000-0000-4000-8000-000000000001';
const SAM_INVITE_EMAIL = 'sam.family@example.com';
const ALL_BUT_0023 = Array.from({ length: 22 }, (_, i) => String(i + 1).padStart(4, '0')).join(',');

async function tab(t, label) {
  await t.press(t.page.locator('.eh-tabs .eh-seg-btn', { hasText: new RegExp(`^${label}$`) }));
  await t.settle({ quietMs: 300 });
}

async function openSam(t, opts) {
  await t.open(MANAGE, { persona: 'mentor', ready: '[data-testid="ehm-page"]', ...opts });
  await tab(t, 'Families');
  await t.press(t.page.locator('[data-testid="ehm-families"] .ehm-name-btn', { hasText: /^Sam / }));
  await t.waitFor('[data-testid="ehm-links"]');
  await t.settle({ quietMs: 300 });
}

const samInvite = async (t) => (await t.rows('hub_invites')).find((i) => i.event_id === EH.event && i.student_id === P.student.id);
const linkRows = async (t, prefix) => (await t.rows('hub_outbox')).filter((o) => String(o.dedupe_key ?? '').startsWith(`${prefix}:`));

export default {
  async run(t) {
    await t.step('mentor sends one family its link', async () => {
      t.as('0023 · the mentor page, one family');
      await openSam(t, { mig: 'all', reset: true });
      const inv = await samInvite(t);
      t.check('Sam\'s family has one address on file (precondition)', inv?.emails?.length === 1 && inv.emails[0] === SAM_INVITE_EMAIL, JSON.stringify(inv?.emails));
      const before = (await linkRows(t, 'staff_link')).length;
      await t.press('[data-testid="ehm-send-link"]');
      await t.waitFor('[data-testid="ehm-send-note"]');
      await t.settle({ quietMs: 300 });
      const after1 = await linkRows(t, 'staff_link');
      const note1 = await t.text('[data-testid="ehm-send-note"]');
      t.check('Send link queues one link email to the one address, and answers on its line',
        before === 0 && after1.length === 1 && after1[0].to_emails.join() === SAM_INVITE_EMAIL && after1[0].kind === 'resend'
          && after1[0].link_invite_id === inv.id && /Sent a new link|Queued/.test(note1),
        `rows ${before} -> ${after1.length}; "${note1}"`);
      await t.press('[data-testid="ehm-send-link"]');
      await t.waitText('Already sent to');
      const after2 = (await linkRows(t, 'staff_link')).length;
      t.check('pressing it again in the same hour queues nothing (1 row, against the 1 the first press made) and says so',
        after2 === 1, `rows ${after2}; "${await t.text('[data-testid="ehm-send-note"]')}"`);

      t.as('0023 · a typo fixed, then a link to the right address');
      await t.page.fill('[data-testid="ehm-emails"]', `${SAM_INVITE_EMAIL}, kim.fixed@example.com`);
      await t.press('[data-testid="ehm-save-emails"]');
      await t.waitText('Emails saved.');
      await t.settle({ quietMs: 300 });
      const saved = (await samInvite(t)).emails;
      const fixedRow = t.page.locator('[data-testid="ehm-removals"] .eh-person', { hasText: 'kim.fixed@example.com' });
      await t.press(fixedRow.locator('[data-testid="ehm-send-one"]'));
      await t.waitFor(() => window.__fx.rows('hub_outbox').some((o) => (o.to_emails ?? []).join() === 'kim.fixed@example.com'));
      await t.settle({ quietMs: 300 });
      const toFixed = (await linkRows(t, 'staff_link')).filter((o) => o.to_emails.join() === 'kim.fixed@example.com');
      t.check('the saved address gets exactly one link from the Send link beside it, and the first address gets no second one',
        saved.includes('kim.fixed@example.com') && toFixed.length === 1 && (await linkRows(t, 'staff_link')).length === 2,
        `emails ${JSON.stringify(saved)}; to fixed ${toFixed.length}; all ${(await linkRows(t, 'staff_link')).length}`);

      t.as('0023 · Reset links');
      const live = async () => (await t.rows('hub_invite_tokens')).filter((x) => x.invite_id === inv.id && !x.revoked_at).length;
      const live0 = await live();
      await t.press('[data-testid="ehm-reset-links"]');
      const asked = await t.count('[data-testid="ehm-reset-yes"]');
      const live1 = await live();
      await t.press('[data-testid="ehm-reset-yes"]');
      await t.waitFor('[data-testid="ehm-reset-note"]');
      await t.settle({ quietMs: 300 });
      const live2 = await live();
      t.check('Reset links asks first (nothing turned off yet), then turns off every live link Sam\'s family had',
        live0 >= 1 && asked === 1 && live1 === live0 && live2 === 0 && /turned off/.test(await t.text('[data-testid="ehm-reset-note"]')),
        `live ${live0} -> ${live1} before yes -> ${live2}; "${await t.text('[data-testid="ehm-reset-note"]')}"`);
      await t.tapTargets('[data-testid="ehm-links"] .eh-btn, [data-testid="ehm-removals"] [data-testid="ehm-send-one"]', 'the new link controls are at least 44px on the phone');
      await t.noHScroll('no horizontal scroll on the family detail');
      await t.shot('mentor-links');

      t.as(`0023 · without 0023 (mig ${ALL_BUT_0023.slice(-9)})`);
      await openSam(t, { mig: ALL_BUT_0023, reset: true });
      await t.press('[data-testid="ehm-send-link"]');
      await t.waitText('Send link needs the 0023 update pasted first.');
      t.eq('without 0023 Send link queues nothing (0 rows against 1 with it)', (await linkRows(t, 'staff_link')).length, 0);
      t.check('without 0023 Save emails and Reset links are still offered', (await t.count('[data-testid="ehm-save-emails"]')) === 1 && (await t.count('[data-testid="ehm-reset-links"]')) === 1, '');
    });

    await t.step('the open link, a family that already started', async () => {
      const startedFor = async (mig, alert) => {
        await t.open(`/join/${EH.event}`, { persona: 'signedout', mig, reset: true, ready: '[data-testid="eh-join-form"], [data-testid="eh-join-saved"]' });
        if (alert !== null) await t.evaluate(([id, a]) => window.__fx.patch('hub_events', { id }, { alert_emails: a }), [EH.event, alert]);
        if (await t.count('[data-testid="eh-join-saved"]')) await t.press(t.page.locator('[data-testid="eh-join-saved"] button', { hasText: 'Sign up another student' }));
        await t.press(t.page.locator('.eh-join-opt', { hasText: 'Riley Student' }));
        await t.page.locator('input[autocomplete="name"]').fill('Kim Dinh');
        await t.page.locator('input[type="email"]').fill('kim.typo@example.com');
        await t.press('[data-testid="eh-join-guardian"]');
        await t.press('button[type="submit"]');
        await t.waitFor('[data-testid="eh-join-done"]');
        await t.settle({ quietMs: 300 });
        return {
          typo: await t.count('[data-testid="eh-join-typo"]'),
          contact: await t.count('[data-testid="eh-join-contact"]'),
          href: await t.page.locator('[data-testid="eh-join-contact"]').first().getAttribute('href').catch(() => null),
          masked: /•••@/.test(await t.text('[data-testid="eh-join-done"]')),
          full: ((await t.text('[data-testid="eh-join-done"]')) || '').includes('riley.family@'),
        };
      };
      t.as('0023 · the open link with a team contact');
      const withContact = await startedFor('all', ['Coach.Max@example.com']);
      t.check('a family that already started: the typo line, a mentor mailto to the event contact, the addresses still masked',
        withContact.typo === 1 && withContact.contact === 1 && /^mailto:coach\.max@example\.com\?/.test(withContact.href ?? '') && withContact.masked && !withContact.full,
        JSON.stringify(withContact));
      await t.noHScroll('no horizontal scroll on the already-started screen');
      await t.shot('join-typo');
      t.as('0023 · the open link with no contact');
      const noContact = await startedFor('all', []);
      t.check('no alert email on the event: the typo line stays, the mailto is not there (0 against 1)', noContact.typo === 1 && noContact.contact === 0, JSON.stringify(noContact));
      t.as('0023 · the open link without 0023');
      const pre = await startedFor(ALL_BUT_0023, ['coach.max@example.com']);
      t.check('without 0023: the typo line stays, no mailto (0 against 1)', pre.typo === 1 && pre.contact === 0, JSON.stringify(pre));
    });

    await t.step('the family link shows the trip', async () => {
      t.as('0023 · the family link, signed out');
      await t.open(`/family/${TOKEN}`, { persona: 'signedout', mig: 'all', reset: true, ready: '.st-title' });
      await t.waitFor('[data-card="trips"]');
      await t.settle({ quietMs: 300 });
      const ends = await t.evaluate(() => {
        const days = window.__fx.rows('hub_days');
        const out = {};
        for (const d of days) out[d.event_id] = Math.max(out[d.event_id] ?? -Infinity, new Date(d.venue_closes_at).getTime());
        return out;
      });
      const clock = await t.evaluate(() => Date.now());
      const expected = (await t.rows('hub_invites')).filter((i) => i.student_id === P.student.id && clock < (ends[i.event_id] ?? -Infinity)).length;
      const listed = await t.count('[data-card="trips"] [data-trip]');
      const titles = await t.texts('[data-card="trips"] [data-trip] b');
      t.check('Trip sign-ups lists Sam\'s coming trips only (the count from the store), never the past trip',
        expected >= 1 && listed === expected && titles.includes('Fixture Blitz') && !titles.includes('Fixture Scrimmage'),
        `listed ${listed}, expected ${expected}: ${titles.join(' / ')}`);
      const others = (await t.rows('hub_invites')).filter((i) => i.event_id === EH.event && i.student_id !== P.student.id).length;
      t.check('Riley and the other families on the same trip are not listed (1 row for the trip, against the other families on it)',
        (await t.count(`[data-card="trips"] [data-trip="${EH.event}"]`)) === 1 && others >= 1, `others on the trip ${others}`);
      const state = await t.page.locator(`[data-card="trips"] [data-trip="${EH.event}"] [data-state]`).first().getAttribute('data-state');
      t.eq('Sam\'s sign-up reads not finished', state, 'not-done');
      const before = (await linkRows(t, 'family_link')).length;
      await t.press(`[data-card="trips"] [data-trip="${EH.event}"] [data-action="send-trip-link"]`);
      await t.waitText('on this sign-up. Check your inbox.');
      const after = await linkRows(t, 'family_link');
      t.check('Send me the sign-up link queues one email to the address on the sign-up',
        before === 0 && after.length === 1 && after[0].to_emails.join() === SAM_INVITE_EMAIL, `rows ${before} -> ${after.length}`);
      await t.press(`[data-card="trips"] [data-trip="${EH.event}"] [data-action="send-trip-link"]`);
      await t.waitText('Already sent in the last hour.');
      t.eq('again within the hour: nothing more queued (1 against the 1 before)', (await linkRows(t, 'family_link')).length, 1);
      const card = (await t.text('[data-card="trips"]')) || '';
      const html = await t.page.content();
      t.check('the card shows no email address, and the page carries no hub token',
        !card.includes('@') && !Object.values(EH.tokens).some((tok) => html.includes(tok)) && card.includes('Fixture Blitz'),
        `card has @: ${card.includes('@')}`);
      await t.tapTargets('[data-card="trips"] .st-btn', 'the trip button is at least 44px on the phone');
      await t.noHScroll();
      await t.shot('family-trips');

      t.as('0023 · the family link without 0023');
      await t.open(`/family/${TOKEN}`, { persona: 'signedout', mig: ALL_BUT_0023, reset: true, ready: '[data-card="checklist"]' });
      await t.settle({ quietMs: 400 });
      t.check('without 0023 the family page opens with no trip card (0 against 1) and the rest intact',
        (await t.count('[data-card="trips"]')) === 0 && (await t.count('[data-card="checklist"]')) === 1, '');
    });
  },
};
