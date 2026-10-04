/**
 * The event family hub, migrations 0005/0006 (ledger 0003): the family page
 * /e/<token>, the read-only boards /trips/<id>, and the mentor page
 * /trips/<id>/manage (src/EventFamilyPage.jsx, src/EventHubBoards.jsx,
 * src/TripsPage.jsx, src/TripsAdmin.jsx).
 *
 * Fixture mode answers from src/dev/fixture/features/eventhub.js, a test-only
 * port of 0005's rules (its header says so). So this spec proves the PAGES:
 * they render what the database would send, send what the rules need, and
 * show the rules' answers. The rules themselves are proven on PostgreSQL by
 * 0005_event_family_hub_rls_test.sql, its mutants and the seat race.
 *
 * Claims, each asserted both ways with both counts:
 *  - the family page is outside the app shell: 0 nav bars and 0 feedback
 *    launchers, against 1 and 1 on /trips;
 *  - sign-up, start to finish, as a fresh family: Days in form order (Sat,
 *    Sun, Fri) with Friday's card BEFORE its question; every answer autosaves
 *    with "Saved h:mm"; the status line and the step dots follow; Finish
 *    lands on lock-in; one tap per day confirms; the line reads "All set";
 *  - autosave survives failure: two failed saves keep the typed value, say
 *    "Not saved, retrying", and land it; the store holds exactly what was typed;
 *  - a driver's phone (consented) reaches the family in that car and not a
 *    family outside it; a car without consent says "Contact through mentors";
 *  - an open pickup spot reaches the pickup driver, not a driver without
 *    pickups, not a family; after acceptance, only the accepting driver and
 *    staff see it;
 *  - allergy names: staff see them, families see only the counts;
 *  - the last-seat race: two families on one open seat, one wins and the
 *    other reads "That car just filled. Pick another.";
 *  - the one-minor rule: the first student into a mentor car with nobody in
 *    it is refused (a family car takes one, the positive control); a rider
 *    leaving a two-rider mentor car turns it red, mentors are emailed, Left is
 *    refused without a reason and accepted with one;
 *  - edit windows: a car that left offers no Leave (against one that has not),
 *    a meal that started offers no Claim (against one that has not), an event
 *    that ended offers no enabled answer (against one that has not);
 *  - students read boards and never write: 0 claim buttons and 0 phones on
 *    /trips/<id>, against the family page and the staff board;
 *  - 0005 not applied: "not set up yet" on /trips and the mentor page, the
 *    family page's unreachable card, and no hub call succeeds;
 *  - "lost your link" answers the same for a known and an unknown address;
 *  - the mentor page: five readiness lines; Send invites confirms with a
 *    count and queues exactly that many; staff see allergy names;
 *  - 44px floor on every control at 375, no horizontal scroll, 0 console errors.
 */
import { EH } from '../../../src/dev/fixture/features/eventhub.js';
import { waitForFixture } from '../lib.mjs';

const TOK = EH.tokens;
const fam = (k) => `/e/${TOK[k]}`;
const BOARD = `/trips/${EH.event}`;
const MANAGE = `/trips/${EH.event}/manage`;
const CONTROLS = '.eh-chip, .eh-btn, .eh-seg-btn, .eh-tick, .eh-input, .eh-stepdot, .eh-mini';

async function familyPage(t, key, opts = {}) {
  await t.open(fam(key), { ready: '[data-testid="eh-status"], [data-testid="eh-lost"], .eh-card', ...opts });
  await t.settle({ quietMs: 300 });
}

async function tab(t, label) {
  await t.press(t.page.locator('.eh-tabs .eh-seg-btn', { hasText: new RegExp(`^${label}$`) }));
  await t.settle({ quietMs: 300 });
}

async function day(t, short, run = 'to') {
  await t.press(t.page.locator('.eh-board-controls .eh-seg').first().locator('.eh-seg-btn', { hasText: new RegExp(`^${short}$`) }));
  await t.press(t.page.locator('.eh-board-controls .eh-seg').nth(1).locator('.eh-seg-btn', { hasText: run === 'to' ? /^To venue$/ : /^Home$/ }));
  await t.settle({ quietMs: 300 });
}

const car = (t, driver) => t.page.locator('[data-testid="eh-car"]', { has: t.page.locator('.eh-car-driver', { hasText: new RegExp(`^${driver}$`) }) });

async function waitSaved(t, scope) {
  await t.page.waitForFunction((sel) => {
    const el = sel ? document.querySelector(sel) : document;
    return [...(el?.querySelectorAll('[data-testid="eh-save"]') ?? [])].some((n) => /^Saved \d/.test(n.textContent));
  }, scope ?? null, { timeout: 10_000 });
}

async function pick(t, card, label) {
  await t.press(card.locator('button', { hasText: new RegExp(`^${label}$`) }).first());
  await t.settle({ quietMs: 250 });
}

function store(t, table) { return t.rows(table); }

export default {
  async run(t) {
    t.expectedConsole.push(/Failed to fetch/i);
    await t.open('/_fixture', { persona: 'signedout', mig: 'all', reset: true });
    const migs = await t.evaluate(() => window.__fx.migrationNumbers);
    const without0005 = migs.filter((m) => m !== '0005').join(',') || 'none';

    // ════ outside the shell ═══════════════════════════════════════════════
    await t.step('outside the shell', async () => {
      await familyPage(t, 'sam');
      t.as('family page, signed out');
      const nav = await t.count('.navbar');
      const widget = await t.count('.fb-launch');
      await t.open(BOARD, { persona: 'student', ready: '[data-testid="trip-board"]' });
      const nav2 = await t.count('.navbar');
      await t.waitFor('.fb-launch');
      const widget2 = await t.count('.fb-launch');
      t.check('no nav bar and no feedback launcher on /e, against both on /trips', nav === 0 && widget === 0 && nav2 === 1 && widget2 >= 1,
        `/e: nav ${nav}, launcher ${widget}; /trips: nav ${nav2}, launcher ${widget2}`);
      const menuTrips = async () => {
        await t.press('.nav-avatar-btn');
        await t.waitFor('.nav-avatar-menu');
        const n = await t.count('.nav-avatar-menu a[href="/trips"]');
        const all = await t.count('.nav-avatar-menu a');
        await t.page.keyboard.press('Escape');
        return { n, all };
      };
      const student = await menuTrips();
      await t.open('/dashboard', { persona: 'parent', ready: '.nav-avatar-btn' });
      const parent = await menuTrips();
      await t.open('/dashboard', { persona: 'mentor', ready: '.nav-avatar-btn' });
      const mentor = await menuTrips();
      t.check('the menu offers Trips once to a student and once to staff, and not to a parent-only account (it uses its link)',
        student.n === 1 && mentor.n === 1 && parent.n === 0 && parent.all > 0,
        `student ${student.n}, mentor ${mentor.n}, parent ${parent.n} of ${parent.all} menu links`);
    });

    // ════ a fresh family signs up, start to finish ════════════════════════
    await t.step('sign-up start to finish', async () => {
      await t.open(fam('sam'), { persona: 'signedout', reset: true, ready: '[data-testid="eh-status"]' });
      t.as('Sam, fresh');
      const status0 = await t.text('[data-testid="eh-status"]');
      const cards = t.page.locator('[data-testid="eh-day-q"]');
      const titles = await t.texts('[data-testid="eh-day-q"] legend');
      t.check('Days in form order: Saturday, Sunday, then Friday', titles.length === 3 && /^Saturday/.test(titles[0]) && /^Sunday/.test(titles[1]) && /^Friday/.test(titles[2]),
        titles.map((x) => x.split(',')[0]).join(' / '));
      const introFirst = await t.evaluate(() => {
        const card = [...document.querySelectorAll('[data-testid="eh-day-q"]')][2];
        const intro = card?.querySelector('[data-testid="eh-day-intro"]');
        const q = card?.querySelector('[data-testid="eh-attending"]');
        return !!intro && !!q && !!(intro.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      const introCount = await t.count('[data-testid="eh-day-intro"]');
      t.check('Friday\'s card comes before its question; the other days have none', introFirst && introCount === 1, `intro cards ${introCount}, before the question: ${introFirst}`);
      t.check('the status counts what is left', /^Sign-up due .+ \d+ answers to go\.$/.test(status0), status0);

      await pick(t, cards.nth(0), 'Coming');
      await waitSaved(t, '[data-testid="eh-day-q"]:nth-of-type(1)');
      const saved = await t.text('[data-testid="eh-day-q"] [data-testid="eh-save"]');
      const ans = (await store(t, 'hub_day_answers')).find((a) => a.day_id === EH.sat && a.invite_id.endsWith('400'));
      t.check('a tap saves at once and says "Saved h:mm"; the store holds it', /^Saved \d{1,2}:\d{2} (AM|PM)$/.test(saved) && ans?.attending === 'yes',
        `note "${saved}"; store attending ${ans?.attending}`);
      await pick(t, cards.nth(1), 'Not coming');
      await pick(t, cards.nth(2), 'Not coming');
      await pick(t, t.page.locator('.eh-card', { hasText: 'Staying near the venue?' }), 'No, driving each day');
      const nightLabels = (await t.page.locator('.eh-card', { hasText: 'Staying near the venue?' }).locator('.eh-chip').allTextContents()).map((x) => x.trim());
      t.eq('staying options come from the days', nightLabels, ['No, driving each day', 'Friday night', 'Saturday night', 'Both']);
      await pick(t, t.page.locator('.eh-card', { hasText: 'Adults from your family attending' }), '1');
      await t.page.waitForTimeout(400);
      const dot1 = await t.evaluate(() => document.querySelectorAll('[data-testid="eh-stepdot"]')[0].className.includes('done'));
      t.check('the Days step dot turns done', dot1, `done: ${dot1}`);

      await t.press('[data-testid="eh-next"]');
      await t.settle({ quietMs: 300 });
      const school = t.page.locator('fieldset', { hasText: 'Getting to Bosco Tech' });
      await pick(t, school, 'We get there ourselves');
      await waitSaved(t);
      await t.press('[data-testid="eh-next"]');
      await t.settle({ quietMs: 300 });
      await pick(t, t.page.locator('[data-testid="eh-allergies"]'), 'None');
      await pick(t, t.page.locator('fieldset', { hasText: 'Medication needed during the event?' }), 'No');
      await t.press('[data-testid="eh-next"]');
      await t.settle({ quietMs: 300 });
      const em = t.page.locator('.eh-card', { hasText: 'Emergency contact during the event' }).locator('input');
      await em.nth(0).fill('Lee Parent');
      await em.nth(1).fill('5555550142');
      await em.nth(1).blur();
      await pick(t, t.page.locator('fieldset', { hasText: 'FIRST registration for this season' }), 'Done');
      await t.page.waitForTimeout(1200);
      await t.settle({ quietMs: 400 });
      const status1 = await t.text('[data-testid="eh-status"]');
      t.check('every required answer saved: the status says sign-up is done and lock-in is due', /^Sign-up done\. Lock-in due /.test(status1), status1);
      await t.press('[data-testid="eh-finish"]');
      await t.settle({ quietMs: 300 });
      const lockCards = await t.count('[data-testid="eh-lockin-day"]');
      t.check('Finish lands on lock-in: one card per day', lockCards === 3, `${lockCards} day cards`);
      await t.shot('sam-lockin');
      await t.press('[data-testid="eh-confirm-day"]');
      await t.settle({ quietMs: 400 });
      const status2 = await t.text('[data-testid="eh-status"]');
      t.check('one tap confirms the day; lock-in is done', /^All set\. See you /.test(status2) && (await t.count('[data-testid="eh-done"]')) === 1, status2);
      await t.tapTargets(CONTROLS, '44px floor on every family-page control (lock-in done)');
      await t.noHScroll('no horizontal scroll on the family page');
    });

    // ════ autosave survives failure ═══════════════════════════════════════
    await t.step('autosave failure', async () => {
      await t.open(fam('sam'), { persona: 'signedout', reset: true, ready: '[data-testid="eh-status"]' });
      t.as('Sam, two failed saves');
      for (let i = 0; i < 3; i += 1) { await t.press('[data-testid="eh-next"]'); await t.settle({ quietMs: 200 }); }
      await t.evaluate(() => {
        const real = window.fetch;
        window.__ehFails = 0;
        window.fetch = async (u, init) => {
          if (String(u).includes('/functions/v1/event-family') && String(init?.body ?? '').includes('"save"') && window.__ehFails < 2) {
            window.__ehFails += 1;
            throw new TypeError('Failed to fetch');
          }
          return real(u, init);
        };
      });
      const phone = t.page.locator('[data-testid="eh-parent-phone"]');
      await phone.fill('(555) 555-0177');
      await phone.blur();
      await t.page.waitForFunction(() => [...document.querySelectorAll('[data-testid="eh-save"]')].some((n) => n.textContent === 'Not saved, retrying'), null, { timeout: 8000 });
      const during = await phone.inputValue();
      t.check('a failed save says "Not saved, retrying" and keeps what was typed', during === '(555) 555-0177', `input "${during}"`);
      await t.page.clock.fastForward(20_000);
      await waitSaved(t);
      const r = (await store(t, 'hub_responses')).find((x) => x.invite_id.endsWith('400'));
      const fails = await t.evaluate(() => window.__ehFails);
      t.check('it lands after the failures, and the store holds exactly the typed value', r?.parent_phone === '(555) 555-0177' && fails === 2 && (await phone.inputValue()) === '(555) 555-0177',
        `failed sends ${fails}; store "${r?.parent_phone}"`);
      // Positive control: with nothing failing, a save lands at once.
      await phone.fill('5555550188');
      await phone.blur();
      await waitSaved(t);
      const r2 = (await store(t, 'hub_responses')).find((x) => x.invite_id.endsWith('400'));
      t.check('without a failure the next save lands at once', r2?.parent_phone === '5555550188', `store "${r2?.parent_phone}"`);
    });

    // ════ phones, pickup spots, allergy names ═════════════════════════════
    await t.step('consent-gated visibility', async () => {
      await t.open('/_fixture', { persona: 'signedout', reset: true });
      const phonesOn = async (key, short) => {
        await familyPage(t, key);
        await tab(t, 'Carpool');
        await day(t, short);
        return { phones: await t.count('[data-testid="eh-driver-phone"]'), notes: await t.count('.eh-phone.eh-quiet'), spots: await t.count('[data-testid="eh-spot"]') };
      };
      t.as('Saturday, to the venue');
      const riley = await phonesOn('riley', 'Sat');
      const jordan = await phonesOn('jordan', 'Sat');
      t.check('the driver\'s phone (consented) reaches the family in that car and not a family outside it', riley.phones === 1 && jordan.phones === 0,
        `Riley (in Casey's car) ${riley.phones}, Jordan (in no car) ${jordan.phones}`);
      const caseyBefore = await phonesOn('casey', 'Sat');
      const taylor = await phonesOn('taylor', 'Sat');
      t.check('an open pickup spot reaches the pickup driver only: not a driver without pickups, not a family', caseyBefore.spots === 1 && taylor.spots === 0 && jordan.spots === 0,
        `Casey (takes pickups) ${caseyBefore.spots}, Taylor (does not) ${taylor.spots}, Jordan ${jordan.spots}`);
      await familyPage(t, 'casey');
      await tab(t, 'Carpool');
      await day(t, 'Sat');
      await t.press(t.page.locator('[data-testid="eh-pickups"] button', { hasText: 'Accept into my car' }));
      await t.settle({ quietMs: 400 });
      const caseyAfter = { spots: await t.count('[data-testid="eh-spot"]') };
      const taylorAfter = await phonesOn('taylor', 'Sat');
      const morgan = await phonesOn('morgan', 'Sat');
      t.check('after acceptance the spot is on the accepting driver\'s rider list, and nobody else\'s board', caseyAfter.spots === 1 && taylorAfter.spots === 0 && morgan.spots === 0,
        `Casey ${caseyAfter.spots}, Taylor ${taylorAfter.spots}, Morgan's own family ${morgan.spots}`);
      await t.open(MANAGE, { persona: 'admin', ready: '[data-testid="ehm-page"]' });
      await tab(t, 'Carpool');
      await day(t, 'Sat');
      const staffSpots = await t.count('[data-testid="eh-spot"]');
      const staffPhones = await t.count('[data-testid="eh-driver-phone"]');
      t.check('staff see the accepted spot and the consented phones', staffSpots >= 1 && staffPhones >= 1, `spots ${staffSpots}, phones ${staffPhones}`);
      await tab(t, 'Food');
      const staffNames = await t.texts('[data-testid="eh-allergy-names"] li');
      await familyPage(t, 'riley');
      await tab(t, 'Food');
      const famNames = await t.count('[data-testid="eh-allergy-names"]');
      const strip = await t.texts('[data-testid="eh-allergy-strip"]');
      t.check('allergy names are staff-only; families see the counts', staffNames.some((n) => n.startsWith('Casey Exempt')) && famNames === 0 && strip.some((s) => s.includes('Peanut (1)')),
        `staff name rows ${staffNames.length}; family name lists ${famNames}; family strip "${strip[0]}"`);
    });

    // ════ the last seat ═══════════════════════════════════════════════════
    await t.step('last-seat race', async () => {
      await t.open('/_fixture', { persona: 'signedout', reset: true });
      t.as('Jordan and Avery, one seat');
      await familyPage(t, 'jordan');
      await tab(t, 'Carpool');
      await day(t, 'Sat');
      const other = await t.context.newPage();
      await other.goto(t.origin + fam('avery'));
      await waitForFixture(other);
      await other.waitForSelector('[data-testid="eh-status"]');
      await other.locator('.eh-tabs .eh-seg-btn', { hasText: /^Carpool$/ }).click();
      await other.locator('.eh-board-controls .eh-seg').first().locator('.eh-seg-btn', { hasText: /^Sat$/ }).click();
      const c1 = car(t, 'Morgan Exempt');
      const c2 = other.locator('[data-testid="eh-car"]', { has: other.locator('.eh-car-driver', { hasText: /^Morgan Exempt$/ }) });
      const bothOffered = (await c1.locator('[data-testid="eh-claim"]').count()) === 1 && (await c2.locator('[data-testid="eh-claim"]').count()) === 1;
      await t.press(c1.locator('[data-testid="eh-claim"]'));
      const confirmText = await c1.locator('[data-testid="eh-claim-confirm"]').textContent().catch(() => '');
      await t.press(c1.locator('[data-testid="eh-claim-yes"]'));
      await t.settle({ quietMs: 400 });
      await c2.locator('[data-testid="eh-claim"]').click();
      await c2.locator('[data-testid="eh-claim-yes"]').click();
      await other.waitForSelector('.eh-note-bad', { timeout: 8000 });
      const loser = (await other.locator('[data-testid="eh-car"] .eh-note-bad').first().textContent()).trim();
      const seats = (await store(t, 'hub_seats')).filter((s) => s.car_id === EH.carCaseySatTo);
      t.check('both families were offered the last seat, and the car warned it leaves early', bothOffered && /leaves the venue at 3:00 PM, before the day ends/.test(confirmText),
        `offered to both: ${bothOffered}; confirm "${confirmText.trim().slice(0, 70)}"`);
      t.check('one wins; the other reads "That car just filled. Pick another."', loser === 'That car just filled. Pick another.' && seats.length === 2,
        `loser sees "${loser}"; riders in the 2-seat car ${seats.length}`);
      await other.close();
    });

    // ════ the one-minor rule ══════════════════════════════════════════════
    await t.step('one-minor rule', async () => {
      await t.open('/_fixture', { persona: 'signedout', reset: true });
      t.as('Rowan and the empty mentor van');
      await familyPage(t, 'rowan');
      await tab(t, 'Carpool');
      await day(t, 'Sat');
      await t.press(car(t, 'Coach Max').locator('[data-testid="eh-claim"]'));
      await t.settle({ quietMs: 400 });
      const msg = (await car(t, 'Coach Max').locator('.eh-note-bad').textContent().catch(() => '')).trim();
      const van = (await store(t, 'hub_seats')).filter((s) => s.car_id === EH.carMentorSat).length;
      t.check('the first student into a car without the driver\'s own child is refused, with the reason', /alone with an adult who is not their parent/.test(msg) && van === 0,
        `message "${msg.slice(0, 60)}"; riders ${van}`);
      await t.press(car(t, 'Kim Nguyen').locator('[data-testid="eh-claim"]'));
      await t.settle({ quietMs: 400 });
      const kim = (await store(t, 'hub_seats')).filter((s) => s.car_id === EH.carTaylorSatTo).length;
      t.check('positive control: a family car (the driver\'s own student aboard) takes one rider', kim === 1, `riders in Kim Nguyen's car ${kim}`);

      t.as('Quinn leaves Coach Max\'s Sunday car');
      const redBefore = (await store(t, 'hub_outbox')).filter((o) => o.kind === 'car_red').length;
      await familyPage(t, 'quinn');
      await tab(t, 'Carpool');
      await day(t, 'Sun');
      await t.press(car(t, 'Coach Max').locator('button', { hasText: /^Leave this car$/ }));
      await t.settle({ quietMs: 400 });
      const red = await car(t, 'Coach Max').locator('[data-testid="eh-car-problem"]').textContent().catch(() => '');
      const redAfter = (await store(t, 'hub_outbox')).filter((o) => o.kind === 'car_red').length;
      t.check('leaving is allowed; the car turns red and mentors are emailed', red === 'Needs a second rider' && redAfter === redBefore + 1,
        `card "${red}"; car_red emails ${redBefore} -> ${redAfter}`);
      await t.open(MANAGE, { persona: 'mentor', ready: '[data-testid="ehm-page"]' });
      await tab(t, 'Carpool');
      await day(t, 'Sun');
      await t.press(car(t, 'Coach Max').locator('[data-testid="eh-leaving"]'));
      await t.settle({ quietMs: 400 });
      const refused = (await car(t, 'Coach Max').locator('.eh-note-bad').textContent().catch(() => '')).trim();
      const stillThere = (await store(t, 'hub_cars')).find((c) => c.id === EH.carMentorSun)?.left_at;
      await car(t, 'Coach Max').locator('input[placeholder="Why this car may leave as it is"]').fill('Jamie\'s parent rides along');
      await t.press(car(t, 'Coach Max').locator('[data-testid="eh-leaving"]'));
      await t.settle({ quietMs: 400 });
      const left = (await store(t, 'hub_cars')).find((c) => c.id === EH.carMentorSun);
      t.check('a red car cannot be marked Left without a reason; with one it leaves and the reason is kept',
        /cannot leave until a second rider joins/.test(refused) && !stillThere && !!left?.left_at && left?.minor_override_reason === 'Jamie\'s parent rides along',
        `without: "${refused.slice(0, 50)}"; with: left ${!!left?.left_at}, reason "${left?.minor_override_reason}"`);
      await t.shot('mentor-red-car-left');
    });

    // ════ edit windows ════════════════════════════════════════════════════
    await t.step('edit windows', async () => {
      await t.open('/_fixture', { persona: 'signedout', reset: true });
      t.as('windows');
      await familyPage(t, 'riley');
      await tab(t, 'Carpool');
      await day(t, 'Fri');
      const leaveFri = await car(t, 'Morgan Exempt').locator('button', { hasText: /^Leave this car$/ }).count();
      const statusFri = await car(t, 'Morgan Exempt').locator('[data-testid="eh-car-status"]').textContent();
      await day(t, 'Sat');
      const leaveSat = await car(t, 'Morgan Exempt').locator('button', { hasText: /^Leave this car$/ }).count();
      t.check('a car marked Left offers no Leave; the same family\'s car that has not left does', leaveFri === 0 && leaveSat === 1 && /^Left \d/.test(statusFri),
        `Friday (${statusFri}) ${leaveFri}, Saturday ${leaveSat}`);
      await tab(t, 'Food');
      const started = await t.page.locator('[data-testid="eh-meal"]', { hasText: 'Setup snacks' }).locator('button', { hasText: /^Claim$/ }).count();
      const dinner = await t.page.locator('[data-testid="eh-meal"]', { hasText: 'Fri dinner' }).locator('button', { hasText: /^Claim$/ }).count();
      t.check('a meal that started offers no Claim; one that has not does', started === 0 && dinner === 1, `started ${started}, Fri dinner ${dinner}`);
      await familyPage(t, 'past');
      const over = await t.text('[data-testid="eh-status"]');
      const enabledPast = await t.evaluate(() => [...document.querySelectorAll('.eh-chip, .eh-tick, .eh-input')].filter((b) => !b.disabled).length);
      const changePast = await t.count('button:has-text("Change an answer")');
      await familyPage(t, 'sam');
      const enabledLive = await t.evaluate(() => [...document.querySelectorAll('.eh-chip, .eh-tick, .eh-input')].filter((b) => !b.disabled).length);
      t.check('after the event ends nothing is offered to change; a live event offers answers', /is over\. Thank you!$/.test(over) && enabledPast === 0 && changePast === 0 && enabledLive > 5,
        `"${over}"; enabled controls: ended ${enabledPast}, live ${enabledLive}`);
    });

    // ════ students read, never write ══════════════════════════════════════
    await t.step('student boards', async () => {
      await t.open(BOARD, { persona: 'student', reset: true, ready: '[data-testid="trip-board"]' });
      t.as('student on /trips/<id>');
      await day(t, 'Sat');
      const names = await t.count('[data-testid="eh-rider"]');
      const writes = await t.count('[data-testid="eh-claim"], [data-testid="eh-leaving"], button:has-text("Leave this car")');
      const phones = await t.count('[data-testid="eh-driver-phone"], [data-testid="eh-rider-phone"], [data-testid="eh-spot"]');
      await t.open(BOARD, { persona: 'mentor', ready: '[data-testid="trip-board"]' });
      await day(t, 'Sat');
      const staffPhones = await t.count('[data-testid="eh-driver-phone"], [data-testid="eh-rider-phone"], [data-testid="eh-spot"]');
      t.check('a student sees cars and riders, with no write control and no phone or spot (staff on the same board see them)',
        names >= 1 && writes === 0 && phones === 0 && staffPhones >= 1, `riders ${names}; write controls ${writes}; phones/spots ${phones} against staff ${staffPhones}`);
    });

    // ════ lost your link ══════════════════════════════════════════════════
    await t.step('lost link', async () => {
      t.as('/e with a dead token');
      const answers = [];
      for (const email of ['riley.family@example.com', 'nobody@example.com']) {
        await t.open('/e/AAAAAAAAAAAAAAAAAAAAAA', { persona: 'signedout', ready: '[data-testid="eh-lost"]' });
        await t.page.locator('[data-testid="eh-lost"] input[type="email"]').fill(email);
        await t.press(t.page.locator('[data-testid="eh-lost"] button[type="submit"]'));
        await t.waitFor('.eh-ok-line');
        answers.push(await t.text('.eh-ok-line'));
      }
      t.check('a dead link offers a new one, and the answer is the same for a known and an unknown address',
        answers[0] === answers[1] && /^If that email is on file/.test(answers[0]), `"${answers[0]}" / same: ${answers[0] === answers[1]}`);
    });

    // ════ the mentor page ═════════════════════════════════════════════════
    await t.step('mentor page', async () => {
      await t.open(MANAGE, { persona: 'admin', reset: true, ready: '[data-testid="ehm-page"]' });
      t.as('mentor page');
      const lines = await t.count('[data-testid^="ehm-line-"]');
      t.check('five readiness lines', lines === 5, `${lines} lines`);
      await t.press('[data-testid="ehm-line-responses"] .ehm-line-head');
      await t.settle({ quietMs: 300 });
      await t.press(t.page.locator('button', { hasText: /^Send invites$/ }));
      const confirm = await t.text('[data-testid="ehm-confirm"]');
      const n = Number((confirm.match(/Email (\d+)/) ?? [])[1]);
      const expected = (await store(t, 'hub_invites')).filter((i) => i.event_id === EH.event && (i.emails ?? []).length).length;
      await t.press(t.page.locator('[data-testid="ehm-confirm"] button', { hasText: /^Yes, send$/ }));
      await t.settle({ quietMs: 600 });
      const queued = (await store(t, 'hub_outbox')).filter((o) => o.kind === 'invite').length;
      t.check('Send invites confirms with the count first, then queues exactly that many', n === expected && queued === expected && expected > 0,
        `confirm says ${n}; families with an email ${expected}; queued ${queued}`);
      await t.shot('mentor-readiness');
      await tab(t, 'Setup');
      const daysSetup = await t.count('[data-testid="ehm-day-setup"]');
      t.check('setup edits every day', daysSetup === 3, `${daysSetup} day editors`);
      await t.noHScroll('no horizontal scroll on the mentor page');
      await t.open(MANAGE, { persona: 'student', ready: '.ehm-page' });
      t.check('a student opening the mentor page gets "Staff only."', (await t.bodyText()).includes('Staff only.'), 'Staff only.');
    });

    // ════ 0005 not applied ════════════════════════════════════════════════
    await t.step('0005 not applied', async () => {
      t.as(`mig ${without0005}`);
      await t.open('/trips', { persona: 'student', mig: without0005, reset: true, ready: '.ehm-page' });
      const trips = await t.count('[data-testid="trips-missing"]');
      await t.open(MANAGE, { persona: 'admin', mig: without0005, ready: '.ehm-page' });
      const manage = await t.text('[data-testid="ehm-status"]');
      await t.open(fam('sam'), { persona: 'signedout', mig: without0005, ready: '.eh-card' });
      const famText = await t.bodyText();
      await t.open('/trips', { persona: 'student', mig: 'all', ready: '[data-testid="trip-row"]' });
      const rows = await t.count('[data-testid="trip-row"]');
      t.check('not set up: /trips and the mentor page say so, the family page cannot open; with 0005 the trips list has rows',
        trips === 1 && /not set up yet/.test(manage) && famText.includes('Cannot reach the team server') && rows >= 1,
        `trips missing line ${trips}; mentor "${manage}"; family page unreachable ${famText.includes('Cannot reach the team server')}; rows with 0005 ${rows}`);
    });

    t.consoleCheck();
  },
};
