/**
 * /verify-hours Approve all (feedback c4f9a940, ledger 0028c, migration 0040:
 * src/VerifyHoursPage.jsx, src/loggedHoursBulk.js, the fixture port in
 * src/dev/fixture/features/hoursbulk.js).
 *
 * Claims under test, each against a presence on the same fixture:
 *  - a mentor sees one Approve all naming the pending count, which is computed
 *    here from the store (N); a student sees the staff-only line and 0 of it;
 *  - the confirm states the count and the hours of exactly the entries shown,
 *    the hours summed here from the store; Cancel writes nothing (N stay
 *    pending);
 *  - an entry reviewed elsewhere between the list loading and the confirm is
 *    not counted: N-1 approved (stamped by the mentor), the line names the one
 *    not approved, and the list re-reads to 0 cards;
 *  - a failed call (injected) reports "Not approved ... Nothing changed",
 *    leaves N pending and N cards, and the same tap then approves all N;
 *  - before 0040 the page approves through one direct UPDATE and reports the
 *    same count;
 *  - 44px targets on the phone, no sideways scroll.
 * The staff gate, the still-pending filter and the stamp are the SQL's,
 * proven by 0040_hours_bulk_approve_rls_test.sql and mutants-0040.mjs; the
 * fixture models no write-side RLS.
 */
import { P } from './_util.mjs';

const pendingRows = async (t) => (await t.rows('logged_hours')).filter((l) => l.status === 'pending');
const fmtH = (h) => String(Math.round(h * 100) / 100);
const question = (rows) => {
  const h = rows.reduce((s, l) => s + Number(l.hours), 0);
  return `Approve ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}, ${fmtH(h)} ${h === 1 ? 'hour' : 'hours'}?`;
};
const nameOf = async (t, id) => {
  const p = (await t.rows('profiles')).find((x) => x.id === id);
  return (p?.nickname || '').trim() || (p?.full_name || '').trim() || 'Member';
};
const note = (t) => t.text('.vh-hours-note');

async function openAsMentor(t, mig, reset = true) {
  await t.open('/verify-hours', { persona: 'mentor', mig, reset, ready: '.vh-body' });
  await t.waitFor('[data-entry]');
  await t.settle();
}

export default {
  async run(t) {
    // ── who sees it ─────────────────────────────────────────────────────
    t.as('0040 · the button');
    await openAsMentor(t, 'all');
    const pend = await pendingRows(t);
    const N = pend.length;
    t.check('precondition: the seed has at least 3 pending entries', N >= 3, `${N} pending`);
    t.eq('one card per pending entry, one Approve all naming the count', [await t.count('[data-entry]'), await t.count('[data-act="approve-all"]'), await t.text('[data-act="approve-all"]')], [N, 1, `Approve all ${N}`]);
    await t.tapTargets('[data-act="approve-all"]', 'Approve all at least 44px on the phone');
    await t.noHScroll();
    await t.shot('pending');

    await t.open('/verify-hours', { persona: 'student', mig: 'all', ready: '.vh-wrap' });
    t.eq('a student: the staff-only line and 0 Approve all (1 for the mentor)', [((await t.bodyText()).includes('You need a staff role')), await t.count('[data-act="approve-all"]'), await t.count('[data-entry]')], [true, 0, 0]);

    // ── confirm and cancel ──────────────────────────────────────────────
    t.as('0040 · confirm states count and hours');
    await openAsMentor(t, 'all', false);
    await t.press('[data-act="approve-all"]');
    await t.waitFor('.vh-allask');
    t.eq('the confirm states the count and hours of the entries shown', await t.text('.vh-allask .vh-bulk-count'), question(pend));
    t.eq('the confirm button names the count', await t.text('[data-act="approve-all-confirm"]'), `Approve ${N}`);
    await t.tapTargets('.vh-allask .vh-btn', 'confirm and cancel at least 44px on the phone');
    await t.shot('confirm');
    await t.press('.vh-allask .vh-reject');
    await t.settle();
    t.eq('Cancel writes nothing: the confirm closes, N still pending, N cards', [await t.count('.vh-allask'), (await pendingRows(t)).length, await t.count('[data-entry]')], [0, N, N]);

    // ── one reviewed elsewhere before the confirm ───────────────────────
    t.as('0040 · one entry reviewed elsewhere');
    await t.press('[data-act="approve-all"]');
    await t.waitFor('.vh-allask');
    const gone = pend[pend.length - 1];
    await t.evaluate((id) => window.__fx.patch('logged_hours', { id }, { status: 'rejected' }), gone.id);
    await t.press('[data-act="approve-all-confirm"]');
    await t.waitFor('.vh-hours-note');
    await t.settle();
    const after = await t.rows('logged_hours');
    const approved = after.filter((l) => pend.some((p) => p.id === l.id) && l.status === 'verified');
    const okHours = pend.slice(0, -1).reduce((s, l) => s + Number(l.hours), 0);
    t.eq('N-1 approved, each stamped by the mentor; the one reviewed elsewhere stays rejected',
      [approved.length, approved.every((l) => l.verified_by === P.mentor.id && !!l.verified_at), after.find((l) => l.id === gone.id)?.status],
      [N - 1, true, 'rejected']);
    t.eq('the line counts only what was approved and names the one that was not',
      await note(t),
      `Approved ${N - 1} ${N - 1 === 1 ? 'entry' : 'entries'}, ${fmtH(okHours)} ${okHours === 1 ? 'hour' : 'hours'}. 1 not approved: ${await nameOf(t, gone.member_id)} ${fmtH(Number(gone.hours))}h.Dismiss`);
    t.eq('the list re-reads: 0 cards, 0 Approve all (N and 1 before)', [await t.count('[data-entry]'), await t.count('[data-act="approve-all"]')], [0, 0]);
    await t.shot('partial');

    // ── a failed call ───────────────────────────────────────────────────
    t.as('0040 · a failed call');
    await openAsMentor(t, 'all');
    const pend2 = await pendingRows(t);
    await t.evaluate(() => window.__fx.failNext('staff_approve_logged_hours', { error: { code: 'XX000', message: 'Server unavailable' } }));
    await t.press('[data-act="approve-all"]');
    await t.press('[data-act="approve-all-confirm"]');
    await t.waitFor('.vh-hours-note');
    await t.settle();
    t.eq('nothing reported approved, nothing changed', [await note(t), (await pendingRows(t)).length, await t.count('[data-entry]')],
      ['Not approved (XX000): Server unavailable. Nothing changed.Dismiss', pend2.length, pend2.length]);
    t.check('the failure line is marked as a warning', (await t.count('.vh-hours-note-warn')) === 1, '');
    await t.shot('failed');
    await t.press('[data-act="approve-all"]');
    await t.press('[data-act="approve-all-confirm"]');
    await t.waitFor(() => !document.querySelector('[data-entry]'));
    await t.settle();
    const h2 = pend2.reduce((s, l) => s + Number(l.hours), 0);
    t.eq('the same tap without the failure approves all N (0 pending, against N after the failure)',
      [(await pendingRows(t)).length, await note(t), await t.count('.vh-hours-note-warn')],
      [0, `Approved ${pend2.length} entries, ${fmtH(h2)} hours.Dismiss`, 0]);

    // ── before 0040 ─────────────────────────────────────────────────────
    t.as('pre-0040 · the direct write');
    const pre = (await t.evaluate(() => window.__fx.migrationNumbers)).filter((m) => m !== '0040').join(',');
    await openAsMentor(t, pre);
    const pend3 = await pendingRows(t);
    await t.press('[data-act="approve-all"]');
    await t.press('[data-act="approve-all-confirm"]');
    await t.waitFor(() => !document.querySelector('[data-entry]'));
    await t.settle();
    const calls = await t.calls();
    const viaFn = calls.filter((c) => c.kind === 'rpc' && c.name === 'staff_approve_logged_hours');
    t.check('the function call answered missing (PGRST202), then one direct UPDATE', viaFn.length === 1 && viaFn[0].error === 'PGRST202' && calls.filter((c) => c.table === 'logged_hours' && c.kind === 'update').length === 1,
      JSON.stringify(viaFn.map((c) => c.error)));
    t.eq('all approved and the same line', [(await pendingRows(t)).length, ((await note(t)) || '').startsWith(`Approved ${pend3.length} entries`)], [0, true]);
  },
};
