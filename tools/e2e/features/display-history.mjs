/**
 * /display name-click history and the Team Hours drill-down (lane d, no
 * migration: src/PresenceBoard.jsx, src/AttendanceHistory.jsx,
 * src/attendanceHistory.js, src/HoursBoard.jsx).
 *
 * Claims under test, each in both directions and in both migration states
 * (lane d has no migration, so `mig:all` and `mig:none` must read the same):
 *  - staff (mentor, admin): every board name is a real button (44px at 375),
 *    keyboard-reachable with the gold focus ring, and opens a READ-ONLY
 *    history dialog -- exactly one button in it, Close -- that takes focus,
 *    closes on Escape (focus back on the same name) and on the backdrop;
 *  - non-staff (student, student2, parent): the same rows, names and counts,
 *    0 buttons and 0 tabindex on the board, names are spans, a click opens
 *    nothing, and no per-member history is ever read;
 *  - Team Hours: the drill-down is the same dialog, with "+ Manual session"
 *    and Edit/Void on every row for staff and none for a student; the adjust
 *    panel stacked over it survives Escape; a matrix cell opens one day.
 *
 * Expectations corrected here: the location cell is text-transform:
 * capitalize, so its textContent is "shop → side door" (innerText would be
 * "Shop → Side Door"); chip labels are compared by textContent; Riley's total
 * is NOT 17h 40m on the merged fixture -- the core seed and lane b2 add Riley
 * sessions -- so the spec asserts that lane d's own 17h 40m is contained in
 * it and that the total equals the sum of its four category chips.
 */
import { parseHours } from './_util.mjs';

const NON_STAFF = ['student', 'student2', 'parent'];
// PresenceBoard's own attendance_events read (src/PresenceBoard.jsx load()).
const BOARD_COLUMNS = 'user_id, type, event_time';

async function board(t) {
  return t.evaluate(() => ({
    rows: [...document.querySelectorAll('.pb-row')].map((r) => (r.querySelector('.pb-name')?.textContent || '').trim()),
    present: document.querySelector('.pb-count-now')?.textContent.trim(),
    total: document.querySelector('.pb-count-total')?.textContent.trim(),
    buttons: document.querySelectorAll('.pb-wrap button').length,
    nameButtons: document.querySelectorAll('.pb-row button.pb-name.pb-name-btn[type=button][aria-haspopup=dialog]').length,
    tabindex: document.querySelectorAll('.pb-wrap [tabindex]').length,
    spans: [...document.querySelectorAll('.pb-name')].filter((n) => n.tagName === 'SPAN').length,
  }));
}

async function readHistory(t) {
  return t.evaluate(() => {
    const d = document.querySelector('[role=dialog][aria-modal=true]');
    if (!d) return null;
    const labelled = document.getElementById(d.getAttribute('aria-labelledby') || '');
    const chips = Object.fromEntries([...d.querySelectorAll('.ah-chip')].map((c) => [c.querySelector('.ah-chip-label')?.textContent.trim(), c.querySelector('.ah-chip-val')?.textContent.trim()]));
    return {
      title: labelled?.tagName === 'H2' ? labelled.textContent.trim() : null,
      sub: d.querySelector('.ah-sub')?.textContent.trim(),
      days: d.querySelectorAll('.ah-day').length,
      dayheads: d.querySelectorAll('.ah-dayhead').length,
      rows: d.querySelectorAll('.ah-table tbody tr').length,
      text: d.textContent,
      buttons: [...d.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
      chips,
    };
  });
}

async function waitHistory(t) {
  await t.waitFor('[role=dialog][aria-modal=true] .ah-day, [role=dialog][aria-modal=true] .ah-empty');
  await t.waitFor(() => !document.querySelector('[role=dialog] .ah-empty')?.textContent.includes('Loading'));
}

export default {
  async run(t) {
    const boards = {};
    let mentorButtons = null;
    // Lane d's member and an exact-match for their name (set by the precondition).
    let member = 'Riley';
    let exact = /^Riley$/;

    for (const mig of ['all', 'none']) {
      // ════ /display, staff ══════════════════════════════════════════════
      for (const who of ['mentor', 'admin']) {
        t.as(`display · mig ${mig} · ${who}`);
        await t.open('/display', { persona: who, mig, reset: mig === 'all' && who === 'mentor', ready: '.pb-row' });
        if (mig === 'all' && who === 'mentor') {
          // PRECONDITION (a fixture defect, reported): the core seed generates
          // lane d's member's ordinary build sessions without knowing lane d's
          // rows, and on the merged fixture some of them land INSIDE lane d's
          // sessions. Paired in time order, a core IN inside lane d's 12.5h
          // session and inside its auto-closed one overwrites lane d's IN, so
          // the CAPPED and REVIEW sessions never form. The spec removes exactly
          // the core rows (ids 50000000-...) that fall inside a lane d session,
          // then reloads. Lane d's member is FOUND, not assumed: the owner of
          // the one OUT at 'side-door' (the "Shop -> Side Door" session the
          // dialog must show; the core seed's side exit is 'shop-side'). So
          // once features/d.js stops interleaving -- moving its hours, or its
          // member -- this removes 0 rows and every check below still holds.
          const pre = await t.evaluate(() => {
            const db = window.__fx.db;
            const sig = db.attendance_events.find((e) => e.type === 'out' && e.location === 'side-door');
            if (!sig) return null;
            const uid = sig.user_id;
            const core = (e) => String(e.id).startsWith('50000000-');
            // Lane d's sessions: the member's non-core rows, paired in time order
            // (lane b2's open INs for the same member pair with nothing).
            const theirs = db.attendance_events.filter((e) => e.user_id === uid && !core(e))
              .sort((a, b) => a.event_time.localeCompare(b.event_time));
            const windows = [];
            let open = null;
            for (const e of theirs) {
              if (e.type === 'in') open = e;
              else if (open) { windows.push([Date.parse(open.event_time), Date.parse(e.event_time)]); open = null; }
            }
            const inside = (e) => e.user_id === uid && core(e)
              && windows.some(([a, b]) => Date.parse(e.event_time) >= a && Date.parse(e.event_time) <= b);
            const gone = db.attendance_events.filter(inside).map((e) => `${e.type}@${e.event_time}`);
            db.attendance_events = db.attendance_events.filter((e) => !inside(e));
            window.__fx.save();
            const p = (db.profiles || []).find((x) => x.id === uid);
            return { uid, name: (p?.nickname || '').trim() || (p?.full_name || '').trim() || null, windows: windows.length, gone };
          });
          t.as('precondition');
          t.check('lane d\'s member found by its side-door session, with 6 sessions of its own', !!pre?.name && pre.windows === 6,
            pre ? `${pre.name}: ${pre.windows} sessions; removed ${pre.gone.length} core row(s) inside them${pre.gone.length ? ` (features/d.js vs the core generator): ${pre.gone.join(', ')}` : ''}` : 'no OUT at side-door in the store');
          member = pre?.name ?? member;
          exact = new RegExp(`^${member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
          t.as(`display · mig ${mig} · ${who}`);
          await t.open('/display', { persona: who, mig, ready: '.pb-row' });
        }
        const b = await board(t);
        boards[`${mig}/${who}`] = { rows: b.rows, present: b.present, total: b.total };
        mentorButtons ??= b.nameButtons;
        t.check('every row\'s name is a button[type=button][aria-haspopup=dialog], and they are the only buttons', b.nameButtons === b.rows.length && b.buttons === b.rows.length && b.rows.length > 0,
          `${b.nameButtons} name buttons, ${b.buttons} buttons, ${b.rows.length} rows`);
        await t.tapTargets('.pb-name-btn', 'every name button at least 44px tall', { everyWidth: true });
        if (who === 'mentor') {
          // Keyboard: Tab from the top reaches a name button with the gold ring.
          await t.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
          let ring = null;
          for (let i = 0; i < 80 && !ring; i += 1) {
            await t.page.keyboard.press('Tab');
            ring = await t.evaluate(() => {
              const a = document.activeElement;
              if (!a?.classList.contains('pb-name-btn')) return null;
              const cs = getComputedStyle(a);
              return { focusVisible: a.matches(':focus-visible'), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, opacity: cs.opacity, tabs: 0 };
            });
            if (ring) ring.tabs = i + 1;
          }
          t.check('Tab reaches a name button: :focus-visible, solid 2px rgb(255, 230, 41), opacity 1', !!ring && ring.focusVisible && ring.outline === 'solid 2px rgb(255, 230, 41)' && ring.opacity === '1',
            ring ? `${ring.tabs} tabs: ${ring.outline}, opacity ${ring.opacity}` : 'no name button reached in 80 tabs');
        }
        const riley = t.page.locator('.pb-name-btn', { hasText: exact });
        await t.evaluate(() => document.querySelectorAll('[data-e2e-opener]').forEach((n) => n.removeAttribute('data-e2e-opener')));
        await riley.evaluate((n) => n.setAttribute('data-e2e-opener', '1'));
        const callsBefore = (await t.calls()).length;
        await t.press(riley);
        await waitHistory(t);
        const h = await readHistory(t);
        const reads = (await t.calls()).slice(callsBefore).filter((c) => c.kind === 'select').map((c) => c.table).sort();
        t.eq(`the dialog is labelled by an h2 naming ${member}`, h?.title, member);
        t.eq('subtitle names the season spanning today', h?.sub, 'Sessions by day · Offseason 2026');
        t.check('at least 6 days, with MANUAL, CAPPED and REVIEW rows and the Shop → Side Door session (textContent: shop → side door)',
          h && h.days >= 6 && ['MANUAL', 'CAPPED', 'REVIEW'].every((s) => h.text.includes(s)) && h.text.includes('shop → side door'),
          h ? `${h.days} days; ${['MANUAL', 'CAPPED', 'REVIEW', 'shop → side door'].map((s) => `${s}:${h.text.includes(s)}`).join(' ')}` : 'no dialog');
        const cats = ['Build', 'Outreach', 'Volunteer', 'Competition'];
        const chipH = cats.map((c) => parseHours(h?.chips?.[c]));
        const totalH = parseHours(h?.chips?.Total);
        t.check('chips Build, Outreach, Volunteer, Competition and Total; Total is the sum of the four (to the rounding of each)',
          chipH.every((x) => x != null) && totalH != null && Math.abs(Math.round(totalH * 60) - Math.round(chipH.reduce((a, x) => a + x, 0) * 60)) <= 2,
          JSON.stringify(h?.chips));
        t.check('lane d\'s own 17h 40m of sessions is inside the total (the core seed adds more)', totalH != null && totalH >= 17 + 40 / 60 - 1 / 60, `Total ${h?.chips?.Total}`);
        t.eq('read-only: exactly one button in the dialog, Close (no + Manual session, Edit or Void)', h?.buttons, ['Close']);
        t.check('the history read is this one member\'s: seasons, attendance_events, session_reviews', ['attendance_events', 'seasons', 'session_reviews'].every((x) => reads.includes(x)), reads.join(', '));
        const histCols = (await t.calls()).slice(callsBefore).filter((c) => c.table === 'attendance_events').map((c) => c.columns);
        t.check('positive control: a staff click DOES read a history (columns differ from the board\'s)', histCols.length > 0 && histCols.every((c) => c !== BOARD_COLUMNS), histCols.join(' | '));
        t.eq('focus is on Close', await t.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close');
        await t.noHScroll('no horizontal page scroll with the dialog open');
        if (mig === 'all') await t.shot(`display-${who}-history`, { full: false });
        await t.page.keyboard.press('Escape');
        await t.page.waitForSelector('[role=dialog]', { state: 'detached' });
        t.eq('Escape closes it and focus returns to the same name button', await t.evaluate(() => document.activeElement?.getAttribute('data-e2e-opener')), '1');
        await t.press(riley);
        await waitHistory(t);
        if (t.isPhone) await t.page.touchscreen.tap(5, 5);
        else await t.page.mouse.click(5, 5);
        await t.page.waitForSelector('[role=dialog]', { state: 'detached', timeout: 5000 }).catch(() => {});
        t.eq('a backdrop click at (5,5) closes it', await t.count('[role=dialog]'), 0);
        await t.noHScroll('no horizontal page scroll with the dialog closed');
      }

      // ════ /display, non-staff ══════════════════════════════════════════
      for (const who of NON_STAFF) {
        t.as(`display · mig ${mig} · ${who}`);
        await t.open('/display', { persona: who, mig, ready: '.pb-row' });
        const b = await board(t);
        boards[`${mig}/${who}`] = { rows: b.rows, present: b.present, total: b.total };
        t.eq('the same rows, names and counts as the mentor on this fixture', boards[`${mig}/${who}`], boards[`${mig}/mentor`]);
        t.check(`0 of ${b.rows.length} name buttons (against ${mentorButtons} of ${mentorButtons} for the mentor), 0 tabindex, every name a span`,
          b.buttons === 0 && b.nameButtons === 0 && b.tabindex === 0 && b.spans === b.rows.length && mentorButtons === b.rows.length,
          `${b.buttons} buttons, ${b.tabindex} tabindex, ${b.spans}/${b.rows.length} spans`);
        t.eq('a name\'s cursor is auto', await t.evaluate(() => getComputedStyle(document.querySelector('.pb-name')).cursor), 'auto');
        const before = (await t.calls()).length;
        await t.press(t.page.locator('.pb-name', { hasText: exact }));
        await t.page.waitForTimeout(400);
        const after = (await t.calls()).slice(before);
        t.eq('clicking a name opens nothing and reads nothing', { dialogs: await t.count('[role=dialog]'), reads: after.filter((c) => c.kind === 'select').length }, { dialogs: 0, reads: 0 });
        const all = await t.calls();
        const ae = all.filter((c) => c.table === 'attendance_events' && c.kind === 'select');
        t.check('no session_reviews read, and every attendance_events read is the board\'s own (today, all members), never a history',
          all.filter((c) => c.table === 'session_reviews').length === 0 && ae.length > 0 && ae.every((c) => c.columns === BOARD_COLUMNS),
          `${all.filter((c) => c.table === 'session_reviews').length} session_reviews; attendance_events columns: ${[...new Set(ae.map((c) => c.columns))].join(' | ')}`);
        if (who === 'student' && mig === 'all') await t.shot('display-student');
      }

      // ════ /hours drill-down ════════════════════════════════════════════
      t.as(`hours · mig ${mig} · mentor`);
      await t.open('/hours', { persona: 'mentor', mig, ready: '.board-row-click' });
      await t.press(t.page.locator('.board-row-click', { has: t.page.locator('.board-member-link', { hasText: exact }) }));
      await t.waitFor('.ah-dialog .ah-day');
      const mh = await t.evaluate(() => {
        const d = document.querySelector('.ah-dialog');
        return {
          backdrop: !!document.querySelector('.ah-backdrop'),
          old: document.querySelectorAll('.board-detail').length,
          manual: d.querySelectorAll('.board-adjust-btn').length,
          rows: d.querySelectorAll('.ah-table tbody tr').length,
          edit: [...d.querySelectorAll('.ah-table tbody tr')].filter((r) => [...r.querySelectorAll('button')].map((b) => b.textContent.trim()).join() === 'Edit,Void').length,
        };
      });
      t.check('the drill-down is the shared .ah-dialog with one "+ Manual session" and Edit/Void on every session row',
        mh.backdrop && mh.old === 0 && mh.manual === 1 && mh.rows > 0 && mh.edit === mh.rows, JSON.stringify(mh));
      await t.press(t.page.locator('.ah-dialog .board-adjust-btn'));
      await t.waitFor('.board-adjust');
      t.eq(`"+ Manual session" opens the adjust panel for ${member}`, await t.text('.board-adjust .board-detail-title'), `Add manual session — ${member}`);
      await t.page.keyboard.press('Escape');
      await t.page.waitForTimeout(250);
      t.eq('Escape with the panel open keeps both the history and the panel', { history: await t.count('.ah-dialog'), panel: await t.count('.board-adjust') }, { history: 1, panel: 1 });
      await t.press(t.page.locator('.board-adjust .board-adjust-cancel'));
      await t.page.waitForSelector('.board-adjust', { state: 'detached' });
      await t.page.keyboard.press('Escape');
      await t.page.waitForSelector('.ah-dialog', { state: 'detached', timeout: 5000 }).catch(() => {});
      t.eq('Cancel, then Escape, closes the history', await t.count('.ah-dialog'), 0);
      await t.press(t.page.locator('.board-viewbtn', { hasText: 'Matrix' }));
      await t.waitFor('.board-matrix-cell-click');
      await t.press(t.page.locator('tr', { has: t.page.locator('.board-matrix-name', { hasText: exact }) }).locator('.board-matrix-cell-click').first());
      await t.waitFor('.ah-dialog .ah-day');
      const one = await readHistory(t);
      t.check('a matrix cell opens ONE day: no day heads, subtitle the day ("Thu, Oct 1" form)', one && one.dayheads === 0 && one.days === 1 && /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/.test(one.sub), one && `${one.days} day, ${one.dayheads} heads, "${one.sub}"`);
      await t.page.keyboard.press('Escape');

      t.as(`hours · mig ${mig} · student`);
      await t.open('/hours', { persona: 'student', mig, ready: '.board-row-click' });
      await t.press(t.page.locator('.board-row-click', { has: t.page.locator('.board-member-link', { hasText: exact }) }));
      await t.waitFor('.ah-dialog .ah-day');
      const sh = await t.evaluate(() => ({
        manual: document.querySelectorAll('.ah-dialog .board-adjust-btn').length,
        actions: [...document.querySelectorAll('.ah-dialog button')].filter((b) => ['Edit', 'Void'].includes(b.textContent.trim())).length,
        rows: document.querySelectorAll('.ah-dialog .ah-table tbody tr').length,
      }));
      t.check(`a student still opens the drill-down, with 0 "+ Manual session" and 0 Edit/Void (against 1 and ${mh.edit * 2} for the mentor)`,
        sh.rows > 0 && sh.manual === 0 && sh.actions === 0 && mh.manual === 1 && mh.edit > 0, JSON.stringify(sh));
      if (mig === 'all') await t.shot('hours-student-drilldown', { full: false });
      await t.page.keyboard.press('Escape');
    }

    t.as('both states');
    for (const who of ['mentor', ...NON_STAFF]) {
      t.eq(`${who}: the board reads the same with and without the migrations (lane d has none)`, boards[`none/${who}`], boards[`all/${who}`]);
    }
  },
};
