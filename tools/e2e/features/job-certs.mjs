/**
 * The IDEA certifications cutover (ledger 0006, decision 27 answered
 * 2026-10-14): job claiming gated on the IDEA mirror (migration 0012,
 * src/jobCerts.js, src/JobsPage.jsx), the old skills pages retired to
 * redirects, the /certifications proof links and the admin sync-log export
 * (decision 34). Fixture plugin: src/dev/fixture/features/jobcerts.js.
 *
 * Claims under test, each in both directions:
 *  - 0012 applied: a job names an IDEA code; a member who holds it (active,
 *    unexpired, by sign-in email) gets Claim, one who does not gets the lock
 *    and the ideabosco link; an unmapped job is claimable without the old
 *    skill; the claim RPC itself refuses a member without the code; an ADMIN
 *    sets the code from the IDEA catalog and the member who holds it can then
 *    claim, while a mentor and a student see no picker;
 *  - 0012 NOT applied: the Jobs page is the old path, unchanged (skill chips,
 *    "Needs one of", the old badges), and no IDEA control renders;
 *  - /skills, /certify, /coverage and /study land on /certifications for a
 *    student and a mentor, and no link to them renders, against the links to
 *    /certifications that do;
 *  - /certifications: one verify link per holder row, each to
 *    ideabosco.com/certifications/verify?serial=<serial>, and the
 *    earned-only-at-IDEA line; the export button for an admin only, and its
 *    zip holds README + JSON + CSV with every row in the store;
 *  - the dashboard's Certifications tile counts the IDEA codes Sam holds.
 */
import { readFile } from 'node:fs/promises';
import { P, readZip } from './_util.mjs';

const WITHOUT_0012 = '0001,0002,0003,0004,0005,0006,0007,0008,0009,0010,0011';
const RETIRED = ['/skills', '/certify', '/coverage', '/study'];
const TITLE = {
  j1: 'Rebuild the swerve module gearboxes',
  j2: 'Wire the practice bot PDH',
  j3: 'Autonomous path for the two-piece routine',
  j4: 'CAD the new intake roller bracket',
  j5: 'Cut bumper plywood',
  j8: 'Scouting sheet for SoCal Showdown',
};
const TASK = (n) => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Held = active and not past its expiry, by email, at `now` (ms).
function oracleHeld(holders, email, now) {
  return new Set(holders.filter((h) => h.email === email && h.status === 'active'
    && !(h.expires_at && Date.parse(h.expires_at) <= now)).map((h) => h.code));
}

async function openJob(t, title) {
  await t.press(t.page.locator('li.jobs-row', { hasText: title }).first());
  await t.waitFor('.jobs-detail');
  await t.settle();
}
async function closeJob(t) {
  await t.press('.jobs-detail-close');
  await t.page.waitForSelector('.jobs-detail', { state: 'detached' });
}

export default {
  async run(t) {
    await t.open('/_fixture', { persona: 'student', mig: 'all', reset: true });
    const now = await t.evaluate(() => Date.now());

    // ── 0012 applied · student (Sam) ─────────────────────────────────────────
    t.as('0012 applied · student');
    await t.open('/jobs', { persona: 'student', mig: 'all', ready: 'li.jobs-row' });
    const reqs = await t.rows('task_idea_cert_requirements');
    const held = oracleHeld(await t.rows('idea_cert_holders'), P.student.email, now);
    const coded = reqs.filter((r) => r.code);
    const badges = await t.texts('[data-testid=jobs-row-idea]');
    t.check('one IDEA badge per job that names a code (oracle from the store)', badges.length === coded.length && coded.length === 4,
      `${badges.length} badges, ${coded.length} coded jobs`);
    const lockedBadges = await t.count('[data-testid=jobs-row-idea].locked');
    const wantLocked = coded.filter((r) => !held.has(r.code)).length;
    t.check('badges lock exactly the codes Sam does not hold', lockedBadges === wantLocked && wantLocked === 3,
      `${lockedBadges} locked, oracle ${wantLocked}; Sam holds ${[...held].sort().join(', ')}`);
    t.eq('no old skill badges on the IDEA path', await t.count('.jobs-row-cert:not([data-testid=jobs-row-idea])'), 0);
    await t.noHScroll();
    await t.shot('idea-student-list');

    await t.step('a job whose code Sam lacks is locked, with the IDEA link', async () => {
      await openJob(t, TITLE.j2);
      const lock = await t.text('[data-testid=jobs-locked]');
      t.check('lock names the IDEA code', lock === '🔒 Needs IDEA ELEC-1', `"${lock}"`);
      t.eq('no Claim button', await t.count('.jobs-detail .jobs-btn-claim'), 0);
      t.eq('requirement says you do not hold it', await t.text('[data-testid=jobs-idea-req-state]'), 'You do not hold it');
      t.eq('ideabosco link present', await t.count('[data-testid=jobs-idea-req] a[href="https://ideabosco.com/certifications"]'), 1);
      await t.shot('idea-student-locked', { full: false });
      await closeJob(t);
    });
    for (const [title, code, why] of [[TITLE.j3, 'MILL-2', 'suspended'], [TITLE.j5, 'SAFE-2', 'active but expired']]) {
      await t.step(`a ${why} holding does not unlock ${code}`, async () => {
        await openJob(t, title);
        t.check(`${code} (${why}) locked, no Claim`, (await t.text('[data-testid=jobs-locked]')) === `🔒 Needs IDEA ${code}`
          && (await t.count('.jobs-detail .jobs-btn-claim')) === 0, await t.text('[data-testid=jobs-locked]'));
        await closeJob(t);
      });
    }
    await t.step('the claim RPC itself refuses Sam without ELEC-1', async () => {
      const before = (await t.rows('task_claims')).filter((c) => c.task_id === TASK(2) && c.member_id === P.student.id).length;
      const res = await t.evaluate((id) => window.__fx.supabase.rpc('claim_task', { p_task: id }).then((r) => r.error?.code ?? null), TASK(2));
      const after = (await t.rows('task_claims')).filter((c) => c.task_id === TASK(2) && c.member_id === P.student.id).length;
      t.check('refused 42501, no claim row', res === '42501' && before === 0 && after === 0, `error ${res}, claims ${before} -> ${after}`);
    });
    await t.step('an unmapped job (old Scouting app requirement) is claimable without the old skill', async () => {
      await openJob(t, TITLE.j8);
      t.eq('no requirement block', await t.count('[data-testid=jobs-idea-req]'), 0);
      t.eq('Claim button present', await t.count('.jobs-detail .jobs-btn-claim'), 1);
      await t.press('.jobs-detail .jobs-btn-claim');
      await t.settle();
      const mine = (await t.rows('task_claims')).filter((c) => c.task_id === TASK(8) && c.member_id === P.student.id);
      t.check('Sam now holds a claim on it', mine.length === 1 && mine[0].status === 'claimed', JSON.stringify(mine.map((c) => c.status)));
      await closeJob(t);
    });
    await t.step('the student form shows the requirement read-only, no picker', async () => {
      await t.press('.jobs-add-btn');
      await t.waitFor('.jobs-form-card');
      t.check('IDEA field read-only, 0 pickers', (await t.count('[data-testid=jobs-idea-cert-readonly]')) === 1 && (await t.count('#job-cert')) === 0,
        `${await t.count('[data-testid=jobs-idea-cert-readonly]')} read-only, ${await t.count('#job-cert')} pickers`);
      t.eq('no old skill chips', await t.count('.jobs-skill-chip'), 0);
    });

    // ── 0012 applied · admin sets a code, mentor cannot ──────────────────────
    t.as('0012 applied · admin');
    await t.open('/jobs', { persona: 'admin', mig: 'all', ready: 'li.jobs-row' });
    await t.step('an admin sets job 2 to SAFE-1 from the IDEA catalog', async () => {
      await openJob(t, TITLE.j2);
      await t.press(t.page.locator('.jobs-detail .jobs-link-btn', { hasText: 'Edit' }));
      await t.waitFor('#job-cert');
      const opts = await t.evaluate(() => [...document.querySelectorAll('#job-cert option')].map((o) => o.value));
      const active = (await t.rows('idea_cert_catalog')).filter((c) => c.active !== false).map((c) => c.code);
      t.check('picker offers None plus every active catalog code, no retired one',
        opts[0] === '' && opts.length === active.length + 1 && active.every((c) => opts.includes(c)) && !opts.includes('WELD-3'),
        `${opts.join(',')} against active ${active.join(',')}`);
      t.check('picker starts on the current code', (await t.evaluate(() => document.querySelector('#job-cert').value)) === 'ELEC-1', '');
      await t.page.selectOption('#job-cert', 'SAFE-1');
      await t.press('.jobs-form-card button[type=submit]');
      await t.page.waitForSelector('.jobs-form-card', { state: 'detached' });
      await t.settle();
      const row = (await t.rows('task_idea_cert_requirements')).find((r) => r.task_id === TASK(2));
      t.check('requirement row now SAFE-1, source admin, set by the admin', row?.code === 'SAFE-1' && row?.source === 'admin' && row?.set_by === P.admin.id,
        JSON.stringify(row));
    });

    t.as('0012 applied · mentor');
    await t.open('/jobs', { persona: 'mentor', mig: 'all', ready: 'li.jobs-row' });
    await t.step('a mentor edits a job and sees no picker', async () => {
      await openJob(t, TITLE.j2);
      await t.press(t.page.locator('.jobs-detail .jobs-link-btn', { hasText: 'Edit' }));
      await t.waitFor('.jobs-form-card');
      t.check('0 pickers for a mentor (1 for the admin above), read-only text names SAFE-1',
        (await t.count('#job-cert')) === 0 && /SAFE-1/.test(await t.text('[data-testid=jobs-idea-cert-readonly]') ?? ''),
        `${await t.count('#job-cert')} pickers, "${await t.text('[data-testid=jobs-idea-cert-readonly]')}"`);
      const rpc = await t.evaluate((id) => window.__fx.supabase.rpc('admin_set_task_cert', { p_task: id, p_code: null }).then((r) => r.error?.code ?? 'ok'), TASK(2));
      const row = (await t.rows('task_idea_cert_requirements')).find((r) => r.task_id === TASK(2));
      t.check('the RPC refuses a mentor 42501 and the code stays', rpc === '42501' && row?.code === 'SAFE-1', `${rpc}, code ${row?.code}`);
    });

    t.as('0012 applied · student after the admin change');
    await t.open('/jobs', { persona: 'student', mig: 'all', ready: 'li.jobs-row' });
    await t.step('Sam holds SAFE-1, so job 2 is now claimable and the claim lands', async () => {
      await openJob(t, TITLE.j2);
      t.eq('requirement says you hold it', await t.text('[data-testid=jobs-idea-req-state]'), 'You hold it ✓');
      await t.press('.jobs-detail .jobs-btn-claim');
      await t.settle();
      const mine = (await t.rows('task_claims')).filter((c) => c.task_id === TASK(2) && c.member_id === P.student.id);
      t.eq('one claim row for Sam on job 2', mine.length, 1);
      await closeJob(t);
    });
    t.as('0012 applied · student2');
    await t.open('/jobs', { persona: 'student2', mig: 'all', ready: 'li.jobs-row' });
    await t.step('Riley (SAFE-1 held, SAFE-2 not) is locked on job 5 and not locked on job 2', async () => {
      await openJob(t, TITLE.j5);
      t.eq('job 5 locked for Riley', await t.text('[data-testid=jobs-locked]'), '🔒 Needs IDEA SAFE-2');
      await closeJob(t);
      // Job 2 is solo and Sam has just filled it, so it reads Full; what the
      // gate decides is the requirement state, not the capacity.
      await openJob(t, TITLE.j2);
      t.check('job 2: Riley holds SAFE-1, and the only reason for no Claim is that it is full',
        (await t.text('[data-testid=jobs-idea-req-state]')) === 'You hold it ✓' && (await t.count('[data-testid=jobs-locked]')) === 0
          && (await t.text('.jobs-detail .jobs-card-actions .jobs-note')) === 'Full',
        `"${await t.text('[data-testid=jobs-idea-req-state]')}", ${await t.count('[data-testid=jobs-locked]')} locks, note "${await t.text('.jobs-detail .jobs-card-actions .jobs-note')}"`);
      await closeJob(t);
    });

    // ── 0012 NOT applied: the old path, unchanged ────────────────────────────
    t.as('0012 not applied · student');
    await t.open('/_fixture', { persona: 'student', mig: WITHOUT_0012, reset: true });
    await t.open('/jobs', { persona: 'student', mig: WITHOUT_0012, ready: 'li.jobs-row' });
    const oldBadges = await t.count('.jobs-row-cert');
    t.check('old skill badges render, IDEA badges do not', oldBadges > 0 && (await t.count('[data-testid=jobs-row-idea]')) === 0,
      `${oldBadges} old badges, ${await t.count('[data-testid=jobs-row-idea]')} IDEA badges (4 with 0012)`);
    const reqCall = (await t.calls()).filter((c) => c.table === 'task_idea_cert_requirements');
    t.check('the page asked for the requirement table and got PGRST205', reqCall.length > 0 && reqCall.every((c) => c.error === 'PGRST205' || c.code === 'PGRST205'),
      JSON.stringify(reqCall.map((c) => c.error ?? c.code)));
    await t.step('old gate on job 8: Sam lacks Scouting app', async () => {
      await openJob(t, TITLE.j8);
      t.eq('old lock text', await t.text('[data-testid=jobs-locked]'), '🔒 Needs one of: Scouting app');
      t.eq('no IDEA requirement block', await t.count('[data-testid=jobs-idea-req]'), 0);
      await closeJob(t);
    });
    await t.step('the old form: skill chips, no IDEA field', async () => {
      await t.press('.jobs-add-btn');
      await t.waitFor('.jobs-form-card');
      t.check('skill chips present, IDEA field absent', (await t.count('.jobs-skill-chip')) > 0 && (await t.count('[data-testid=jobs-idea-cert-field]')) === 0,
        `${await t.count('.jobs-skill-chip')} chips, ${await t.count('[data-testid=jobs-idea-cert-field]')} IDEA fields`);
    });
    t.as('0012 not applied · admin');
    await t.open('/jobs', { persona: 'admin', mig: WITHOUT_0012, ready: 'li.jobs-row' });
    await t.step('no picker for an admin before 0012', async () => {
      await t.press('.jobs-add-btn');
      await t.waitFor('.jobs-form-card');
      t.eq('0 IDEA pickers before 0012', await t.count('#job-cert'), 0);
    });

    // ── Retired addresses ────────────────────────────────────────────────────
    for (const who of ['student', 'mentor']) {
      t.as(`retired addresses · ${who}`);
      for (const p of RETIRED) {
        await t.open(p, { persona: who, mig: 'all', ready: 'h1.ic-title' });
        const where = await t.evaluate(() => location.pathname);
        t.eq(`${p} lands on /certifications`, where, '/certifications');
      }
      await t.open('/dashboard', { persona: who, mig: 'all', ready: '.navbar, nav' });
      const dead = await t.evaluate((paths) => paths.map((p) => document.querySelectorAll(`a[href="${p}"]`).length).reduce((a, b) => a + b, 0), RETIRED);
      let live = await t.count('a[href="/certifications"]');
      // Certifications left the top bar for the Robot hub (ledger 0017): the
      // positive control counts the Home tile and the Robot tile.
      await t.open('/robot', { persona: who, mig: 'all', ready: '.hub-tile' });
      const deadRobot = await t.evaluate((paths) => paths.map((p) => document.querySelectorAll(`a[href="${p}"]`).length).reduce((a, b) => a + b, 0), RETIRED);
      live += await t.count('a[href="/certifications"]');
      t.check('0 links to a retired address on Home and Robot, against the links to /certifications', dead + deadRobot === 0 && live >= 2,
        `${dead + deadRobot} retired links, ${live} /certifications links`);
    }

    // ── Dashboard tile ───────────────────────────────────────────────────────
    t.as('dashboard · student');
    await t.open('/dashboard', { persona: 'student', mig: 'all', ready: '[data-testid=mb-certs-tile]' });
    const heldNow = oracleHeld(await t.rows('idea_cert_holders'), P.student.email, now);
    t.eq('the tile counts the IDEA codes Sam holds (oracle)', await t.text('[data-testid=mb-certs-tile] .mb-tile-big'), String(heldNow.size));

    // ── /certifications: proof links, the earned line, the export ────────────
    t.as('certifications · student');
    await t.open('/certifications', { persona: 'student', mig: 'all', ready: '[data-testid=ic-mine]' });
    const mineRows = await t.evaluate(() => [...document.querySelectorAll('[data-testid=ic-mine] .ic-holder')].map((li) => ({
      serial: li.dataset.serial,
      href: li.querySelector('[data-testid=ic-verify]')?.getAttribute('href') ?? null,
    })));
    t.check('one verify link per holder row, to ideabosco verify?serial=<serial>',
      mineRows.length === 4 && mineRows.every((r) => r.href === `https://ideabosco.com/certifications/verify?serial=${encodeURIComponent(r.serial)}`),
      JSON.stringify(mineRows));
    t.check('the earned-only-at-IDEA line, with its link', /earned and awarded only at ideabosco\.com\/certifications/.test(await t.text('[data-testid=ic-earned]') ?? '')
      && (await t.count('[data-testid=ic-earned] a[href="https://ideabosco.com/certifications"]')) === 1, await t.text('[data-testid=ic-earned]'));
    t.eq('no export button for a student', await t.count('[data-testid=ic-export]'), 0);

    t.as('certifications · mentor');
    await t.open('/certifications', { persona: 'mentor', mig: 'all', ready: '[data-testid=ic-sync]' });
    t.eq('no export button for a mentor (staff, not admin)', await t.count('[data-testid=ic-export]'), 0);

    t.as('certifications · admin');
    await t.open('/certifications', { persona: 'admin', mig: 'all', ready: '[data-testid=ic-export]' });
    t.eq('one export button for an admin', await t.count('[data-testid=ic-export] button'), 1);
    await t.tapTargets('[data-testid=ic-export] button', 'export button at least 44px');
    await t.step('Export sync log downloads README + JSON + CSV with every row', async () => {
      const log = await t.rows('idea_cert_sync_log');
      const [dl] = await Promise.all([
        t.page.waitForEvent('download', { timeout: 20_000 }),
        t.press(t.page.getByRole('button', { name: 'Export sync log' })),
      ]);
      const bytes = await readFile(await dl.path());
      const entries = readZip(bytes);
      const byBase = Object.fromEntries(entries.map((e) => [e.name.split('/').at(-1), e]));
      const json = JSON.parse(byBase['sync-log.json'].data.toString('utf8'));
      const csvLines = byBase['sync-log.csv'].data.toString('utf8').replace(/^﻿/, '').trim().split('\r\n');
      t.check('zip named idea-cert-sync-log-*.zip with exactly README.txt, sync-log.json, sync-log.csv',
        /^idea-cert-sync-log-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/.test(dl.suggestedFilename()) && Object.keys(byBase).sort().join() === 'README.txt,sync-log.csv,sync-log.json',
        `${dl.suggestedFilename()}: ${Object.keys(byBase).sort().join(', ')}`);
      t.check('JSON and CSV each hold every log row in the store (oracle)', json.length === log.length && csvLines.length === log.length + 1 && log.length >= 2,
        `json ${json.length}, csv ${csvLines.length - 1}, store ${log.length}`);
      t.check('README counts accepted and refused', byBase['README.txt'].data.toString('utf8').includes(`${log.length} row(s): ${log.filter((r) => r.ok).length} accepted, ${log.filter((r) => !r.ok).length} refused.`), '');
      t.check('the page says what it downloaded', /^Downloaded idea-cert-sync-log-.*\.zip: \d+ rows?/.test(await t.text('.ic-export-note') ?? ''), await t.text('.ic-export-note'));
    });
    await t.shot('certifications-admin');

    t.as('certifications · admin · mirror not applied');
    await t.open('/certifications', { persona: 'admin', mig: 'none', ready: '.ic-empty' });
    t.check('no export when the mirror does not exist, the earned line still shows', (await t.count('[data-testid=ic-export]')) === 0
      && (await t.count('[data-testid=ic-earned]')) === 1, `${await t.count('[data-testid=ic-export]')} export, ${await t.count('[data-testid=ic-earned]')} earned line`);

    t.consoleCheck();
  },
};
