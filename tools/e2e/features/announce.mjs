/**
 * /announce -- an admin posts to the team Discord (lane e, migration 0003,
 * src/AnnouncePage.jsx + src/discordAnnounce.js).
 *
 * Claims under test, each in both directions:
 *  - admin only: a mentor and a student get one sentence and no composer, in
 *    both migration states; the avatar menu carries Announce for the admin
 *    alone;
 *  - mig none: the "Not set up yet" card naming the migration file and
 *    nothing else (no composer, no role editor, no log), against all of them
 *    with 0003 applied;
 *  - the preview IS the payload: allowed_mentions.parse is [] and
 *    allowed_mentions.roles is exactly the ticked role ids, in role order,
 *    as roles are ticked and unticked; "@everyone" in the text never renders
 *    as a literal mass ping;
 *  - the role table editor: deactivate removes a chip and activate brings it
 *    back; a bad id is refused with the 17-to-20-digits sentence and a good
 *    one adds a chip; an empty table says "add roles first";
 *  - the function states: not deployed (a fetch error), the fixture's own
 *    answer, still answering, needing setup, and deployed-and-ready (each
 *    stubbed for one page), with Send off in all but the last; a send carries
 *    exactly the ticked role ids.
 *
 * Expectation corrected here: lane e expected the substring
 * '"roles": [ "100000000000000001" ]', which never occurs -- the payload is
 * rendered with JSON.stringify(payload, null, 2), so the id sits on its own
 * line. The spec parses the JSON instead (the lane e reviewer said the same).
 */
const ROLE_CHIPS = ['@Mechanical', '@Electrical', '@Programming', '@CAD', '@Business/Media', '@Scouting', '@Drive Team'];
const MECH = '100000000000000001';
const CAD = '100000000000000004';

async function payload(t) {
  const raw = await t.text('.an-json pre');
  try { return JSON.parse(raw); } catch { return null; }
}

async function chipTexts(t) {
  // Role chips are the composer's second chip group: "@..." labels.
  return (await t.texts('section[aria-label="Compose"] .an-chip')).filter((s) => s.startsWith('@'));
}

async function tick(t, name) {
  await t.press(t.page.locator('section[aria-label="Compose"] .an-chip', { hasText: new RegExp(`^@${name.replace('/', '\\/')}$`) }));
}

export default {
  async run(t) {
    // ════ admin, migration 0003 applied, the fixture's own function answer ══
    t.as('mig all · admin');
    await t.open('/announce', { persona: 'admin', mig: 'all', reset: true, ready: '.an-status-line:not([data-state="loading"])' });
    await t.settle();
    t.eq('h1 reads Announce (textContent; CSS uppercases it)', await t.text('h1.an-title'), 'Announce');
    const fixtureState = await t.evaluate(() => document.querySelector('.an-status-line')?.dataset.state);
    const fixtureLine = await t.text('.an-status-line');
    t.check('the status line says sending is off, with no empty list in it', ['needs-setup', 'not_deployed'].includes(fixtureState) && !/: \./.test(fixtureLine) && /compose and preview/.test(fixtureLine),
      `data-state ${fixtureState}: "${fixtureLine}"`);
    t.eq('channel chips, #announcements pressed', await t.evaluate(() => [...document.querySelectorAll('section[aria-label="Compose"] .an-chips')][0]
      ? [...[...document.querySelectorAll('section[aria-label="Compose"] .an-chips')][0].querySelectorAll('.an-chip')].map((b) => `${b.textContent.trim()}:${b.getAttribute('aria-pressed')}`) : null),
      ['#announcements:true', '#general:false', '#event-logistics:false', '#parents:false']);
    t.eq('exactly the 7 active roles as chips, in order (no @Student: inactive)', await chipTexts(t), ROLE_CHIPS);
    t.eq('message box with an empty counter, and the poll and embed toggles', {
      area: await t.count('section[aria-label="Compose"] textarea'),
      counter: await t.text('.an-label-row .an-count'),
      toggles: await t.texts('.an-toggles .an-chip'),
    }, { area: 1, counter: '0/2000', toggles: ['Add a poll', 'Add an embed'] });
    const review = t.page.getByRole('button', { name: 'Review and send' });
    t.check('"Review and send" is off with nothing written', await review.isDisabled(), 'disabled');
    t.eq('preview: Team bot, nothing to send yet, and the exact payload', {
      author: (await t.text('.an-msg-author'))?.replace(/\s*BOT$/, ''),
      empty: await t.text('.an-preview .an-muted'),
      details: await t.text('.an-json summary'),
    }, { author: 'Team bot', empty: 'Nothing to send yet.', details: 'Exact payload' });
    const roleRows = await t.evaluate(() => [...document.querySelectorAll('#announce-roles .an-role')].map((li) => ({
      name: li.querySelector('.an-role-name')?.textContent.trim(),
      inactive: !!li.querySelector('.an-pill'),
      toggle: [...li.querySelectorAll('.an-btn')].map((b) => b.textContent.trim())[0],
    })));
    t.check('Discord roles: 8 rows, Student marked Inactive with Activate', roleRows.length === 8
      && roleRows.filter((r) => r.inactive).map((r) => `${r.name}/${r.toggle}`).join() === 'Student/Activate', JSON.stringify(roleRows.filter((r) => r.inactive)));
    t.eq('an "Add role" form', await t.text('.an-role-add button[type=submit]'), 'Add role');
    const log = await t.evaluate(() => [...document.querySelectorAll('.an-log-item')].map((li) => ({
      status: li.querySelector('.an-pill')?.textContent.trim(),
      channel: li.querySelector('.an-log-top .an-mono')?.textContent.trim(),
      error: li.querySelector('.an-log-error')?.textContent.trim() ?? null,
    })));
    t.eq('Recent announcements, newest first: Unconfirmed, Failed, Sent', log.map((r) => `${r.status} ${r.channel}`),
      ['Unconfirmed #announcements', 'Failed #parents', 'Sent #announcements']);
    t.check('the failed row says what Discord refused', log[1]?.error?.startsWith('The bot is missing a permission in #parents'), log[1]?.error);
    t.eq('no not-set-up card and no admin sentence', { setup: await t.count('[data-state="not-set-up"]'), denied: (await t.bodyText()).includes('Admin access required.') }, { setup: 0, denied: false });
    await t.shot('mig-all-fixture-function');

    // ── the preview is the payload ──
    await t.page.fill('section[aria-label="Compose"] textarea', '@everyone hello');
    await tick(t, 'Mechanical');
    const msg = await t.text('.an-msg-text');
    t.check('@everyone renders with a zero-width space, never as a literal mass ping', !!msg && !msg.includes('@everyone') && msg.includes('@​everyone hello') && msg.startsWith('@Mechanical'),
      JSON.stringify(msg));
    let p = await payload(t);
    t.check('payload: parse [] and roles exactly the one ticked id', !!p && JSON.stringify(p.allowed_mentions) === JSON.stringify({ parse: [], roles: [MECH] }),
      JSON.stringify(p?.allowed_mentions));
    // Raw textContent: t.text() collapses whitespace, which would manufacture
    // the one-line form this check exists to show never occurs.
    const rawJson = await t.evaluate(() => document.querySelector('.an-json pre')?.textContent ?? '');
    t.check('the raw payload text holds "parse": [] and the id (the lane\'s one-line substring never occurs: pretty-printed)',
      rawJson.includes('"parse": []') && rawJson.includes(`"${MECH}"`) && !rawJson.includes(`"roles": [ "${MECH}" ]`), 'both present; one-line form absent');
    await tick(t, 'CAD');
    p = await payload(t);
    t.eq('ticking @CAD: roles are exactly both ids, in role order', p?.allowed_mentions?.roles, [MECH, CAD]);
    t.check('the content pings exactly the ticked roles on its first line', p?.content?.split('\n')[0] === `<@&${MECH}> <@&${CAD}>`, JSON.stringify(p?.content?.split('\n')[0]));
    await tick(t, 'Mechanical');
    p = await payload(t);
    t.eq('unticking @Mechanical: roles are exactly the one left', p?.allowed_mentions?.roles, [CAD]);
    await tick(t, 'CAD');
    p = await payload(t);
    t.eq('nothing ticked: roles [] and still parse []', p?.allowed_mentions, { parse: [], roles: [] });
    t.check('"Review and send" is on once there is text', await review.isEnabled(), 'enabled');
    t.check('"Check with server" is off while the function cannot answer a preview',
      fixtureState === 'not_deployed' ? await t.page.getByRole('button', { name: 'Check with server' }).isDisabled() : true,
      `function state ${fixtureState}`);
    await tick(t, 'Mechanical');
    await t.press(review);
    await t.waitFor('section[aria-label="Confirm"]');
    const sendNow = t.page.getByRole('button', { name: 'Send now' });
    t.check('the confirm step shows "Send now", and it is OFF', (await sendNow.count()) === 1 && await sendNow.isDisabled(), 'present, disabled');
    const off = await t.text('section[aria-label="Confirm"] .an-note-bad');
    t.check('it says why sending is off, with no empty list in it', !!off && off.startsWith('Sending is off. ') && !/: \./.test(off) && !/needs \.?$/.test(off), JSON.stringify(off));
    t.check('the confirm sentence names the channel and the ping', (await t.text('section[aria-label="Confirm"] p'))?.includes('Post to #announcements as the team bot, notifying @Mechanical'), await t.text('section[aria-label="Confirm"] p'));
    await t.press(t.page.getByRole('button', { name: 'Back to the draft' }));
    await t.waitFor('section[aria-label="Compose"]');

    // ── layout ──
    await t.noHScroll();
    if (t.isPhone) {
      await t.tapTargets('.an-wrap button, .an-wrap input:not([type=checkbox]), .an-wrap textarea, .an-wrap select', 'every visible button, chip, input and textarea at least 44px tall');
      const geo = await t.evaluate(() => {
        const c = document.querySelector('section[aria-label="Compose"]').getBoundingClientRect();
        const pv = document.querySelector('.an-preview').getBoundingClientRect();
        return { composerBottom: Math.round(c.bottom), previewTop: Math.round(pv.top) };
      });
      t.check('at 375 the preview sits below the composer', geo.previewTop >= geo.composerBottom, JSON.stringify(geo));
    } else {
      const geo = await t.evaluate(() => {
        const c = document.querySelector('section[aria-label="Compose"]').getBoundingClientRect();
        const pv = document.querySelector('.an-preview').getBoundingClientRect();
        return { composerRight: Math.round(c.right), previewLeft: Math.round(pv.left), composerTop: Math.round(c.top), previewTop: Math.round(pv.top) };
      });
      t.check('at 1440 the preview sits beside the composer', geo.previewLeft >= geo.composerRight && Math.abs(geo.previewTop - geo.composerTop) < 80, JSON.stringify(geo));
    }
    await t.shot('mig-all-composed');

    // ── the role table editor ──
    const mechRow = t.page.locator('#announce-roles .an-role', { has: t.page.locator('.an-role-name', { hasText: /^Mechanical$/ }) });
    await t.press(mechRow.getByRole('button', { name: 'Deactivate' }));
    await t.waitFor(() => !document.querySelector('section[aria-label="Compose"]')?.textContent.includes('@Mechanical'));
    await t.settle();
    t.check('Deactivate: the chip goes, the row reads Inactive, the ticked id drops out of the payload',
      !(await chipTexts(t)).includes('@Mechanical') && (await mechRow.locator('.an-pill').count()) === 1 && JSON.stringify((await payload(t))?.allowed_mentions?.roles) === '[]',
      `${(await chipTexts(t)).length} chips; roles ${JSON.stringify((await payload(t))?.allowed_mentions?.roles)}`);
    const stored = (await t.rows('discord_announce_roles')).find((r) => r.name === 'Mechanical');
    t.eq('the store holds the deactivation', stored?.active, false);
    await t.press(mechRow.getByRole('button', { name: 'Activate' }));
    await t.waitFor(() => document.querySelector('section[aria-label="Compose"]')?.textContent.includes('@Mechanical'));
    t.eq('Activate: the chip is back in its place', await chipTexts(t), ROLE_CHIPS);
    await t.page.fill('.an-role-add input >> nth=0', 'Pit Crew');
    await t.page.fill('.an-role-add input >> nth=1', '12345');
    await t.press('.an-role-add button[type=submit]');
    await t.waitFor('#announce-roles [role=alert]');
    const alert = await t.text('#announce-roles [role=alert]');
    const rowsAfterBad = (await t.rows('discord_announce_roles')).length;
    t.check('a short id is refused with the 17-to-20-digits sentence and nothing is written', alert?.includes('17 to 20 digits') && rowsAfterBad === 8, `"${alert}", ${rowsAfterBad} rows`);
    await t.page.fill('.an-role-add input >> nth=1', '100000000000000099');
    await t.press('.an-role-add button[type=submit]');
    await t.waitFor(() => document.querySelector('section[aria-label="Compose"]')?.textContent.includes('@Pit Crew'));
    await t.settle();
    t.check('a valid id adds the role, and its chip appears', (await chipTexts(t)).includes('@Pit Crew') && (await t.rows('discord_announce_roles')).length === 9 && (await t.count('#announce-roles [role=alert]')) === 0,
      `${(await chipTexts(t)).join(', ')}`);
    const pitRow = t.page.locator('#announce-roles .an-role', { has: t.page.locator('.an-role-name', { hasText: /^Pit Crew$/ }) });
    const pitStored = (await t.rows('discord_announce_roles')).find((r) => r.name === 'Pit Crew');
    t.check('the new role\'s own row agrees with its chip: not Inactive, toggle reads Deactivate', (await pitRow.locator('.an-pill').count()) === 0
      && ((await pitRow.locator('.an-btn').first().textContent()) ?? '').trim() === 'Deactivate',
      `pill ${await pitRow.locator('.an-pill').count()}, toggle "${((await pitRow.locator('.an-btn').first().textContent()) ?? '').trim()}"; stored active ${JSON.stringify(pitStored?.active)}${pitStored?.active === undefined ? ' (FIXTURE: features/e.js gives the new table no column defaults; the live column is not null default true)' : ''}`);
    await t.press(pitRow.getByRole('button', { name: 'Delete' }));
    const armed = await pitRow.locator('.an-btn-danger').textContent();
    t.check('Delete arms first and names what it deletes', armed?.trim() === 'Delete Pit Crew? Past posts keep their copy.', armed);
    t.check('positive control: nothing deleted on the first click', (await t.rows('discord_announce_roles')).length === 9, `${(await t.rows('discord_announce_roles')).length} rows`);
    await t.press(pitRow.locator('.an-btn-danger'));
    await t.waitFor(() => !document.querySelector('section[aria-label="Compose"]')?.textContent.includes('@Pit Crew'));
    await t.settle();
    t.eq('the second click deletes it: 8 rows and the 7 chips', { rows: (await t.rows('discord_announce_roles')).length, chips: await chipTexts(t) }, { rows: 8, chips: ROLE_CHIPS });

    // ── an empty role table ──
    t.as('mig all · admin · no roles');
    await t.evaluate(() => { window.__fx.db.discord_announce_roles = []; window.__fx.save(); });
    await t.open('/announce', { persona: 'admin', mig: 'all', ready: 'section[aria-label="Compose"]' });
    t.check('"No roles yet. Add roles first" and no role chips', (await t.text('[data-state="no-roles"]'))?.startsWith('No roles yet. Add roles first in Discord roles below') && (await chipTexts(t)).length === 0,
      `${await t.count('[data-state="no-roles"]')} note, ${(await chipTexts(t)).length} chips`);
    await t.page.fill('section[aria-label="Compose"] textarea', 'Shop closed Friday.');
    t.eq('with no roles the payload pings nobody', (await payload(t))?.allowed_mentions, { parse: [], roles: [] });
    await t.page.fill('.an-role-add input >> nth=0', 'Programming');
    await t.page.fill('.an-role-add input >> nth=1', '12345');
    await t.press('.an-role-add button[type=submit]');
    await t.waitFor('#announce-roles [role=alert]');
    t.check('a bad id: refused with the 17-to-20-digits sentence, still no chips', (await t.text('#announce-roles [role=alert]'))?.includes('17 to 20 digits') && (await chipTexts(t)).length === 0, await t.text('#announce-roles [role=alert]'));
    await t.page.fill('.an-role-add input >> nth=1', '100000000000000003');
    await t.press('.an-role-add button[type=submit]');
    await t.waitFor(() => document.querySelector('section[aria-label="Compose"]')?.textContent.includes('@Programming'));
    await t.settle();
    t.check('a valid id: the @Programming chip returns and the note goes', JSON.stringify(await chipTexts(t)) === '["@Programming"]' && (await t.count('[data-state="no-roles"]')) === 0, (await chipTexts(t)).join(', '));
    await t.shot('mig-all-no-roles');

    // ════ the function stubbed for one page: not deployed, then ready ══════
    t.as('mig all · admin · function not deployed');
    await t.newPage({ stubs: { 'discord-announce': 'fetch_error' } });
    await t.open('/announce', { persona: 'admin', mig: 'all', reset: true, ready: '.an-status-line:not([data-state="loading"])' });
    await t.settle();
    t.eq('not deployed: the plain sentence', { state: await t.evaluate(() => document.querySelector('.an-status-line')?.dataset.state), line: await t.text('.an-status-line') },
      { state: 'not_deployed', line: 'The announce function is not deployed yet. You can compose and preview; sending is off until it is deployed.' });
    await t.page.fill('section[aria-label="Compose"] textarea', 'Test');
    t.check('"Check with server" is off while not deployed; "Review and send" is on', await t.page.getByRole('button', { name: 'Check with server' }).isDisabled()
      && await t.page.getByRole('button', { name: 'Review and send' }).isEnabled(), 'off / on');
    await t.press(t.page.getByRole('button', { name: 'Review and send' }));
    await t.waitFor('section[aria-label="Confirm"]');
    t.check('"Send now" present and OFF', await t.page.getByRole('button', { name: 'Send now' }).isDisabled(), 'disabled');
    await t.shot('function-not-deployed');

    t.as('mig all · admin · function still answering');
    await t.newPage({ stubs: { 'discord-announce': 'hang' } });
    await t.open('/announce', { persona: 'admin', mig: 'all', ready: 'section[aria-label="Compose"]' });
    t.eq('still checking: the loading line', { state: await t.evaluate(() => document.querySelector('.an-status-line')?.dataset.state), line: await t.text('.an-status-line') },
      { state: 'loading', line: 'Checking the announce function…' });
    await t.page.fill('section[aria-label="Compose"] textarea', 'Test');
    await t.press(t.page.getByRole('button', { name: 'Review and send' }));
    await t.waitFor('section[aria-label="Confirm"]');
    t.check('"Send now" OFF, and the confirm step says it is still checking (never "answered")', await t.page.getByRole('button', { name: 'Send now' }).isDisabled()
      && (await t.text('section[aria-label="Confirm"] .an-note-bad')) === 'Sending is off. Still checking the announce function.', await t.text('section[aria-label="Confirm"] .an-note-bad'));

    t.as('mig all · admin · function needs setup');
    await t.newPage({ stubs: { 'discord-announce': 'announce_needs_setup' } });
    await t.open('/announce', { persona: 'admin', mig: 'all', ready: '.an-status-line:not([data-state="loading"])' });
    await t.settle();
    t.eq('needs setup: the function names what is missing', { state: await t.evaluate(() => document.querySelector('.an-status-line')?.dataset.state), line: await t.text('.an-status-line') },
      { state: 'needs-setup', line: 'Needs setup before anything can be sent: DISCORD_BOT_TOKEN. You can still compose and preview.' });
    await t.page.fill('section[aria-label="Compose"] textarea', 'Test');
    await t.press(t.page.getByRole('button', { name: 'Review and send' }));
    await t.waitFor('section[aria-label="Confirm"]');
    t.check('"Send now" OFF, and the confirm step says what is missing', await t.page.getByRole('button', { name: 'Send now' }).isDisabled()
      && (await t.text('section[aria-label="Confirm"] .an-note-bad')) === 'Sending is off. Needs setup before anything can be sent: DISCORD_BOT_TOKEN.', await t.text('section[aria-label="Confirm"] .an-note-bad'));

    t.as('mig all · admin · function ready');
    await t.newPage({ stubs: { 'discord-announce': 'announce_ready' } });
    await t.open('/announce', { persona: 'admin', mig: 'all', ready: '.an-status-line:not([data-state="loading"])' });
    await t.settle();
    t.eq('ready: connected', { state: await t.evaluate(() => document.querySelector('.an-status-line')?.dataset.state), line: await t.text('.an-status-line') },
      { state: 'ready', line: 'Announce function connected.' });
    await t.page.fill('section[aria-label="Compose"] textarea', 'Pit build Saturday 9 AM.');
    await tick(t, 'Electrical');
    await tick(t, 'Drive Team');
    await t.press(t.page.getByRole('button', { name: 'Review and send' }));
    await t.waitFor('section[aria-label="Confirm"]');
    t.check('positive control: with the function ready "Send now" is ON', await t.page.getByRole('button', { name: 'Send now' }).isEnabled(), 'enabled');
    await t.press(t.page.getByRole('button', { name: 'Send now' }));
    await t.waitFor('section[aria-label="Result"]');
    const sent = (await t.e2e()).invokes.filter((i) => i.name === 'discord-announce' && i.body?.action === 'send');
    t.check('one send, carrying exactly the two ticked role ids and a request id', sent.length === 1
      && JSON.stringify([...sent[0].body.draft.roleIds].sort()) === JSON.stringify(['100000000000000002', '100000000000000007'])
      && /^[0-9a-f-]{36}$/.test(sent[0].body.request_id), JSON.stringify(sent[0]?.body?.draft?.roleIds));
    t.eq('the result says Sent', await t.text('section[aria-label="Result"] h2'), 'Sent');

    // ════ admin, migration 0003 NOT applied ════════════════════════════════
    t.as('mig none · admin');
    await t.newPage();
    await t.open('/announce', { persona: 'admin', mig: 'none', reset: true, ready: '.an-setup, section[aria-label="Compose"]' });
    await t.settle();
    const card = await t.text('.an-setup[data-state="not-set-up"]');
    t.check('the Not set up yet card names the migration file', card?.startsWith('Not set up yet') && card.includes('supabase/migrations/0003_discord_announcements.sql'), card?.slice(0, 120));
    const gone = {
      textarea: await t.count('textarea'),
      review: await t.page.getByRole('button', { name: 'Review and send' }).count(),
      roles: await t.count('#announce-roles'),
      log: await t.count('section[aria-label="Recent announcements"]'),
    };
    t.eq('nothing else: no composer, no role editor, no log (all present with 0003)', gone, { textarea: 0, review: 0, roles: 0, log: 0 });
    t.eq('the page asks the function nothing before 0003', (await t.e2e()).invokes.length, 0);
    t.eq('h1 still reads Announce', await t.text('h1.an-title'), 'Announce');
    await t.noHScroll();
    await t.shot('mig-none-admin');

    // ════ non-admins, both states ═════════════════════════════════════════
    for (const mig of ['all', 'none']) {
      for (const who of ['mentor', 'student']) {
        t.as(`mig ${mig} · ${who}`);
        await t.open('/announce', { persona: who, mig, ready: '.an-wrap' });
        await t.settle();
        const r = {
          sentence: await t.text('.an-wrap .an-muted'),
          textarea: await t.count('textarea'),
          chips: await t.count('.an-chip'),
          reads: (await t.calls()).filter((c) => /^discord_announce/.test(c.table ?? '')).length,
          invokes: (await t.e2e()).invokes.length,
        };
        t.eq('one sentence; no composer, no chips, no reads, no function call', r, { sentence: 'Admin access required.', textarea: 0, chips: 0, reads: 0, invokes: 0 });
      }
    }
    for (const who of ['admin', 'mentor']) {
      t.as(`nav · ${who}`);
      await t.open('/dashboard', { persona: who, mig: 'all', ready: '.nav-avatar-btn' });
      await t.press('.nav-avatar-btn');
      await t.waitFor('.nav-avatar-menu');
      t.eq(`Announce in the avatar menu: ${who === 'admin' ? 1 : 0}`, await t.count('.nav-avatar-menu a[href="/announce"]'), who === 'admin' ? 1 : 0);
    }
  },
};
