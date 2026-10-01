/**
 * /my-hours -- the category totals bug (lane b1, no migration:
 * src/MyHoursPage.jsx + src/myHoursModel.js over src/hoursUtils.js).
 *
 * The claim: the By category card, the All Time number and the season card
 * add up to exactly the sessions the page lists as counted, plus verified
 * logged hours and staff adjustments -- including after-school sessions that
 * cross 00:00 UTC, which the old code dropped from the totals while still
 * listing them.
 *
 * Lane b1's numbers were computed on lane b1's seed alone. On the merged
 * fixture Sam also carries the core seed's history and lane b2's open
 * check-in, so the spec first ISOLATES lane b1's rows (the test owning its
 * precondition: every other Sam row in the hour tables is removed), asserts
 * lane b1's exact numbers, and checks them against totals computed here from
 * the store rows with no app code. Then, on the full merged seed, it asserts
 * the same invariant without isolation. Lane b1 has no migration, so both
 * migration states must read identically.
 *
 * Positive control: flipping lane b1's pending logged-hours row to verified
 * must move Outreach from 1h to 3h -- so "the pending row counts nowhere" is
 * not passing on a page that ignores logged hours altogether.
 */
import { P, fmtHours, parseHours } from './_util.mjs';

const B1 = '00000000-0000-4000-b100-';
const H = 3_600_000;
const CAP_MS = 10 * H;
const LABEL = { build: 'Build', outreach: 'Outreach', volunteer: 'Volunteer', competition: 'Competition' };

// Sessions, totals and the newest-first list from raw rows: sequential IN/OUT
// pairing, the IN's category, the 10 h cap, and the pending / voided reviews.
function oracle({ events, reviews, logged, adjustments }) {
  const ev = events.slice().sort((a, b) => Date.parse(a.event_time) - Date.parse(b.event_time));
  const pending = new Set(reviews.filter((r) => r.status === 'pending').map((r) => r.checkout_id));
  const voided = new Set(reviews.filter((r) => r.status === 'voided').map((r) => r.checkout_id));
  const sessions = [];
  let open = null;
  for (const e of ev) {
    if (e.type === 'in') open = e;
    else if (open) {
      const ms = Math.min(Date.parse(e.event_time) - Date.parse(open.event_time), CAP_MS);
      sessions.push({ in: open.event_time, cat: open.category || 'build', ms, pending: pending.has(e.id), voided: voided.has(e.id) });
      open = null;
    }
  }
  const totals = { build: 0, outreach: 0, volunteer: 0, competition: 0 };
  for (const s of sessions) if (!s.pending && !s.voided) totals[s.cat] += s.ms / H;
  for (const l of logged) if (l.status === 'verified') totals[l.type === 'volunteering' ? 'volunteer' : l.type] += Number(l.hours);
  for (const a of adjustments) totals[a.category] += Number(a.hours);
  const all = Object.values(totals).reduce((x, y) => x + y, 0);
  const recent = sessions.slice().sort((a, b) => Date.parse(b.in) - Date.parse(a.in)).map((s) => ({
    dur: fmtHours(s.ms / H),
    flags: [...(s.cat !== 'build' ? [LABEL[s.cat]] : []), ...(s.pending ? ['review'] : []), ...(s.voided ? ['not counted'] : [])],
  }));
  return { totals, all, recent, pendingCount: sessions.filter((s) => s.pending).length, pendingH: sessions.filter((s) => s.pending).reduce((x, s) => x + s.ms / H, 0) };
}

async function readPage(t) {
  return t.evaluate(() => {
    const txt = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
    const stats = Object.fromEntries([...document.querySelectorAll('.mh-stat')].map((s) => [txt(s.querySelector('.mh-stat-label')), txt(s.querySelector('.mh-stat-value'))]));
    const cards = [...document.querySelectorAll('.mh-card')];
    const card = (title) => cards.find((c) => txt(c.querySelector('.mh-card-title')) === title);
    const byCat = Object.fromEntries([...(card('By category')?.querySelectorAll('.mh-type-row') ?? [])].map((r) => [txt(r.querySelector('.mh-type-label')), txt(r.querySelector('.mh-type-val'))]));
    const adj = [...(card('Hour adjustments')?.querySelectorAll('.mh-adjustment') ?? [])].map((r) => ({ cat: txt(r.querySelector('.mh-adj-cat')), amt: txt(r.querySelector('.mh-adj-amt')), reason: txt(r.querySelector('.mh-adj-reason')) }));
    const recent = [...(card('Recent sessions')?.querySelectorAll('.mh-session') ?? [])].map((r) => ({ dur: txt(r.querySelector('.mh-session-dur')), flags: [...r.querySelectorAll('.mh-session-flag')].map(txt) }));
    const seasons = [...document.querySelectorAll('.mh-season-card')].map((c) => ({
      name: txt(c.querySelector('.mh-season-name')), total: txt(c.querySelector('.mh-season-total')),
      rows: Object.fromEntries([...c.querySelectorAll('.mh-breakdown-row')].map((r) => [txt(r.querySelector('.mh-breakdown-label')), txt(r.querySelector('.mh-breakdown-value'))])),
    }));
    // A session row's children must stay inside their card (measured at 375).
    let overflow = 0;
    for (const s of document.querySelectorAll('.mh-session')) {
      const right = s.closest('.mh-card').getBoundingClientRect().right;
      for (const ch of s.children) overflow = Math.max(overflow, ch.getBoundingClientRect().right - right);
    }
    return {
      stats, byCat, adj, recent, seasons,
      pending: txt(document.querySelector('.mh-pending-notice > span:last-child')),
      trendCols: document.querySelectorAll('.mh-trend-col').length,
      overflow: Math.round(overflow * 10) / 10,
    };
  });
}

async function storeFor(t, id) {
  return t.evaluate((uid) => ({
    events: window.__fx.rows('attendance_events').filter((e) => e.user_id === uid),
    reviews: window.__fx.rows('session_reviews').filter((r) => r.user_id === uid),
    logged: window.__fx.rows('logged_hours').filter((r) => r.member_id === uid),
    adjustments: window.__fx.rows('hour_adjustments').filter((r) => r.member_id === uid),
  }), id);
}

export default {
  async run(t) {
    // ── isolate lane b1's rows for Sam ──
    await t.open('/_fixture', { persona: 'student', mig: 'all', reset: true });
    const removed = await t.evaluate(({ uid, keep }) => {
      const db = window.__fx.db;
      const out = {};
      const strip = (table, col) => {
        const before = db[table].length;
        db[table] = db[table].filter((r) => r[col] !== uid || String(r.id ?? '').startsWith(keep));
        out[table] = before - db[table].length;
      };
      strip('attendance_events', 'user_id');
      strip('session_reviews', 'user_id');
      strip('logged_hours', 'member_id');
      strip('hour_adjustments', 'member_id');
      strip('session_corrections', 'member_id');
      window.__fx.save();
      return out;
    }, { uid: P.student.id, keep: B1 });
    t.as('precondition');
    t.check('isolated lane b1\'s seed: removed Sam\'s core and lane b2 rows from the hour tables', removed.attendance_events > 0, JSON.stringify(removed));
    const o = oracle(await storeFor(t, P.student.id));

    const pages = {};
    for (const mig of ['all', 'none']) {
      t.as(`b1 seed · mig ${mig} · student`);
      await t.open('/my-hours', { persona: 'student', mig, ready: '.mh-summary' });
      const pg = await readPage(t);
      pages[mig] = pg;
      t.eq('summary: All Time 21h 35m, 1 season', { all: pg.stats['All Time'], seasons: pg.stats.Season }, { all: '21h 35m', seasons: '1' });
      t.eq('All Time equals the total computed from the store', pg.stats['All Time'], fmtHours(o.all));
      const week = parseHours(pg.stats['This Week']);
      t.check('This Week is never more than All Time', week != null && week <= parseHours(pg.stats['All Time']), `This Week ${pg.stats['This Week']}, All Time ${pg.stats['All Time']}`);
      // Lane b1's number for a Thursday-afternoon clock (its seed is relative
      // to the clock, and the clock here is fixed).
      t.eq('This Week reads lane b1\'s 7h at the fixed clock', pg.stats['This Week'], '7h');
      t.eq('pending notice: 1 session (6h)', pg.pending, '1 session (6h) pending mentor review — not counted in your totals yet.');
      t.check('the oracle agrees: 1 pending session of 6h', o.pendingCount === 1 && fmtHours(o.pendingH) === '6h', `${o.pendingCount} / ${fmtHours(o.pendingH)}`);
      t.eq('one hour adjustment: Outreach +1h with its reason', pg.adj, [{ cat: 'Outreach', amt: '+1h', reason: 'Booth setup before the check-in tag was posted' }]);
      t.eq('By category: exactly Build 4h 5m, Outreach 1h, Volunteer 16h 30m (no Competition row)', pg.byCat, { Build: '4h 5m', Outreach: '1h', Volunteer: '16h 30m' });
      const expectCats = Object.fromEntries(Object.entries(o.totals).filter(([, h]) => h >= 0.01).map(([k, h]) => [LABEL[k], fmtHours(h)]));
      t.eq('By category equals the per-category totals computed from the store', pg.byCat, expectCats);
      t.eq('weekly trend: 6 columns', pg.trendCols, 6);
      t.eq('recent sessions: the 8 newest, newest first, each with its markers', pg.recent, o.recent.slice(0, 8));
      t.eq('lane b1\'s list: Vol 2h not counted, 6h review, Vol 2h 30m, Vol 4h 30m, Vol 3h, 20m, 1h 15m, Vol 3h', pg.recent.map((r) => `${r.dur}${r.flags.length ? ` ${r.flags.join('+')}` : ''}`),
        ['2h Volunteer+not counted', '6h review', '2h 30m Volunteer', '4h 30m Volunteer', '3h Volunteer', '20m', '1h 15m', '3h Volunteer']);
      t.eq('By season: one card, 21h 35m, the same three categories', pg.seasons.map((s) => ({ total: s.total, rows: s.rows })),
        [{ total: '21h 35m', rows: { Build: '4h 5m', Outreach: '1h', Volunteer: '16h 30m' } }]);
      if (t.isPhone) t.check('no child of a recent-session row extends past its card at 375', pg.overflow <= 0, `${pg.overflow}px past the card edge at most`);
      await t.noHScroll();
      if (mig === 'all') await t.shot('b1-seed');
    }
    t.as('b1 seed · both states');
    t.eq('the page reads identically with and without the migrations (lane b1 has none)', pages.none, pages.all);

    // ── positive control: a pending logged-hours row counts once verified ──
    t.as('b1 seed · mig all · positive control');
    const flipped = await t.evaluate((id) => window.__fx.patch('logged_hours', { id }, { status: 'verified' }), `${B1}000000000912`);
    await t.open('/my-hours', { persona: 'student', mig: 'all', ready: '.mh-summary' });
    const pc = await readPage(t);
    t.check('verifying the pending "Library demo" row moves Outreach 1h -> 3h and All Time 21h 35m -> 23h 35m', flipped === 1 && pc.byCat.Outreach === '3h' && pc.stats['All Time'] === '23h 35m',
      `${flipped} row patched; Outreach ${pc.byCat.Outreach}, All Time ${pc.stats['All Time']}`);
    await t.evaluate((id) => window.__fx.patch('logged_hours', { id }, { status: 'pending' }), `${B1}000000000912`);

    // ── the merged seed, no isolation: the same invariant ──
    for (const mig of ['all', 'none']) {
      t.as(`merged seed · mig ${mig} · student`);
      await t.open('/my-hours', { persona: 'student', mig, reset: true, ready: '.mh-summary' });
      const pg = await readPage(t);
      const sum = Object.values(pg.byCat).reduce((x, v) => x + (parseHours(v) ?? 0), 0);
      const all = parseHours(pg.stats['All Time']);
      t.check('All Time equals the sum of the By category rows (to the rounding of each row)', all != null && Math.abs(Math.round(sum * 60) - Math.round(all * 60)) <= Object.keys(pg.byCat).length,
        `rows ${JSON.stringify(pg.byCat)} sum ${fmtHours(sum)}, All Time ${pg.stats['All Time']}`);
      const seasonSum = pg.seasons.reduce((x, s) => x + (parseHours(s.total) ?? 0), 0);
      t.check('the season cards add up to All Time', Math.abs(Math.round(seasonSum * 60) - Math.round(all * 60)) <= pg.seasons.length, `${pg.seasons.map((s) => `${s.name} ${s.total}`).join(', ')} vs ${pg.stats['All Time']}`);
      t.check('This Week is never more than All Time', (parseHours(pg.stats['This Week']) ?? 0) <= all, `${pg.stats['This Week']} vs ${pg.stats['All Time']}`);
      if (t.isPhone) t.check('no child of a recent-session row extends past its card at 375', pg.overflow <= 0, `${pg.overflow}px`);
      await t.noHScroll();
      if (mig === 'all') await t.shot('merged-seed');
    }
  },
};
