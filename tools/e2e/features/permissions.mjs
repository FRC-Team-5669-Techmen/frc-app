/**
 * Per-member capabilities, migration 0004 (lane f): "Can add calendar events"
 * granted on /roster, and what it unlocks on /schedule (src/permissions.js,
 * src/SchedulePage.jsx, src/RosterPage.jsx).
 *
 * Claims under test, each in both directions:
 *  - a holder (Sam) sees "+ New event" and Edit/Delete on exactly the events
 *    they added that are not mandatory; a non-holder (Riley) sees neither, on
 *    the same fixture; staff see everything, with or without 0004;
 *  - the holder's form carries the holder note and no Mandatory toggle; the
 *    staff form the reverse; a holder's series edit counts only their rows;
 *  - a holder can create an event, and it is theirs to edit;
 *  - 0004 not applied: the holder's schedule is the non-holder's, the roster
 *    row says "Not set up yet", and nothing else on either page changes;
 *  - /roster: the grant toggle reads the grants and writes them both ways,
 *    the tag shows at 1440 and hides at 375, staff get the "already allows"
 *    note, and a grant on the roster really unlocks /schedule for that member
 *    (and a revoke really locks it again);
 *  - touch: the schedule's buttons are at least 44px at 375 and keep their
 *    small desktop size at 1440.
 *
 * The event counts come from the store (events created_by each persona, not
 * mandatory, not yet ended), so a core-seed change cannot silently move them.
 */
import { APP_PLATE } from '../../../src/plate.js';
import { P } from './_util.mjs';

async function agenda(t) {
  await t.waitFor('.sch-viewtabs');
  const tab = t.page.locator('.sch-viewtab', { hasText: 'Agenda' });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await t.press(tab);
  await t.waitFor('.sch-day, .sch-empty');
  await t.settle({ quietMs: 300 });
}

async function readAgenda(t) {
  return t.evaluate(() => [...document.querySelectorAll('.sch-event')].map((li) => ({
    title: li.querySelector('.sch-event-title')?.textContent.trim(),
    edit: !!li.querySelector('.sch-edit'),
    del: !!li.querySelector('.sch-del'),
  })));
}

async function openSchedule(t, persona, mig) {
  await t.open('/schedule', { persona, mig, ready: '.sch-viewtabs' });
  await agenda(t);
}

function upcomingOwn(events, memberId, nowMs) {
  return events.filter((e) => e.created_by === memberId && !e.mandatory && Date.parse(e.ends_at) >= nowMs).map((e) => e.title).sort();
}

async function rosterExpand(t, name) {
  const row = t.page.locator('.roster-member', { has: t.page.locator('.roster-member-name', { hasText: new RegExp(`^${name}$`) }) });
  if ((await row.locator('.roster-member-head').getAttribute('aria-expanded')) !== 'true') await t.press(row.locator('.roster-member-head'));
  await row.locator('.roster-member-detail').waitFor();
  return row;
}

async function permRow(row) {
  return row.locator('.roster-detail-row', { has: row.page().locator('.roster-detail-label', { hasText: /^Permissions$/ }) });
}

export default {
  async run(t) {
    await t.open('/_fixture', { persona: 'admin', mig: 'all', reset: true });
    const migs = await t.evaluate(() => window.__fx.migrationNumbers);
    const without0004 = migs.filter((m) => m !== '0004').join(',') || 'none';
    const nowMs = await t.evaluate(() => Date.now());
    const events = await t.rows('events');
    const samOwn = upcomingOwn(events, P.student.id, nowMs);
    t.as('oracle');
    t.eq('the store: Sam added 3 upcoming events he may change (CAD review, 2 Scouting practice)', samOwn,
      ['CAD design review (student-run)', 'Scouting practice', 'Scouting practice']);

    // ════ /schedule ════════════════════════════════════════════════════════
    const seen = {};
    for (const mig of ['all', without0004, 'none']) {
      for (const who of ['student', 'student2', 'mentor']) {
        const holder = who === 'student' && mig === 'all';
        const staff = who === 'mentor';
        t.as(`schedule · mig ${mig} · ${who}`);
        await openSchedule(t, who, mig);
        const rows = await readAgenda(t);
        const newBtn = await t.count('.sch-new-btn');
        const editable = rows.filter((r) => r.edit && r.del).map((r) => r.title).sort();
        seen[`${mig}/${who}`] = { titles: rows.map((r) => r.title), newBtn, editable };
        t.check('the agenda lists the upcoming events', rows.length >= 5, `${rows.length} events`);
        t.eq(`"+ New event": ${staff || holder ? 1 : 0}`, newBtn, staff || holder ? 1 : 0);
        if (staff) {
          t.check('staff: Edit and Delete on every event', editable.length === rows.length, `${editable.length} of ${rows.length}`);
        } else if (holder) {
          t.eq('holder: Edit and Delete on exactly the events they added that are not mandatory', editable, samOwn);
          const others = rows.filter((r) => ['Build session', 'Team photo'].includes(r.title));
          t.check('holder: none on any Build session (staff-added) or on the mandatory Team photo', others.length >= 2 && others.some((r) => r.title === 'Team photo') && others.every((r) => !r.edit && !r.del),
            `${others.filter((r) => r.edit || r.del).length} of ${others.length} editable`);
        } else {
          t.check(`0 Edit/Delete on all ${rows.length} events`, rows.every((r) => !r.edit && !r.del), `${editable.length} editable`);
        }
        t.eq('no error banner', await t.count('.sch-error'), 0);
        if (holder || staff) {
          await t.press('.sch-new-btn');
          await t.waitFor('.sch-form');
          const form = {
            note: await t.text('.sch-holder-note'),
            mandatory: await t.page.locator('.sch-form .sch-toggle', { hasText: 'Mandatory' }).count(),
          };
          if (holder) {
            t.eq('holder form: the holder note, and no Mandatory toggle (1 for staff)', form,
              { note: 'You can add events, and edit or delete the ones you added. Only staff can make an event mandatory.', mandatory: 0 });
          } else {
            t.eq('staff form: the Mandatory toggle, no holder note', form, { note: null, mandatory: 1 });
          }
          await t.press(t.page.locator('.sch-form .sch-cancel'));
        }
        if (holder) {
          await t.press(t.page.locator('.sch-event', { hasText: 'Scouting practice' }).first().locator('.sch-edit'));
          await t.waitFor('.sch-scope');
          t.eq('holder: editing a Scouting practice offers "Whole series (2)"', (await t.texts('.sch-scope-opt'))[1], 'Whole series (2)');
          await t.press(t.page.locator('.sch-form .sch-cancel'));
        }
        if (t.isPhone && staff && mig === 'all') {
          await t.tapTargets('.sch-new-btn, .sch-edit, .sch-del', 'touch: "+ New event", Edit and Delete at least 44px');
          await t.noHScroll();
          await t.shot('schedule-mentor');
        }
        if (!t.isPhone && staff && mig === 'all') {
          const h = await t.evaluate(() => [...document.querySelectorAll('.sch-edit, .sch-del')].map((b) => b.getBoundingClientRect().height));
          // Two designs, one per state of the shape language (src/plate.js):
          // without it, Edit/Delete grow to 44px on a coarse pointer only; with
          // it, the plate's 44px floor holds at every width. Which one ships is
          // read off <html>, so the check follows the constant both ways.
          const plated = await t.evaluate((cls) => !!cls && document.documentElement.classList.contains(cls), APP_PLATE);
          const range = `${h.length} buttons, ${Math.round(Math.min(...h))}-${Math.round(Math.max(...h))}px`;
          if (plated) t.check(`desktop, plate on: Edit/Delete keep the 44px floor`, h.length > 0 && Math.min(...h) >= 44, range);
          else t.check('desktop, plate off: Edit/Delete keep their small size', h.length > 0 && Math.max(...h) < 44, range);
        }
        if (holder) {
          await t.noHScroll();
          await t.shot('schedule-holder');
        }
      }
    }
    t.as('schedule · comparison');
    for (const mig of [without0004, 'none']) {
      t.eq(`without 0004 (mig ${mig}) the holder sees exactly what a non-holder sees`, seen[`${mig}/student`], seen[`${mig}/student2`]);
      t.eq(`without 0004 (mig ${mig}) staff see exactly what they see with it`, seen[`${mig}/mentor`], seen['all/mentor']);
    }
    t.check('positive control: with 0004 the holder does NOT see what a non-holder sees', JSON.stringify(seen['all/student']) !== JSON.stringify(seen['all/student2']),
      `holder ${seen['all/student'].editable.length} editable + ${seen['all/student'].newBtn} new, non-holder ${seen['all/student2'].editable.length} + ${seen['all/student2'].newBtn}`);

    // ── a holder creates an event, and it is theirs ──
    t.as('schedule · mig all · student creates');
    await openSchedule(t, 'student', 'all');
    await t.press('.sch-new-btn');
    await t.waitFor('.sch-form');
    await t.page.fill('.sch-form input[placeholder="Build session"]', 'Sam\'s CAD lab');
    await t.page.selectOption('.sch-form select', 'meeting');
    await t.page.fill('.sch-form input[type="datetime-local"] >> nth=0', '2026-10-06T15:30');
    await t.page.fill('.sch-form input[type="datetime-local"] >> nth=1', '2026-10-06T17:00');
    await t.press('.sch-form .sch-save');
    await t.page.waitForSelector('.sch-form', { state: 'detached' });
    await t.settle();
    const created = (await t.rows('events')).find((e) => e.title === 'Sam\'s CAD lab');
    t.check('the event is stored as the holder\'s, never mandatory', !!created && created.created_by === P.student.id && created.mandatory === false && created.kind === 'meeting',
      JSON.stringify(created && { created_by: created.created_by === P.student.id ? 'student' : created.created_by, mandatory: created.mandatory, kind: created.kind }));
    const mine = (await readAgenda(t)).find((r) => r.title === 'Sam\'s CAD lab');
    t.check('and it carries Edit/Delete for its author', !!mine && mine.edit && mine.del, JSON.stringify(mine));
    await openSchedule(t, 'student2', 'all');
    const theirs = (await readAgenda(t)).find((r) => r.title === 'Sam\'s CAD lab');
    t.check('positive control: a non-holder sees the new event with no Edit/Delete', !!theirs && !theirs.edit && !theirs.del, JSON.stringify(theirs));

    // ════ /roster ══════════════════════════════════════════════════════════
    t.as('roster · mig all · admin');
    await t.open('/roster', { persona: 'admin', mig: 'all', ready: '.roster-list' });
    await t.settle();
    const tagsInDom = await t.count('.roster-perm-tag');
    const tagsShown = await t.visibleCount('.roster-perm-tag');
    t.eq('one "Adds events" tag in the collapsed list (Sam\'s)', { dom: tagsInDom, text: await t.texts('.roster-perm-tag') }, { dom: 1, text: ['Adds events'] });
    t.eq(t.isPhone ? 'at 375 the tag is hidden' : 'at 1440 the tag is shown', tagsShown, t.isPhone ? 0 : 1);
    const sam = await rosterExpand(t, 'Sam');
    const detailLabels = await sam.locator('.roster-detail-label').allTextContents();
    t.check('Sam\'s detail rows include Roles, Permissions, Status and Geo exempt', ['Roles', 'Permissions', 'Status', 'Geo exempt'].every((l) => detailLabels.includes(l)), detailLabels.join(', '));
    const samBtn = (await permRow(sam)).locator('.roster-perm-toggle');
    t.eq('Sam: "Can add calendar events" pressed', { label: (await samBtn.textContent())?.trim(), pressed: await samBtn.getAttribute('aria-pressed') }, { label: 'Can add calendar events', pressed: 'true' });
    const riley = await rosterExpand(t, 'Riley');
    const rileyBtn = (await permRow(riley)).locator('.roster-perm-toggle');
    t.eq('Riley: not pressed', await rileyBtn.getAttribute('aria-pressed'), 'false');
    const max = await rosterExpand(t, 'Coach Max');
    const maxPerm = await permRow(max);
    t.eq('a mentor: the toggle plus "Their staff role already allows this."', { toggles: await maxPerm.locator('.roster-perm-toggle').count(), note: (await maxPerm.locator('.roster-perm-note').textContent())?.trim() },
      { toggles: 1, note: 'Their staff role already allows this.' });
    t.eq('positive control: no staff note for a student', await (await permRow(sam)).locator('.roster-perm-note').count(), 0);
    await t.press(rileyBtn);
    await t.page.waitForFunction(() => document.querySelectorAll('.roster-perm-tag').length === 2);
    await t.settle();
    const granted = (await t.rows('member_permissions')).filter((r) => r.member_id === P.student2.id && r.capability === 'events.create').length;
    t.check('granting Riley: pressed, a second tag, and a stored grant', (await rileyBtn.getAttribute('aria-pressed')) === 'true' && granted === 1,
      `pressed ${await rileyBtn.getAttribute('aria-pressed')}, ${await t.count('.roster-perm-tag')} tags, ${granted} grant row(s)`);
    await t.shot('roster-granted');

    t.as('roster grant → schedule · student2');
    await openSchedule(t, 'student2', 'all');
    t.eq('the grant unlocks "+ New event" for Riley', await t.count('.sch-new-btn'), 1);

    t.as('roster · mig all · admin revokes');
    await t.open('/roster', { persona: 'admin', mig: 'all', ready: '.roster-list' });
    await t.settle();
    const riley2 = await rosterExpand(t, 'Riley');
    const rileyBtn2 = (await permRow(riley2)).locator('.roster-perm-toggle');
    await t.press(rileyBtn2);
    await t.page.waitForFunction(() => document.querySelectorAll('.roster-perm-tag').length === 1);
    await t.settle();
    t.check('revoking Riley: unpressed, one tag, no grant row', (await rileyBtn2.getAttribute('aria-pressed')) === 'false'
      && (await t.rows('member_permissions')).filter((r) => r.member_id === P.student2.id).length === 0, `pressed ${await rileyBtn2.getAttribute('aria-pressed')}`);
    t.as('roster revoke → schedule · student2');
    await openSchedule(t, 'student2', 'all');
    t.eq('the revoke locks "+ New event" again', await t.count('.sch-new-btn'), 0);

    for (const mig of [without0004, 'none']) {
      t.as(`roster · mig ${mig} · admin`);
      await t.open('/roster', { persona: 'admin', mig, ready: '.roster-list' });
      await t.settle();
      const s = await rosterExpand(t, 'Sam');
      const perm = await permRow(s);
      t.eq('Permissions row says Not set up yet, naming the file', (await perm.locator('.roster-perm-unset').textContent())?.trim(),
        'Not set up yet. Apply supabase/migrations/0004_member_permissions.sql to grant these.');
      t.eq('0 toggles and 0 tags (1 and 1 with 0004), no page error', { toggles: await t.count('.roster-perm-toggle'), tags: await t.count('.roster-perm-tag'), err: await t.count('.roster-page-error') },
        { toggles: 0, tags: 0, err: 0 });
      t.eq('the rest of the member detail is unchanged (the same rows as with 0004)', await s.locator('.roster-detail-label').allTextContents(), detailLabels);
      if (mig === 'none') {
        await t.noHScroll();
        await t.shot('roster-mig-none');
      }
    }

    for (const who of ['mentor', 'student']) {
      t.as(`roster · ${who}`);
      await t.open('/roster', { persona: who, mig: 'all', ready: '.roster-denied, .roster-list' });
      t.eq('the existing admin-only sentence', { denied: await t.text('.roster-denied'), list: await t.count('.roster-list') }, { denied: 'You need the admin role to view this page.', list: 0 });
    }
  },
};
