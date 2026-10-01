/**
 * /feedback (the admin console) and the feedback widget -- lane c, migration
 * 0002 (src/FeedbackPage.jsx, src/FeedbackWidget.jsx, src/feedbackModel.js,
 * src/feedbackExport.js).
 *
 * Every count here comes from the store (`__fx.rows('feedback')`), not from
 * the lane's claim: lane c counted its own 8 seeded reports, and the core seed
 * adds 3 more (2 open, 1 reviewed), so on the merged fixture New is 6, not 4.
 *
 * Claims under test, each in both directions:
 *  - console, mig all: export bar first and naming what it exports, status
 *    tabs, filters, the detail (what they tried, build), markdown for chat in
 *    one part and in numbered parts, a real zip (bytes parsed, CRC-checked,
 *    and `unzip -t`), bulk move to Done and an Undo that restores every
 *    report's status, reviewer and time EXACTLY;
 *  - console, mig none: the not-set-up line, the same counts read through the
 *    legacy statuses, no bulk moves (0 move buttons, against 6 with 0002),
 *    one-at-a-time triage writing the OLD spelling, MARK_SEEN.sql in the old
 *    spelling;
 *  - non-admins (student, mentor) get one sentence and no console;
 *  - widget, both states: send with NO type, "what did you try" kept, the
 *    build stamp shown and sent; the insert ladder (src/feedbackModel.js
 *    submitReport) takes the rungs the database's answers call for;
 *  - the check-in fast paths carry no widget.
 */
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { REPO } from '../lib.mjs';
import { P, readZip } from './_util.mjs';

const LEGACY = { open: 'new', reviewed: 'seen', dismissed: 'wont_do' };
const norm = (s) => LEGACY[s] ?? s;
const STATUS_LABEL = { new: 'New', seen: 'Seen', in_progress: 'In progress', done: 'Done', wont_do: "Won't do", spam: 'Spam' };
const ORDER = ['new', 'seen', 'in_progress', 'done', 'wont_do', 'spam'];
const typeOf = (r) => (r.category === 'bug' || r.category === 'idea' ? r.category : 'general');

function tabTexts(rows) {
  const n = {};
  for (const r of rows) n[norm(r.status)] = (n[norm(r.status)] ?? 0) + 1;
  return [...ORDER.map((s) => `${STATUS_LABEL[s]} (${n[s] ?? 0})`), `All (${rows.length})`];
}

const snapshot = (rows, ids) => rows.filter((r) => ids.includes(r.id))
  .map(({ id, status, reviewed_by, reviewed_at }) => ({ id, status, reviewed_by, reviewed_at }))
  .sort((a, b) => a.id.localeCompare(b.id));

async function listCount(t) {
  return t.count('li.fbp-item');
}

async function downloadZip(t) {
  const [dl] = await Promise.all([
    t.page.waitForEvent('download', { timeout: 20_000 }),
    t.press(t.page.getByRole('button', { name: 'Zip with screenshots' })),
  ]);
  const file = await dl.path();
  const bytes = await readFile(file);
  let unzipOk = false;
  let unzipLine = '';
  try {
    unzipLine = execFileSync('unzip', ['-t', file], { encoding: 'utf8' }).trim().split('\n').at(-1);
    unzipOk = /No errors detected/.test(unzipLine);
  } catch (e) {
    unzipLine = String(e.stdout || e.message).trim().split('\n').at(-1);
  }
  const entries = readZip(bytes);
  const byBase = Object.fromEntries(entries.map((e) => [e.name.split('/').at(-1), e]));
  return { name: dl.suggestedFilename(), size: bytes.length, unzipOk, unzipLine, entries, byBase };
}

function gitObjectIsCommit(sha) {
  try {
    return execFileSync('git', ['cat-file', '-t', sha], { cwd: REPO, encoding: 'utf8' }).trim() === 'commit';
  } catch {
    return false;
  }
}

export default {
  async run(t) {
    const moveButtonsWith0002 = {};

    // ════ console, migration 0002 applied ════════════════════════════════
    t.as('console · mig all · admin');
    await t.open('/feedback', { persona: 'admin', mig: 'all', reset: true, ready: '.fbp-tabs' });
    await t.waitFor('li.fbp-item');
    await t.settle();
    let rows = await t.rows('feedback');
    const newRows = rows.filter((r) => norm(r.status) === 'new');
    const N = newRows.length;
    t.check('oracle: the merged seed holds New reports from both lane c and the core seed', N === 6 && rows.length === 11,
      `${N} New of ${rows.length} in the store (lane c claimed 4 of 8; the core seed adds 2 open + 1 reviewed)`);
    t.eq('no not-set-up line with 0002 applied', await t.count('.fbp-setup'), 0);
    const order = await t.evaluate(() => [...document.querySelector('.fbp-wrap').children].map((el) => el.className.split(' ')[0]).slice(0, 3));
    t.eq('the export bar is the first block after the header', order.slice(0, 2), ['fbp-head', 'fbp-export']);
    if (t.isPhone) {
      const top = await t.evaluate(() => document.querySelector('.fbp-export').getBoundingClientRect().top);
      t.check('at 375 the export bar starts inside the first screen', top < 812, `top ${Math.round(top)}px of 812`);
    }
    t.eq('export title names what is shown (textContent; CSS uppercases it)', await t.text('.fbp-export-title'), `Export ${N} shown`);
    t.eq('scope line', await t.text('.fbp-export-scope'), 'status New; type any; route any; reporter any');
    t.eq('export buttons', await t.texts('.fbp-export-btn'), ['Markdown for chat', 'Zip with screenshots']);
    t.check('"Names in export" is ticked', await t.evaluate(() => {
      const l = [...document.querySelectorAll('.fbp-names')].find((x) => x.textContent.includes('Names in export'));
      return !!l?.querySelector('input')?.checked;
    }), 'checkbox checked');
    t.eq('status tabs carry the store\'s counts', await t.texts('.fbp-tab'), tabTexts(rows));
    t.eq(`${N} rows listed`, await listCount(t), N);
    await t.noHScroll();
    await t.shot('console-mig-all');

    // ── filters, each against the store ──
    const expectShown = async (label, pred, scope) => {
      const want = rows.filter((r) => norm(r.status) === 'new' && pred(r)).length;
      const got = await listCount(t);
      const title = await t.text('.fbp-export-title');
      const sc = await t.text('.fbp-export-scope');
      t.check(label, got === want && title === `Export ${want} shown` && (!scope || sc === scope),
        `${got} rows / "${title}" / "${sc}", expected ${want}${scope ? ` / "${scope}"` : ''}`);
    };
    await t.page.selectOption('select[aria-label="Type"]', 'bug');
    await expectShown('type Bug narrows the list and the export', (r) => typeOf(r) === 'bug', 'status New; type Bug; route any; reporter any');
    await t.page.selectOption('select[aria-label="Type"]', 'general');
    await expectShown('type General (no type, or the old neutral feedback)', (r) => typeOf(r) === 'general');
    await t.page.selectOption('select[aria-label="Type"]', 'all');
    await t.page.selectOption('select[aria-label="Route"]', '/schedule');
    await expectShown('route /schedule', (r) => r.route === '/schedule', 'status New; type any; route /schedule; reporter any');
    await t.page.selectOption('select[aria-label="Route"]', 'all');
    await t.page.selectOption('select[aria-label="Screenshots"]', 'with');
    await expectShown('with screenshots', (r) => (r.image_paths ?? []).length > 0, 'status New; type any; route any; reporter any; with screenshots');
    await t.page.selectOption('select[aria-label="Screenshots"]', 'any');
    await t.page.fill('input[aria-label="Search"]', 'checked My Hours');
    await expectShown('search matches what they tried', (r) => String(r.tried ?? '').includes('checked My Hours'));
    await t.press(t.page.getByRole('button', { name: 'Clear filters' }));
    await expectShown('Clear filters restores the full New list', () => true, 'status New; type any; route any; reporter any');
    for (const s of ['seen', 'wont_do']) {
      await t.press(t.page.locator('.fbp-tab', { hasText: STATUS_LABEL[s] }));
      const want = rows.filter((r) => norm(r.status) === s).length;
      t.eq(`tab ${STATUS_LABEL[s]} lists its ${want}`, await listCount(t), want);
    }
    await t.press(t.page.locator('.fbp-tab', { hasText: 'All (' }));
    t.eq('tab All lists every report', await listCount(t), rows.length);
    await t.press(t.page.locator('.fbp-tab', { hasText: 'New (' }));
    t.eq('back on New', await listCount(t), N);

    // ── the detail of the /hours report ──
    await t.press(t.page.locator('li.fbp-item[aria-label^="Open report: /hours"]'));
    await t.waitFor('.fbp-modal');
    const detail = await t.evaluate(() => {
      const m = document.querySelector('.fbp-modal');
      const kv = Object.fromEntries([...m.querySelectorAll('.fbp-kv')].map((d) => [d.children[0].textContent.trim(), d.children[1].textContent.trim()]));
      return {
        sections: [...m.querySelectorAll('.fbp-section')].map((s) => s.textContent.trim()),
        tried: m.querySelector('.fbp-tried')?.textContent.trim() ?? null,
        build: kv.Build,
        acts: [...m.querySelectorAll('.fbp-act')].map((b) => ({ label: b.textContent.trim(), disabled: b.disabled })),
        copy: m.querySelector('.fbp-rowcopy')?.textContent.trim() ?? null,
      };
    });
    t.check('detail shows "What they tried" with the report\'s text', detail.sections.includes('What they tried') && detail.tried === 'Reloaded the page and checked My Hours on a laptop too.', JSON.stringify(detail.tried));
    t.eq('detail Build reads the stamped build', detail.build, 'abc1234');
    t.eq('six Move-to buttons, only the current one (New) disabled', detail.acts,
      ORDER.map((s) => ({ label: STATUS_LABEL[s], disabled: s === 'new' })));
    t.eq('"Copy for Claude" in the detail', detail.copy, 'Copy for Claude');
    await t.shot('console-detail');
    await t.page.keyboard.press('Escape');
    await t.page.waitForSelector('.fbp-modal', { state: 'detached' });

    // ── markdown for chat, one part ──
    await t.evaluate(() => { window.__e2e.clip.length = 0; });
    await t.press(t.page.getByRole('button', { name: 'Markdown for chat' }));
    await t.waitFor('.fbp-parts');
    const md = (await t.e2e()).clip[0] ?? '';
    t.check('markdown starts "# Techmen feedback" and names the filter', md.startsWith('# Techmen feedback\n') && md.includes('Filter: status New; type any; route any; reporter any.'), md.slice(0, 120).replace(/\n/g, '\\n'));
    const headings = md.match(/^### R\d\d ·/gm) ?? [];
    t.check(`one "### Rnn ·" heading per shown report, starting at R01`, headings.length === N && headings[0] === '### R01 ·', `${headings.length} headings, first ${headings[0]}`);
    t.check('the copy note counts what was copied', (await t.text('.fbp-parts-note'))?.startsWith(`Copied: ${md.length.toLocaleString('en-US')} characters`), await t.text('.fbp-parts-note'));

    // ── the zip ──
    const zip = await downloadZip(t);
    const names = Object.keys(zip.byBase).sort();
    t.check('zip file name techmen-feedback-YYYY-MM-DD-HHMM.zip', /^techmen-feedback-\d{4}-\d\d-\d\d-\d{4}\.zip$/.test(zip.name), zip.name);
    t.check('the bytes are a real zip: every entry inflates and its CRC matches, and `unzip -t` agrees', zip.unzipOk && zip.entries.length >= 6, `${zip.size} bytes, ${zip.entries.length} entries; unzip: ${zip.unzipLine}`);
    for (const f of ['README.md', 'reports.md', 'reports.json', 'digest.txt', 'MARK_SEEN.sql', 'identities.txt']) {
      t.check(`zip holds ${f}`, names.includes(f), names.join(', '));
    }
    const json = JSON.parse(zip.byBase['reports.json']?.text() ?? '{}');
    const jsonCount = Array.isArray(json.reports) ? json.reports.length : Array.isArray(json) ? json.length : null;
    t.eq('reports.json holds exactly the shown reports', jsonCount, N);
    t.check('MARK_SEEN.sql moves to the NEW spelling', (zip.byBase['MARK_SEEN.sql']?.text() ?? '').includes("set status = 'seen'"), (zip.byBase['MARK_SEEN.sql']?.text() ?? '').match(/set status = '[^']+'/)?.[0]);
    const shots = newRows.reduce((n, r) => n + (r.image_paths ?? []).length, 0);
    t.check(`README says the ${shots} screenshots could not be read back (fixture storage has no bytes)`, (zip.byBase['README.md']?.text() ?? '').includes(`${shots} could not be read back from storage`), (zip.byBase['README.md']?.text() ?? '').split('\n').find((l) => /could not be read back/.test(l)));
    t.check('the done line names the archive', (await t.texts('.fbp-export .fbp-parts-note')).some((s) => s.startsWith(`Downloaded ${zip.name}: ${N} reports`)), (await t.texts('.fbp-export .fbp-parts-note')).join(' | '));

    // ── bulk move to Done, then Undo ──
    await t.page.locator('.fbp-selectall input').check();
    t.eq('select-all counts the shown reports', await t.text('.fbp-bulk-count'), `${N} selected`);
    t.eq('Move to with the six statuses', { label: await t.text('.fbp-bulk-label'), moves: await t.texts('.fbp-move') },
      { label: 'Move to', moves: ORDER.map((s) => STATUS_LABEL[s]) });
    moveButtonsWith0002.count = await t.count('.fbp-move');
    t.eq('bulk copy names the count', await t.text('.fbp-bulkcopy'), `Copy ${N} as prompt`);
    const ids = newRows.map((r) => r.id);
    const before = snapshot(rows, ids);
    const rpcBefore = (await t.calls()).filter((c) => c.kind === 'rpc' && c.name === 'feedback_set_status').length;
    await t.press(t.page.locator('.fbp-move', { hasText: 'Done' }));
    await t.waitFor('.fbp-undo');
    await t.settle();
    const note = await t.text('.fbp-note > span');
    t.check(`note: Moved ${N} reports to Done`, note?.startsWith(`Moved ${N} reports to Done: `), note);
    t.eq('Undo names where they go back to', await t.text('.fbp-undo'), 'Undo: back to New');
    t.eq('the New list is empty', { rows: await listCount(t), empty: await t.text('.fbp-muted') }, { rows: 0, empty: 'No feedback matches this filter.' });
    t.check(`tab reads Done (${N})`, (await t.texts('.fbp-tab')).includes(`Done (${N})`), (await t.texts('.fbp-tab')).join(', '));
    const rpcAfter = (await t.calls()).filter((c) => c.kind === 'rpc' && c.name === 'feedback_set_status');
    t.check('one feedback_set_status call, answered without error', rpcAfter.length - rpcBefore === 1 && !rpcAfter.at(-1).error, `${rpcAfter.length - rpcBefore} call(s), error ${rpcAfter.at(-1)?.error ?? null}`);
    const moved = snapshot(await t.rows('feedback'), ids);
    t.check('the store holds the move: status done, reviewed by the admin', moved.every((r) => r.status === 'done' && r.reviewed_by === P.admin.id && r.reviewed_at),
      `${moved.filter((r) => r.status === 'done').length}/${N} done`);
    await t.shot('console-moved');
    await t.press('.fbp-undo');
    await t.waitFor(() => document.querySelectorAll('li.fbp-item').length > 0);
    await t.settle();
    t.eq('Undo note', await t.text('.fbp-note > span'), `Undid the move to Done: ${N} reports back where they were.`);
    t.eq(`the ${N} reports are back on New`, await listCount(t), N);
    t.eq('Undo restores every status, reviewer and review time EXACTLY', snapshot(await t.rows('feedback'), ids), before);
    t.check('positive control: the move really changed those fields before the Undo', JSON.stringify(moved) !== JSON.stringify(before), 'moved snapshot differs from the original');

    // ── markdown in parts: past the 50,000-character part size ──
    const added = await t.evaluate(({ me }) => {
      const long = 'The schedule page did not load on the shop tablet after the update. '.repeat(40);
      for (let i = 0; i < 30; i += 1) {
        window.__fx.insert('feedback', { member_id: me, category: 'bug', status: 'open', route: '/schedule', message: `${long}(${i + 1})`, image_paths: [] });
      }
      return 30;
    }, { me: P.student.id });
    await t.press(t.page.getByRole('button', { name: 'Refresh' }));
    await t.waitFor((n) => document.querySelectorAll('li.fbp-item').length > 6);
    await t.settle();
    const bigN = await listCount(t);
    t.eq(`after adding ${added} long reports the New list has ${N + added}`, bigN, N + added);
    await t.evaluate(() => { window.__e2e.clip.length = 0; });
    await t.press(t.page.getByRole('button', { name: 'Markdown for chat' }));
    await t.waitFor('.fbp-part');
    const partButtons = await t.texts('.fbp-export .fbp-part');
    const nParts = partButtons.filter((s) => /part \d+/.test(s)).length;
    const partsNote = await t.text('.fbp-export .fbp-parts-note');
    t.check('a long export splits into numbered parts and says so', nParts >= 2 && partsNote?.startsWith(`Too long for one paste, so it is in ${nParts} parts`), `${nParts} parts; "${partsNote}"`);
    for (let i = 2; i <= nParts; i += 1) {
      await t.press(t.page.locator('.fbp-export .fbp-part', { hasText: `part ${i} (` }));
    }
    await t.settle({ quietMs: 200 });
    const clips = (await t.e2e()).clip;
    const all = clips.join('\n');
    const rids = all.match(/^### R\d\d ·/gm) ?? [];
    t.check('every part carries its own header and no part runs past 50,000 characters',
      clips.length === nParts && clips.every((c, i) => c.startsWith(`# Techmen feedback, part ${i + 1} of ${nParts}`) && c.length <= 50_000),
      `${clips.length} copied, lengths ${clips.map((c) => c.length).join('/')}`);
    t.check('across the parts every report appears exactly once', rids.length === bigN && new Set(rids).size === bigN, `${rids.length} headings, ${new Set(rids).size} distinct, of ${bigN}`);
    t.eq('every part button reads Copied once copied', (await t.texts('.fbp-export .fbp-part')).filter((s) => s.startsWith('Copied part')).length, nParts);

    // ════ console, migration 0002 NOT applied ═════════════════════════════
    t.as('console · mig none · admin');
    await t.open('/feedback', { persona: 'admin', mig: 'none', reset: true, ready: '.fbp-tabs' });
    await t.waitFor('li.fbp-item');
    await t.settle();
    rows = await t.rows('feedback');
    const setup = await t.text('.fbp-setup');
    t.check('the not-set-up line', setup?.startsWith('Not set up yet: migration 0002_feedback_console.sql has not been applied.'), setup?.slice(0, 90));
    t.eq('the same export bar', await t.text('.fbp-export-title'), `Export ${N} shown`);
    t.eq('the same tab counts, read through the legacy statuses', await t.texts('.fbp-tab'), tabTexts(rows));
    const order2 = await t.evaluate(() => [...document.querySelector('.fbp-wrap').children].map((el) => el.className.split(' ')[0]).slice(0, 3));
    t.eq('header, then the setup line, then the export bar', order2, ['fbp-head', 'fbp-setup', 'fbp-export']);
    await t.page.locator('.fbp-selectall input').check();
    t.check('bulk moves say they are not set up; the bulk copy still works',
      (await t.texts('.fbp-bulk-label')).includes('Bulk moves: not set up yet (migration 0002).') && (await t.text('.fbp-bulkcopy')) === `Copy ${N} as prompt`,
      `${(await t.texts('.fbp-bulk-label')).join(' | ')} / ${await t.text('.fbp-bulkcopy')}`);
    const movesNone = await t.count('.fbp-move');
    t.check('0 bulk move buttons (against 6 with 0002 on the same fixture)', movesNone === 0 && moveButtonsWith0002.count === 6, `${movesNone} vs ${moveButtonsWith0002.count}`);
    await t.page.locator('.fbp-selectall input').uncheck();
    await t.noHScroll();
    await t.shot('console-mig-none');
    await t.press(t.page.locator('li.fbp-item[aria-label^="Open report: /hours"]'));
    await t.waitFor('.fbp-modal');
    t.eq('detail offers exactly New, Seen, Won\'t do', await t.texts('.fbp-modal .fbp-act'), ['New', 'Seen', "Won't do"]);
    const buildLine = await t.evaluate(() => [...document.querySelectorAll('.fbp-modal .fbp-kv')].find((d) => d.children[0].textContent.trim() === 'Build')?.children[1].textContent.trim());
    t.eq('Build says it needs 0002 (the column cannot be read)', buildLine, 'not recorded (needs migration 0002)');
    const hoursId = rows.find((r) => r.route === '/hours').id;
    await t.press(t.page.locator('.fbp-modal .fbp-act', { hasText: 'Seen' }));
    await t.waitFor(() => document.querySelector('.fbp-modal .fbp-act-current')?.textContent.trim() === 'Seen');
    await t.settle();
    const stored = (await t.rows('feedback')).find((r) => r.id === hoursId);
    const upd = (await t.calls()).filter((c) => c.kind === 'update' && c.table === 'feedback');
    t.check('Seen writes the OLD spelling with a plain update', stored.status === 'reviewed' && stored.reviewed_by === P.admin.id && upd.length === 1 && !upd[0].error,
      `status ${stored.status}, reviewed_by ${stored.reviewed_by === P.admin.id ? 'admin' : stored.reviewed_by}, ${upd.length} update(s) error ${upd[0]?.error ?? null}`);
    t.eq('no RPC is called without 0002', (await t.calls()).filter((c) => c.kind === 'rpc' && /^feedback_/.test(c.name)).length, 0);
    await t.page.keyboard.press('Escape');
    await t.page.waitForSelector('.fbp-modal', { state: 'detached' });
    t.check('the tabs moved one report from New to Seen', (await t.texts('.fbp-tab')).slice(0, 2).join() === `New (${N - 1}),Seen (${tabTexts(rows)[1].match(/\d+/)[0] * 1 + 1})`, (await t.texts('.fbp-tab')).slice(0, 2).join());
    const zip2 = await downloadZip(t);
    const seenSql = zip2.byBase['MARK_SEEN.sql']?.text() ?? '';
    t.check('MARK_SEEN.sql writes the OLD spelling without 0002', zip2.unzipOk && seenSql.includes("set status = 'reviewed'") && !seenSql.includes("set status = 'seen'"), seenSql.match(/set status = '[^']+'/)?.[0]);

    // ════ non-admins ═════════════════════════════════════════════════════
    for (const mig of ['all', 'none']) {
      for (const who of ['student', 'mentor']) {
        t.as(`console · mig ${mig} · ${who}`);
        await t.open('/feedback', { persona: who, mig, ready: '.fbp-wrap' });
        const admin = { sentence: await t.text('.fbp-muted'), bars: await t.count('.fbp-export'), items: await t.count('li.fbp-item') };
        t.eq('one sentence, no console (0 export bars, against 1 for the admin)', admin, { sentence: 'Admin access required.', bars: 0, items: 0 });
        t.eq('no feedback rows are readable', (await t.calls()).filter((c) => c.table === 'feedback' && c.kind === 'select' && c.rows > 0).length, 0);
      }
    }

    // ── the nav badge and link ──
    for (const mig of ['all', 'none']) {
      t.as(`nav · mig ${mig}`);
      await t.open('/dashboard', { persona: 'admin', mig, reset: true, ready: '.nav-avatar-btn' });
      await t.press('.nav-avatar-btn');
      await t.waitFor('.nav-avatar-menu');
      await t.settle();
      const badge = await t.evaluate(() => document.querySelector('.nav-avatar-menu a[href="/feedback"] .nav-badge')?.textContent.trim() ?? null);
      t.eq('admin avatar menu: Feedback badge counts New (old and new spelling)', badge, String(N));
      await t.open('/dashboard', { persona: 'mentor', mig, ready: '.nav-avatar-btn' });
      await t.press('.nav-avatar-btn');
      await t.waitFor('.nav-avatar-menu');
      t.eq('mentor avatar menu has no Feedback link (0, against 1 for the admin)', await t.count('.nav-avatar-menu a[href="/feedback"]'), 0);
    }

    // ════ the widget ═════════════════════════════════════════════════════
    for (const mig of ['all', 'none']) {
      t.as(`widget · mig ${mig} · student`);
      await t.open('/dashboard', { persona: 'student', mig, reset: true, ready: '.fb-launch' });
      t.eq('one launcher on an authenticated page', await t.count('.fb-launch'), 1);
      await t.press('.fb-launch');
      await t.waitFor('.fb-panel');
      t.eq('"Type (optional)" with Bug and Idea, neither picked', {
        label: await t.text('#fb-type-label'),
        chips: await t.evaluate(() => [...document.querySelectorAll('.fb-cat')].map((b) => `${b.textContent.trim()}:${b.getAttribute('aria-pressed')}`)),
      }, { label: 'Type (optional)', chips: ['Bug:false', 'Idea:false'] });
      t.eq('labels for both text boxes', await t.evaluate(() => ({
        message: document.querySelector('label[for="fb-message"]')?.textContent.trim(),
        tried: document.querySelector('label[for="fb-tried"]')?.textContent.trim(),
      })), { message: 'What happened?', tried: 'What did you try? (optional)' });
      const ctx = await t.text('.fb-context');
      const m = ctx?.match(/^Sent with it: \/dashboard · (\d+)x(\d+)(?: · ([^·]+))? · build (\S+)$/);
      const stamp = m?.[4];
      t.check('context line: route, viewport, browser and a real build stamp', !!m && Number(m[1]) === t.vp.viewport.width && /^[0-9a-f]{7,}$/.test(stamp) && gitObjectIsCommit(stamp),
        `"${ctx}"${stamp ? `; ${stamp} ${gitObjectIsCommit(stamp) ? 'is' : 'is NOT'} a commit here` : ''}`);
      t.check('Send is off with an empty message', await t.page.locator('.fb-submit').isDisabled(), 'disabled');
      await t.page.fill('#fb-message', 'The hours card flickered when I opened it.');
      t.check('Send is on with a message and NO type picked', await t.page.locator('.fb-submit').isEnabled()
        && (await t.evaluate(() => [...document.querySelectorAll('.fb-cat')].every((b) => b.getAttribute('aria-pressed') === 'false'))), 'enabled, 0 types pressed');
      await t.page.fill('#fb-tried', 'Reloaded twice.');
      await t.tapTargets('.fb-cat, .fb-submit, .fb-drop, .fb-launch', 'launcher, type chips, attach area and Send at least 44px tall', { everyWidth: true });
      await t.shot(`widget-mig-${mig}`);
      const before = (await t.rows('feedback')).length;
      await t.press('.fb-submit');
      await t.waitText('Sent. Thank you.');
      await t.settle();
      const ins = (await t.e2e()).inserts.filter((i) => i.table === 'feedback').map((i) => i.payload);
      const answers = (await t.calls()).filter((c) => c.kind === 'insert' && c.table === 'feedback').map((c) => c.error);
      const after = await t.rows('feedback');
      const saved = after.find((r) => r.member_id === P.student.id && String(r.message).startsWith('The hours card flickered'));
      t.eq('exactly one report stored', after.length - before, 1);
      t.check('first attempt: no type (null), with tried and build as their own fields',
        ins[0] && ins[0].category === null && ins[0].tried === 'Reloaded twice.' && ins[0].build === stamp && ins[0].message === 'The hours card flickered when I opened it.',
        JSON.stringify(ins[0] && { category: ins[0].category, tried: ins[0].tried, build: ins[0].build }));
      if (mig === 'all') {
        // 0002 makes category nullable. If the fixture declares that change
        // (features/c.js `alters`), the first insert lands; if it does not, it
        // answers 23502 like the pre-0002 table and the ladder's type rung
        // runs. Either way tried/build stay columns.
        const modelled = answers.length === 1;
        t.check('stored with tried and build in their own columns, nothing folded into the message',
          saved && saved.tried === 'Reloaded twice.' && saved.build === stamp && !/What I tried:/.test(saved.message)
            && (modelled ? saved.category === null : (answers.join() === '23502,' && saved.category === 'feedback')),
          `${answers.length} attempt(s) answered [${answers.map((a) => a ?? 'ok').join(', ')}], category ${JSON.stringify(saved?.category)}${modelled ? '' : ' -- FIXTURE: features/c.js has no `alters` for 0002, so the fixture refuses a null category it should accept'}`);
      } else {
        t.check('ladder without 0002: tried/build refused (PGRST204), folded into the message, then the old NOT NULL (23502) takes the neutral type',
          answers.join() === 'PGRST204,23502,' && ins.length === 3 && !('tried' in ins[1]) && !('build' in ins[1])
            && ins[1].message.includes('What I tried:\nReloaded twice.') && ins[1].message.includes(`Build: ${stamp}`) && ins[2].category === 'feedback',
          `answers [${answers.map((a) => a ?? 'ok').join(', ')}], attempt 2 keys ${ins[1] ? Object.keys(ins[1]).join('/') : '-'}, attempt 3 category ${ins[2]?.category}`);
        t.check('stored: what they tried kept, inside the message', saved && saved.message.includes('What I tried:\nReloaded twice.') && saved.message.includes(`Build: ${stamp}`) && saved.category === 'feedback',
          JSON.stringify(saved && saved.message.slice(-60)));
      }
      // Positive control: a picked type travels as-is.
      await t.page.waitForSelector('.fb-panel', { state: 'detached', timeout: 10_000 });
      await t.evaluate(() => { window.__e2e.inserts.length = 0; });
      await t.press('.fb-launch');
      await t.waitFor('.fb-panel');
      await t.press(t.page.locator('.fb-cat', { hasText: 'Bug' }));
      t.eq('tapping a type presses it', await t.evaluate(() => document.querySelector('.fb-cat')?.getAttribute('aria-pressed')), 'true');
      await t.page.fill('#fb-message', 'Second report, typed.');
      await t.press('.fb-submit');
      await t.waitText('Sent. Thank you.');
      await t.settle();
      const typed = (await t.rows('feedback')).find((r) => r.message.startsWith('Second report, typed.'));
      t.eq('positive control: a picked type is stored as picked', typed?.category, 'bug');
    }

    // ── the check-in fast paths carry no widget ──
    t.as('widget · check-in paths · student2');
    await t.open('/dashboard', { persona: 'student2', mig: 'all', ready: '.fb-launch' });
    const onDash = await t.count('.fb-launch');
    const evBefore = (await t.rows('attendance_events')).length;
    for (const route of ['/checkin?loc=shop-main', '/checkin-volunteer?loc=fll-room']) {
      await t.open(route, { persona: 'student2', ready: () => /Tap to confirm/.test(document.body.textContent || '') });
      t.check(`${route.split('?')[0]} has 0 launchers (against ${onDash} on /dashboard)`, (await t.count('.fb-launch')) === 0 && onDash === 1, `${await t.count('.fb-launch')} vs ${onDash}`);
    }
    t.eq('opening them for a checked-out member wrote nothing', (await t.rows('attendance_events')).length - evBefore, 0);
  },
};
