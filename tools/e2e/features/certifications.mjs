/**
 * /certifications -- the read-only IDEA certifications mirror (lane a,
 * migration 0001, src/CertificationsPage.jsx + src/ideaCerts.js).
 *
 * Claims under test, each in both directions:
 *  - mig none: ONLY the not-set-up line, for every persona -- against the
 *    ready page for the same persona with 0001 applied;
 *  - mig all: the catalog grouped by category; holder counts that count only
 *    ACTIVE, UNEXPIRED rows (suspended, revoked, expired and lapsed-active are
 *    shown and never counted), checked against a count computed here from the
 *    store; "Your certifications" matched by sign-in email; a parent sees
 *    only the linked student's rows and no team counts; staff see the sync
 *    line, members do not;
 *  - the page never writes and never calls an RPC.
 *
 * SEED NOTE (a fixture defect, reported, not an app defect): features/a.js
 * keys the student personas' holder rows by fallback emails
 * (student@fixture.techmen.test) because the engine passes no persona emails,
 * so on the seed as shipped "Your certifications" reads 0 held for Sam. That
 * is asserted below as the NEGATIVE half of the email-matching claim; the
 * spec then re-keys those rows to the personas' real sign-in emails (the
 * test owning its precondition, as checkin.mjs does) and asserts the
 * positive half.
 */
import { P } from './_util.mjs';

const NOT_SYNCED_LINE = 'Certifications are awarded in IDEA Classroom. None have synced to this app yet.';
const PERSONAS = ['student', 'student2', 'mentor', 'admin', 'parent'];
const SEED_EMAIL = { student: 'student@fixture.techmen.test', student2: 'student2@fixture.techmen.test' };

// Held = status active and not past its expiry, at `now` (ms).
function oracleCounts(holders, now) {
  const by = new Map();
  for (const h of holders) {
    const exp = h.expires_at ? Date.parse(h.expires_at) : NaN;
    const held = h.status === 'active' && !(Number.isFinite(exp) && exp <= now);
    if (!held) continue;
    if (!by.has(h.code)) by.set(h.code, new Set());
    by.get(h.code).add(String(h.email).toLowerCase());
  }
  return by;
}

async function pageCounts(t) {
  return t.evaluate(() => Object.fromEntries([...document.querySelectorAll('.ic-cert')].map((li) => [
    li.dataset.code,
    (li.querySelector('[data-testid=ic-count]')?.textContent || '').trim() || null,
  ])));
}

// The mirror calls the page made. Dev mode runs React StrictMode, which runs
// the load effect twice (the first run's answer is discarded by its `active`
// guard), so the honest claim is "these tables, each read the same number of
// times, and nothing else" -- not "exactly one select each".
async function mirrorCalls(t) {
  const calls = await t.calls();
  const mine = calls.filter((c) => (c.table && c.table.startsWith('idea_cert')) || (c.kind === 'rpc' && /^idea_cert/.test(c.name)));
  const per = {};
  for (const c of mine.filter((x) => x.kind === 'select')) per[c.table] = (per[c.table] ?? 0) + 1;
  const runs = [...new Set(Object.values(per))];
  return {
    tables: Object.keys(per).sort(),
    sameCountEach: runs.length === 1 && runs[0] >= 1 && runs[0] <= 2,
    other: mine.filter((c) => c.kind !== 'select').map((c) => `${c.kind}:${c.table ?? c.name}`),
  };
}

export default {
  async run(t) {
    // ── migration 0001 NOT applied: one calm line, for every persona ───────
    await t.open('/_fixture', { persona: 'student', mig: 'none', reset: true });
    for (const who of PERSONAS) {
      t.as(`mig none · ${who}`);
      await t.open('/certifications', { persona: who, mig: 'none', ready: 'h1.ic-title' });
      await t.waitFor('.ic-empty, .ic-error, .ic-cert').catch(() => {});
      await t.settle();
      const empty = await t.count('.ic-empty[data-state="not-set-up"]');
      const line = await t.text('.ic-empty');
      t.check('exactly 1 not-set-up line with the plain sentence', empty === 1 && line === NOT_SYNCED_LINE, `${empty} .ic-empty[data-state=not-set-up]: "${line}"`);
      const absent = {};
      for (const sel of ['.ic-lede', '[data-testid=ic-mine]', '[data-testid=ic-student]', '[data-testid=ic-catalog]', '[data-testid=ic-sync]', '.ic-error', '.ic-cert']) {
        absent[sel] = await t.count(sel);
      }
      t.check('nothing else renders (lede, mine, student, catalog, sync, error, certs)', Object.values(absent).every((n) => n === 0), JSON.stringify(absent));
      t.eq('h1 reads Certifications', await t.text('h1.ic-title'), 'Certifications');
      if (who === 'student') {
        await t.noHScroll();
        await t.shot('mig-none-student');
      }
    }

    // ── migration 0001 applied, the seed as shipped ────────────────────────
    t.as('mig all · student · seed emails');
    await t.open('/certifications', { persona: 'student', mig: 'all', ready: '[data-testid=ic-catalog]' });
    const seedMine = await t.text('[data-testid=ic-mine] .ic-section-count');
    const seedRows = await t.count('[data-testid=ic-mine] .ic-holder');
    const seedKeyedElsewhere = (await t.rows('idea_cert_holders')).filter((h) => h.email === SEED_EMAIL.student).length;
    t.check('a holder row under ANOTHER email is not "yours" (negative half of email matching)',
      seedMine === '0 held' && seedRows === 0 && seedKeyedElsewhere === 4,
      `"${seedMine}", ${seedRows} rows, while ${seedKeyedElsewhere} rows sit under ${SEED_EMAIL.student} (features/a.js fallback, not Sam's ${P.student.email})`);

    // Re-key the two student personas' rows to their real sign-in emails.
    const rekeyed = await t.evaluate(({ map }) => {
      let n = 0;
      for (const [from, to] of map) n += window.__fx.patch('idea_cert_holders', { email: from }, { email: to });
      return n;
    }, { map: [[SEED_EMAIL.student, P.student.email], [SEED_EMAIL.student2, P.student2.email]] });
    t.eq('precondition: 7 holder rows re-keyed to the personas\' sign-in emails', rekeyed, 7);

    const holders = await t.rows('idea_cert_holders');
    const catalog = await t.rows('idea_cert_catalog');
    const nowMs = await t.evaluate(() => Date.now());
    const oracle = oracleCounts(holders, nowMs);
    const expectedCounts = Object.fromEntries(catalog.map((c) => {
      const n = oracle.get(c.code)?.size ?? 0;
      return [c.code, `${n} ${n === 1 ? 'holder' : 'holders'}`];
    }));

    // ── student ──
    t.as('mig all · student');
    await t.open('/certifications', { persona: 'student', mig: 'all', ready: '[data-testid=ic-catalog]' });
    t.check('lede present', (await t.count('.ic-lede')) === 1, `${await t.count('.ic-lede')} .ic-lede`);
    t.eq('"Your certifications" counts 2 held', await t.text('[data-testid=ic-mine] .ic-section-count'), '2 held');
    t.eq('4 rows of my own, pills Active, Active, Suspended, Expired (0004 is active but past its expiry)',
      await t.texts('[data-testid=ic-mine] .ic-holder .ic-pill'), ['Active', 'Active', 'Suspended', 'Expired']);
    t.eq('matched-by line names the sign-in email', await t.text('[data-testid=ic-mine] .ic-note'), `Matched by your sign-in email, ${P.student.email}.`);
    t.eq('catalog grouped Safety, Mechanical, Machining, Electrical (textContent)', await t.texts('[data-testid=ic-catalog] .ic-cat'), ['Safety', 'Mechanical', 'Machining', 'Electrical']);
    t.eq('6 certifications in catalog order', await t.evaluate(() => [...document.querySelectorAll('.ic-cert')].map((li) => li.dataset.code)),
      ['SAFE-1', 'SAFE-2', 'MECH-1', 'MILL-2', 'WELD-3', 'ELEC-1']);
    const counts = await pageCounts(t);
    t.eq('holder counts equal the active-and-unexpired count computed from the store', counts, expectedCounts);
    t.eq('the lane\'s numbers: SAFE-1 3, SAFE-2 0, MECH-1 1, MILL-2 1, WELD-3 1, ELEC-1 0', counts,
      { 'SAFE-1': '3 holders', 'SAFE-2': '0 holders', 'MECH-1': '1 holder', 'MILL-2': '1 holder', 'WELD-3': '1 holder', 'ELEC-1': '0 holders' });
    // Never counted, in both directions: the non-held rows are IN the mirror
    // (a naive count of every row per code would include them) and the page
    // count differs from that naive count on exactly those codes.
    const isHeldRow = (h) => h.status === 'active' && !(h.expires_at && Date.parse(h.expires_at) <= nowMs);
    const kinds = [...new Set(holders.filter((h) => !isHeldRow(h)).map((h) => (h.status === 'active' ? 'active-lapsed' : h.status)))].sort();
    t.eq('suspended, revoked, expired and lapsed-active rows all exist in the mirror', kinds, ['active-lapsed', 'expired', 'revoked', 'suspended']);
    const naive = {};
    for (const h of holders) naive[h.code] = (naive[h.code] ?? 0) + 1;
    const differs = Object.keys(naive).filter((code) => `${naive[code]} ${naive[code] === 1 ? 'holder' : 'holders'}` !== counts[code]).sort();
    t.eq('the page count is below a count-every-row count exactly where a non-held row sits', differs,
      [...new Set(holders.filter((h) => !isHeldRow(h)).map((h) => h.code))].sort());
    t.eq('WELD-3 is marked Retired', await t.text('[data-code="WELD-3"] .ic-retired'), 'Retired');
    t.eq('no parent block, no sync line, no empty line and no error for a student',
      { student: await t.count('[data-testid=ic-student]'), sync: await t.count('[data-testid=ic-sync]'), empty: await t.count('.ic-empty'), error: await t.count('.ic-error') },
      { student: 0, sync: 0, empty: 0, error: 0 });
    await t.press('[data-code="SAFE-1"] .ic-cert-btn');
    await t.waitFor('#ic-panel-SAFE-1');
    t.eq('SAFE-1 opens 3 holders, IDEA-FX-0008, -0001, -0005', await t.evaluate(() => [...document.querySelectorAll('#ic-panel-SAFE-1 .ic-holder')].map((li) => li.dataset.serial)),
      ['IDEA-FX-0008', 'IDEA-FX-0001', 'IDEA-FX-0005']);
    t.eq('all three Active', await t.texts('#ic-panel-SAFE-1 .ic-pill'), ['Active', 'Active', 'Active']);
    t.eq('"You" marks exactly my own row', await t.evaluate(() => [...document.querySelectorAll('#ic-panel-SAFE-1 .ic-holder')].filter((li) => li.querySelector('.ic-you')).map((li) => li.dataset.serial)), ['IDEA-FX-0001']);
    await t.press('[data-code="MILL-2"] .ic-cert-btn');
    await t.waitFor('#ic-panel-MILL-2');
    const mill = await t.texts('#ic-panel-MILL-2 .ic-pill');
    t.check('MILL-2 lists the suspended row it does not count (2 rows shown, count reads 1 holder)',
      JSON.stringify(mill) === JSON.stringify(['Active', 'Suspended']) && counts['MILL-2'] === '1 holder', `pills ${JSON.stringify(mill)}, count "${counts['MILL-2']}"`);
    await t.tapTargets('.ic-cert-btn', 'every certification button at least 44px tall', { everyWidth: true });
    await t.noHScroll();
    const sc = await mirrorCalls(t);
    t.eq('a member reads exactly the catalog and the holders (once per effect run), and writes nothing', sc, { tables: ['idea_cert_catalog', 'idea_cert_holders'], sameCountEach: true, other: [] });
    await t.shot('mig-all-student');

    // ── student2 ──
    t.as('mig all · student2');
    await t.open('/certifications', { persona: 'student2', mig: 'all', ready: '[data-testid=ic-catalog]' });
    t.eq('1 held, 3 rows Active, Expired, Revoked', {
      count: await t.text('[data-testid=ic-mine] .ic-section-count'),
      pills: await t.texts('[data-testid=ic-mine] .ic-holder .ic-pill'),
    }, { count: '1 held', pills: ['Active', 'Expired', 'Revoked'] });
    t.eq('the same 6 counts as the student sees', await pageCounts(t), counts);

    // ── staff ──
    for (const who of ['mentor', 'admin']) {
      t.as(`mig all · ${who}`);
      await t.open('/certifications', { persona: who, mig: 'all', ready: '[data-testid=ic-sync]' });
      const sync = await t.text('[data-testid=ic-sync]');
      t.check('sync line names the last accepted snapshot', /Last sync/.test(sync) && sync.includes('fixture-rev-41'), sync);
      const fail = await t.text('.ic-sync-fail');
      t.check('a refused latest attempt is said out loud', !!fail && fail.startsWith('Latest attempt refused') && fail.includes("code NOPE-1 is not in this snapshot's catalog"), fail);
      t.eq('"Your certifications" 0 held, with the empty sentence', {
        count: await t.text('[data-testid=ic-mine] .ic-section-count'),
        muted: await t.text('[data-testid=ic-mine] .ic-muted'),
      }, { count: '0 held', muted: 'You hold no IDEA certifications yet.' });
      t.eq('the same 6 counts', await pageCounts(t), counts);
      t.eq('no parent block for staff', await t.count('[data-testid=ic-student]'), 0);
      const cs = await mirrorCalls(t);
      t.eq('staff also read the sync log (once per effect run), and nothing is written', cs, { tables: ['idea_cert_catalog', 'idea_cert_holders', 'idea_cert_sync_log'], sameCountEach: true, other: [] });
      if (who === 'admin') await t.shot('mig-all-admin');
    }

    // ── parent ──
    t.as('mig all · parent');
    await t.open('/certifications', { persona: 'parent', mig: 'all', ready: '[data-testid=ic-catalog]' });
    t.eq('one "Your student" block: Fixture Student One, 2 held', await t.evaluate(() => [...document.querySelectorAll('[data-testid=ic-student] .ic-student')].map((b) => ({
      name: b.querySelector('.ic-student-name')?.firstChild?.textContent?.trim(),
      count: b.querySelector('.ic-section-count')?.textContent?.trim(),
      serials: [...b.querySelectorAll('.ic-holder')].map((li) => li.dataset.serial).sort(),
    }))), [{ name: 'Fixture Student One', count: '2 held', serials: ['IDEA-FX-0001', 'IDEA-FX-0002', 'IDEA-FX-0003', 'IDEA-FX-0004'] }]);
    t.eq('the catalog still lists 6', await t.count('.ic-cert'), 6);
    const parentCounts = await t.count('[data-testid=ic-count]');
    t.check('no team-wide holder counts for a parent (0, against 6 for the student on the same fixture)', parentCounts === 0 && Object.keys(counts).length === 6, `${parentCounts} vs ${Object.keys(counts).length}`);
    t.eq('no "Your certifications" and no sync line for a parent',
      { mine: await t.count('[data-testid=ic-mine]'), sync: await t.count('[data-testid=ic-sync]') }, { mine: 0, sync: 0 });
    await t.press('[data-code="SAFE-1"] .ic-cert-btn');
    await t.waitFor('#ic-panel-SAFE-1');
    t.eq('SAFE-1 shows "Your student" and only IDEA-FX-0001 (3 holders for the student)', {
      head: await t.text('#ic-panel-SAFE-1 .ic-panel-h'),
      serials: await t.evaluate(() => [...document.querySelectorAll('#ic-panel-SAFE-1 .ic-holder')].map((li) => li.dataset.serial)),
    }, { head: 'Your student', serials: ['IDEA-FX-0001'] });
    await t.noHScroll();
    await t.shot('mig-all-parent');
  },
};
