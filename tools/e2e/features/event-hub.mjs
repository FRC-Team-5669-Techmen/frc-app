/**
 * The event family hub, migrations 0005 to 0008 (ledger 0003): the family page
 * /e/<token>, the read-only boards /trips/<id>, the open link /join and the
 * mentor page /trips/<id>/manage (src/EventFamilyPage.jsx,
 * src/EventFamilyParts.jsx, src/EventHubControls.jsx, src/EventHubBoards.jsx,
 * src/EventJoinPage.jsx, src/TripsPage.jsx, src/TripsAdmin.jsx).
 *
 * Fixture mode answers from src/dev/fixture/features/eventhub.js and its
 * siblings, test-only ports of the rules (their headers say so). So this spec
 * proves the PAGES: they render what the database would send, send what the
 * rules need, and show the rules' answers. The rules themselves are proven on
 * PostgreSQL by the 0005, 0007 and 0008 _rls_test.sql files, their mutants and
 * the seat race.
 *
 * Claims, each asserted both ways with both counts:
 *  - the family page is outside the app shell: 0 nav bars and 0 feedback
 *    launchers, against 1 and 1 on /trips;
 *  - sign-up, start to finish, as a fresh family: four parts and a Finish
 *    tile, "N of 4 parts done" moving as parts finish; the days in form order
 *    (Sat, Sun, Fri) with Friday's card BEFORE its question; an (i) card
 *    opens on a tap and closes on "Got it"; every answer autosaves with
 *    "Saved h:mm"; an adult count above 4 through "5 or more"; the ride
 *    question says it was assumed until someone picks, then shrinks to the
 *    chosen card; a seat claimed right under the question; a phone shown
 *    formatted and stored as typed; the summary flags a run with no seat and
 *    stops once it has one; one tap per day confirms; "All set";
 *  - autosave survives failure: two failed saves keep the typed value, say
 *    "Not saved, retrying", and land it; the store holds exactly what was typed;
 *  - a driver's phone (consented) reaches the family in that car and not a
 *    family outside it; an open pickup spot reaches the pickup driver only;
 *    after acceptance only the accepting driver and staff see it;
 *  - allergy names: staff see them, families see only the counts;
 *  - the last-seat race, on the seat picker under the question: two families
 *    on one open seat, one wins and the other reads "That car just filled.";
 *  - the one-child rule: shown at the top of Rides; an empty car without the
 *    driver's own student aboard offers no Claim and says a mentor seats two
 *    (a family car offers one and takes one rider); a claim forced past the
 *    page is still refused; a mentor seats two together (0008); a rider
 *    leaving a two-rider car turns it red, mentors are emailed, Left is
 *    refused without a reason and accepted with one;
 *  - edit windows: a car that left offers no Leave (against one that has not),
 *    a meal that started offers no Claim (against one that has not), an event
 *    that ended offers no enabled answer and no tracker (against one that has
 *    not);
 *  - students read boards and never write;
 *  - the open link (0007): students with this season's application listed and
 *    staff not; the guardian tick required; straight in for the first person,
 *    the link emailed to the family that already started; a second parent
 *    added with a name from Contacts; a dead link points to /join;
 *  - families (0008): a parent drives other students without their own; one
 *    guardian removes another, whose link stops; a family takes itself off
 *    the trip and the student can be signed up again; a mentor removes a
 *    family; the mentor page shows the rule as always on; without 0008 none of
 *    it is offered;
 *  - the mentor page: five readiness lines; Send invites confirms with a
 *    count and queues exactly that many;
 *  - 44px floor on every control at 375, no horizontal scroll, 0 console errors.
 */
import { EH } from '../../../src/dev/fixture/features/eventhub.js';
import { waitForFixture } from '../lib.mjs';

const TOK = EH.tokens;
const fam = (k) => `/e/${TOK[k]}`;
const BOARD = `/trips/${EH.event}`;
const MANAGE = `/trips/${EH.event}/manage`;
const CONTROLS = '.eh-chip, .eh-btn, .eh-seg-btn, .eh-tick, .eh-input, .eh-option, .eh-tile, .eh-tip-btn, .eh-fold-head, .eh-todo, .eh-mini';
const DAKOTA = '00000000-0000-0000-0000-0000000000cc';

async function familyPage(t, key, opts = {}) {
  await t.open(fam(key), { ready: '[data-testid="eh-status"], [data-testid="eh-lost"], .eh-card', ...opts });
  await t.settle({ quietMs: 300 });
}

/** A tile in the progress tracker: Who, Rides, Food, Contacts, Finish. */
async function part(t, short) {
  await t.press(t.page.locator('[data-testid="eh-part-tile"]', { has: t.page.locator('.eh-tile-label', { hasText: new RegExp(`^${short}$`) }) }));
  await t.settle({ quietMs: 300 });
}

async function openFold(t, testid) {
  const head = t.page.locator(`[data-testid="${testid}"] > .eh-fold-head`);
  if ((await head.getAttribute('aria-expanded')) !== 'true') await t.press(head);
  await t.settle({ quietMs: 250 });
}

/** The mentor page's tabs. */
async function tab(t, label) {
  await t.press(t.page.locator('.eh-tabs .eh-seg-btn', { hasText: new RegExp(`^${label}$`) }));
  await t.settle({ quietMs: 300 });
}

async function day(t, short, run = 'to') {
  await t.press(t.page.locator('.eh-board-controls .eh-seg').first().locator('.eh-seg-btn', { hasText: new RegExp(`^${short}$`) }));
  await t.press(t.page.locator('.eh-board-controls .eh-seg').nth(1).locator('.eh-seg-btn', { hasText: run === 'to' ? /^To venue$/ : /^Home$/ }));
  await t.settle({ quietMs: 300 });
}

/** The family's whole-team carpool board, inside Rides. */
async function familyBoard(t, key, short, run = 'to') {
  await familyPage(t, key);
  await part(t, 'Rides');
  await openFold(t, 'eh-board-fold');
  await day(t, short, run);
}

const driverIs = (t, driver) => t.page.locator('.eh-car-driver', { hasText: new RegExp(`^${driver}$`) });
/** A car on a board (the family board fold, /trips, the mentor page). */
const car = (t, driver) => t.page.locator('.eh-board [data-testid="eh-car"]', { has: driverIs(t, driver) });
/** One day's card in Rides, by weekday. */
const rideDay = (t, weekday) => t.page.locator('[data-testid="eh-getting-day"]', { has: t.page.locator('.eh-day-badge', { hasText: new RegExp(`^${weekday}`) }) });
/** A car in the seat picker right under the ride question. */
const seatCar = (t, weekday, run, driver) => rideDay(t, weekday).locator(`.eh-run-${run} [data-testid="eh-seat-picker"] [data-testid="eh-car"]`, { has: driverIs(t, driver) });
const option = (scope, title) => scope.locator('.eh-option', { has: scope.page().locator('.eh-option-title', { hasText: new RegExp(`^${title}$`) }) });

async function waitSaved(t, scope) {
  await t.page.waitForFunction((sel) => {
    const el = sel ? document.querySelector(sel) : document;
    return [...(el?.querySelectorAll('[data-testid="eh-save"]') ?? [])].some((n) => /^Saved \d/.test(n.textContent));
  }, scope ?? null, { timeout: 10_000 });
}

async function pick(t, scope, label) {
  await t.press(scope.locator('button', { hasText: new RegExp(`^${label}$`) }).first());
  await t.settle({ quietMs: 250 });
}

async function claimIn(t, carLoc) {
  await t.press(carLoc.locator('[data-testid="eh-claim"]'));
  if (await carLoc.locator('[data-testid="eh-claim-yes"]').count()) await t.press(carLoc.locator('[data-testid="eh-claim-yes"]'));
  await t.settle({ quietMs: 400 });
}

function store(t, table) { return t.rows(table); }

/** A call to the event-family function as the page makes it, bypassing the page (.env.fixture's URL). */
function rawFamilyCall(t, token, action, args) {
  return t.evaluate(async ({ token, action, args }) => {
    const r = await fetch('https://fixture.supabase.invalid/functions/v1/event-family', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action, args }),
    });
    let body = null;
    try { body = await r.json(); } catch { /* empty */ }
    return { status: r.status, body };
  }, { token, action, args });
}

export default {
  async run(t) {
    t.expectedConsole.push(/Failed to fetch/i);
    await t.open('/_fixture', { persona: 'signedout', mig: 'all', reset: true });
    const migs = await t.evaluate(() => window.__fx.migrationNumbers);
    const without0005 = migs.filter((m) => m !== '0005').join(',') || 'none';
    const without0008 = migs.filter((m) => m !== '0008').join(',') || 'none';

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
      t.as('Sam, fresh: Who is coming');
      const status0 = await t.text('[data-testid="eh-status"]');
      const tiles = await t.texts('[data-testid="eh-part-tile"] .eh-tile-label');
      const count0 = await t.text('[data-testid="eh-tracker-count"]');
      const step0 = await t.text('[data-testid="eh-step-count"]');
      t.eq('four parts and a Finish tile, in order', tiles, ['Who', 'Rides', 'Food', 'Contacts', 'Finish']);
      t.check('a fresh family starts on part 1 with nothing done, and the status counts what is left',
        count0 === '0 of 4 parts done' && step0 === 'Part 1 of 4' && /^Sign-up due .+ \d+ answers to go\.$/.test(status0), `${count0}; ${step0}; ${status0}`);
      const cards = t.page.locator('[data-testid="eh-day-q"]');
      const titles = await t.texts('[data-testid="eh-day-q"] .eh-day-badge');
      t.check('days in form order: Saturday, Sunday, then Friday', titles.length === 3 && /^Saturday/.test(titles[0]) && /^Sunday/.test(titles[1]) && /^Friday/.test(titles[2]),
        titles.map((x) => x.split(',')[0]).join(' / '));
      const introFirst = await t.evaluate(() => {
        const card = [...document.querySelectorAll('[data-testid="eh-day-q"]')][2];
        const intro = card?.querySelector('[data-testid="eh-day-intro"]');
        const q = card?.querySelector('[data-testid="eh-attending"]');
        return !!intro && !!q && !!(intro.compareDocumentPosition(q) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      const introCount = await t.count('[data-testid="eh-day-intro"]');
      t.check('Friday\'s card comes before its question; the other days have none', introFirst && introCount === 1, `intro cards ${introCount}, before the question: ${introFirst}`);

      // An info card: closed, opened by a tap, closed by "Got it".
      const tip = cards.nth(0).locator('[data-testid="eh-tip-btn"]').first();
      const before = await t.count('[data-testid="eh-tip-card"]');
      await t.press(tip);
      const during = await t.text('[data-testid="eh-tip-card"]');
      await t.press(t.page.locator('[data-testid="eh-tip-card"] .eh-tip-close'));
      const after = await t.count('[data-testid="eh-tip-card"]');
      const tipsTotal = await t.count('[data-testid="eh-tip-btn"]');
      t.check('every question has an (i): one opens on a tap with its explanation and closes on "Got it"',
        before === 0 && /Not sure yet/.test(during ?? '') && after === 0 && tipsTotal >= 4, `cards before ${before}, open "${(during ?? '').slice(0, 40)}...", after ${after}; (i) buttons on the part ${tipsTotal}`);

      await pick(t, cards.nth(0), 'Coming');
      await waitSaved(t, '[data-testid="eh-day-q"]');
      const saved = await t.text('[data-testid="eh-day-q"] [data-testid="eh-save"]');
      const ans = (await store(t, 'hub_day_answers')).find((a) => a.day_id === EH.sat && a.invite_id.endsWith('400'));
      t.check('a tap saves at once and says "Saved h:mm"; the store holds it', /^Saved \d{1,2}:\d{2} (AM|PM)$/.test(saved) && ans?.attending === 'yes',
        `note "${saved}"; store attending ${ans?.attending}`);
      await pick(t, cards.nth(1), 'Not coming');
      await pick(t, cards.nth(2), 'Not coming');
      const stay = t.page.locator('.eh-card', { hasText: 'staying near the venue overnight' });
      const nightLabels = (await stay.locator('.eh-chip').allTextContents()).map((x) => x.trim());
      t.eq('staying options come from the days', nightLabels, ['No, driving each day', 'Friday night', 'Saturday night', 'Both']);
      await pick(t, stay, 'No, driving each day');

      // Adults: 0 to 4 as chips, then "5 or more" for any number.
      const adults = t.page.locator('[data-testid="eh-adults"]');
      const inputBefore = await adults.locator('[data-testid="eh-count-input"]').count();
      await t.press(adults.locator('[data-testid="eh-count-more"]'));
      const box = adults.locator('[data-testid="eh-count-input"]');
      await box.fill('12');
      await t.page.waitForTimeout(300);
      await t.settle({ quietMs: 300 });
      const a12 = (await store(t, 'hub_day_answers')).find((a) => a.day_id === EH.sat && a.invite_id.endsWith('400'))?.adults;
      await pick(t, adults, '1');
      const a1 = (await store(t, 'hub_day_answers')).find((a) => a.day_id === EH.sat && a.invite_id.endsWith('400'))?.adults;
      const inputAfter = await adults.locator('[data-testid="eh-count-input"]').count();
      t.check('adults: "5 or more" opens a number box that saves 12; picking 1 saves 1 and closes it',
        inputBefore === 0 && a12 === 12 && a1 === 1 && inputAfter === 0, `box ${inputBefore} -> open, stored ${a12}, then ${a1}, box ${inputAfter}`);
      await t.page.waitForTimeout(400);
      await t.settle({ quietMs: 300 });
      const whoDone = await t.evaluate(() => document.querySelectorAll('[data-testid="eh-part-tile"]')[0].className.includes('eh-tile-done'));
      const ridesDone = await t.evaluate(() => document.querySelectorAll('[data-testid="eh-part-tile"]')[1].className.includes('eh-tile-done'));
      const count1 = await t.text('[data-testid="eh-tracker-count"]');
      t.check('the Who tile turns done and the count moves; Rides is not done yet', whoDone && !ridesDone && count1 === '1 of 4 parts done', `Who ${whoDone}, Rides ${ridesDone}; ${count1}`);

      t.as('Sam: Rides');
      await t.press('[data-testid="eh-next"]');
      await t.settle({ quietMs: 300 });
      const step2 = await t.text('[data-testid="eh-step-count"]');
      const rule = await t.count('[data-testid="eh-one-child-rule"]');
      const dayCards = await t.count('[data-testid="eh-getting-day"]');
      t.check('Next goes to part 2, which starts with the one-child rule and shows the days answered', step2 === 'Part 2 of 4' && rule === 1 && dayCards === 3,
        `${step2}; rule ${rule}; day cards ${dayCards}`);
      const sat = rideDay(t, 'Saturday');
      const toQ = sat.locator('[data-testid="eh-to-mode"]');
      const assumed = await toQ.locator('[data-testid="eh-assumed"]').count();
      const toOpts = await toQ.locator('.eh-option').count();
      const carpoolOn = await option(toQ, 'Team carpool').getAttribute('aria-checked');
      t.check('the ride question says Team carpool was picked for them, with all three cards showing', assumed === 1 && toOpts === 3 && carpoolOn === 'true',
        `assumed note ${assumed}; cards ${toOpts}; carpool chosen ${carpoolOn}`);
      const school = sat.locator('[data-testid="eh-school-mode"]');
      const schoolBefore = await school.locator('.eh-option').count();
      await t.press(option(school, 'We drop off at Bosco Tech'));
      await t.settle({ quietMs: 300 });
      const schoolAfter = await school.locator('.eh-option').count();
      const change = await school.locator('[data-testid="eh-option-change"]').count();
      const stored = (await store(t, 'hub_day_answers')).find((a) => a.day_id === EH.sat && a.invite_id.endsWith('400'))?.school_mode;
      t.check('an answered question shrinks to the chosen card and a Change button', schoolBefore === 2 && schoolAfter === 1 && change === 1 && stored === 'self',
        `cards ${schoolBefore} -> ${schoolAfter}; Change ${change}; stored ${stored}`);

      // Skipping ahead: Finish lists what is left and flags the missing seat.
      await part(t, 'Finish');
      const bannerTodo = await t.text('[data-testid="eh-summary-banner"] .eh-banner-title');
      const todos = await t.texts('[data-testid="eh-todo"] .eh-todo-text');
      const needs0 = await t.count('[data-testid="eh-needs-seat"]');
      t.check('Finish before the end says what is left, one tappable line each, and flags that Sam has no seat',
        /^Almost there: \d+ answers left$/.test(bannerTodo) && todos.some((x) => x.startsWith('Food allergies')) && todos.some((x) => x.startsWith('Emergency contact name')) && needs0 === 1,
        `"${bannerTodo}"; ${todos.length} lines; needs-seat ${needs0}`);
      await t.press('[data-testid="eh-needs-seat"]');
      await t.settle({ quietMs: 300 });
      const backTo = await t.text('[data-testid="eh-step-count"]');

      // A seat, right under the question.
      const vanClaim = await seatCar(t, 'Saturday', 'to', 'Coach Max').locator('[data-testid="eh-claim"]').count();
      const vanNote = await seatCar(t, 'Saturday', 'to', 'Coach Max').locator('[data-testid="eh-needs-two"]').count();
      const kim = seatCar(t, 'Saturday', 'to', 'Kim Nguyen');
      const kimClaim = await kim.locator('[data-testid="eh-claim"]').count();
      await claimIn(t, kim);
      const seat = (await store(t, 'hub_seats')).filter((s) => s.invite_id.endsWith('400'));
      const sat2 = rideDay(t, 'Saturday');
      const mineLabel = await sat2.locator('.eh-run-to [data-testid="eh-seat-picker"] .eh-q-label').first().textContent();
      const listed = await sat2.locator('.eh-run-to [data-testid="eh-seat-picker"] [data-testid="eh-car"]').count();
      const homeLabel = await sat2.locator('.eh-run-home [data-testid="eh-seat-picker"] .eh-q-label').first().textContent();
      t.check('the seat flag leads back to Rides, where the seat picker sits under the question: the empty mentor van offers no Claim and says why, a family car offers one',
        backTo === 'Part 2 of 4' && vanClaim === 0 && vanNote === 1 && kimClaim === 1, `${backTo}; van Claim ${vanClaim}, van note ${vanNote}, Kim Claim ${kimClaim}`);
      t.check('claiming the seat there also seats Sam home in the same family\'s car; each run then lists only Sam\'s car',
        seat.length === 2 && seat.some((x) => x.car_id === EH.carTaylorSatTo && x.run === 'to') && seat.some((x) => x.run === 'home') && /^Sam's seat there/.test(mineLabel) && /^Sam's seat home/.test(homeLabel) && listed === 1,
        `seats ${seat.map((x) => `${x.run}:${x.car_id.slice(-3)}`).join(', ')}; "${mineLabel}" / "${homeLabel}"; listed ${listed}`);
      await t.shot('sam-rides');

      t.as('Sam: Food and Contacts');
      await part(t, 'Finish');
      const needs1 = await t.count('[data-testid="eh-needs-seat"]');
      await t.press(t.page.locator('[data-testid="eh-todo"] .eh-todo', { hasText: 'Food allergies' }));
      await t.settle({ quietMs: 300 });
      const step3 = await t.text('[data-testid="eh-step-count"]');
      t.check('with a seat the flag is gone, and a line in the list opens its part', needs1 === 0 && step3 === 'Part 3 of 4', `needs-seat ${needs1}; ${step3}`);
      await pick(t, t.page.locator('[data-testid="eh-allergies"]'), 'No allergies');
      await pick(t, t.page.locator('fieldset', { hasText: 'take medicine during the event' }), 'No');
      await t.press('[data-testid="eh-next"]');
      await t.settle({ quietMs: 300 });
      const step4 = await t.text('[data-testid="eh-step-count"]');
      const em = t.page.locator('.eh-card', { hasText: 'Emergency contact' }).locator('input');
      await em.nth(0).fill('Lee Parent');
      await em.nth(1).fill('5555550142');
      await em.nth(1).blur();
      await pick(t, t.page.locator('fieldset', { hasText: 'FIRST registration for this season' }), 'Done');
      await t.page.waitForTimeout(1200);
      await t.settle({ quietMs: 400 });
      const shown = await em.nth(1).inputValue();
      const r = (await store(t, 'hub_responses')).find((x) => x.invite_id.endsWith('400'));
      t.check('part 4: a phone typed as digits is shown formatted and stored as typed', step4 === 'Part 4 of 4' && shown === '(555) 555-0142' && r?.emergency_phone === '5555550142',
        `${step4}; shown "${shown}"; stored "${r?.emergency_phone}"`);
      const status1 = await t.text('[data-testid="eh-status"]');
      t.check('every required answer saved: the status says sign-up is done and lock-in is due', /^Sign-up done\. Lock-in due /.test(status1), status1);

      t.as('Sam: Finish');
      await t.press('[data-testid="eh-finish"]');
      await t.settle({ quietMs: 300 });
      const lockCards = await t.count('[data-testid="eh-lockin-day"]');
      const plan = await t.texts('[data-testid="eh-lockin-day"] .eh-plan dd');
      t.check('Finish lands on lock-in, one card per day, with the plan in words', lockCards === 3 && plan[0] === "Kim Nguyen's car" && plan[1] === "Kim Nguyen's car",
        `${lockCards} day cards; Saturday there "${plan[0]}", home "${plan[1]}"`);
      await t.shot('sam-lockin');
      await t.press('[data-testid="eh-confirm-day"]');
      await t.settle({ quietMs: 400 });
      const status2 = await t.text('[data-testid="eh-status"]');
      const banner = await t.text('[data-testid="eh-summary-banner"] .eh-banner-title');
      const count4 = await t.text('[data-testid="eh-tracker-count"]');
      t.check('one tap confirms the day: "All set", every part done', /^All set\. See you /.test(status2) && banner === 'You are all set' && count4 === '4 of 4 parts done' && (await t.count('[data-testid="eh-confirmed"]')) === 1,
        `${status2}; "${banner}"; ${count4}`);
      await t.tapTargets(CONTROLS, '44px floor on every family-page control (lock-in done)');
      await t.noHScroll('no horizontal scroll on the family page');
      await part(t, 'Rides');
      await t.tapTargets(CONTROLS, '44px floor on every control in Rides');
      await t.noHScroll('no horizontal scroll in Rides');
    });

    // ════ autosave survives failure ═══════════════════════════════════════
    await t.step('autosave failure', async () => {
      await t.open(fam('sam'), { persona: 'signedout', reset: true, ready: '[data-testid="eh-status"]' });
      t.as('Sam, two failed saves');
      await part(t, 'Contacts');
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
      const bar = await t.text('[data-testid="eh-savebar"]');
      t.check('a failed save says "Not saved, retrying" by the field and at the foot of the screen, and keeps what was typed', during === '(555) 555-0177' && /retrying/.test(bar),
        `input "${during}"; foot "${bar}"`);
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
      await t.settle({ quietMs: 300 });
      const r2 = (await store(t, 'hub_responses')).find((x) => x.invite_id.endsWith('400'));
      const bar2 = await t.text('[data-testid="eh-savebar"]');
      await t.page.clock.fastForward(3000);
      await t.page.waitForTimeout(150);
      const barGone = await t.count('[data-testid="eh-savebar"]');
      t.check('without a failure the next save lands at once; the foot of the screen says all changes are saved, then the note goes',
        r2?.parent_phone === '5555550188' && bar2 === 'All changes saved' && barGone === 0,
        `store "${r2?.parent_phone}"; foot "${bar2}", then ${barGone} after 3 s`);
    });

    // ════ phones, pickup spots, allergy names ═════════════════════════════
    await t.step('consent-gated visibility', async () => {
      await t.open('/_fixture', { persona: 'signedout', reset: true });
      const phonesOn = async (key, short) => {
        await familyBoard(t, key, short);
        return {
          phones: await t.count('.eh-board [data-testid="eh-driver-phone"]'),
          spots: await t.count('.eh-board [data-testid="eh-spot"]'),
        };
      };
      t.as('Saturday, to the venue');
      const riley = await phonesOn('riley', 'Sat');
      const jordan = await phonesOn('jordan', 'Sat');
      t.check('the driver\'s phone (consented) reaches the family in that car and not a family outside it', riley.phones === 1 && jordan.phones === 0,
        `Riley (in Morgan Exempt's car) ${riley.phones}, Jordan (in no car) ${jordan.phones}`);
      const caseyBefore = await phonesOn('casey', 'Sat');
      const taylor = await phonesOn('taylor', 'Sat');
      t.check('an open pickup spot reaches the pickup driver only: not a driver without pickups, not a family', caseyBefore.spots === 1 && taylor.spots === 0 && jordan.spots === 0,
        `Casey (takes pickups) ${caseyBefore.spots}, Taylor (does not) ${taylor.spots}, Jordan ${jordan.spots}`);
      await familyBoard(t, 'casey', 'Sat');
      await t.press(t.page.locator('.eh-board [data-testid="eh-pickups"] button', { hasText: 'Accept into my car' }));
      await t.settle({ quietMs: 400 });
      const caseyAfter = { spots: await t.count('.eh-board [data-testid="eh-spot"]') };
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
      await part(t, 'Food');
      await openFold(t, 'eh-food-fold');
      const famNames = await t.count('[data-testid="eh-allergy-names"]');
      const strip = await t.texts('[data-testid="eh-allergy-strip"]');
      t.check('allergy names are staff-only; families see the counts', staffNames.some((n) => n.startsWith('Casey Exempt')) && famNames === 0 && strip.some((s) => s.includes('Peanut (1)')),
        `staff name rows ${staffNames.length}; family name lists ${famNames}; family strip "${strip[0]}"`);
    });

    // ════ the last seat ═══════════════════════════════════════════════════
    await t.step('last-seat race', async () => {
      await t.open('/_fixture', { persona: 'signedout', reset: true });
      t.as('Jordan and Avery, one seat, from the seat picker');
      await familyPage(t, 'jordan');
      await part(t, 'Rides');
      const other = await t.context.newPage();
      await other.goto(t.origin + fam('avery'));
      await waitForFixture(other);
      await other.waitForSelector('[data-testid="eh-status"]');
      await other.locator('[data-testid="eh-part-tile"]', { has: other.locator('.eh-tile-label', { hasText: /^Rides$/ }) }).click();
      await other.waitForSelector('[data-testid="eh-seat-picker"]');
      const c1 = seatCar(t, 'Saturday', 'to', 'Morgan Exempt');
      const c2 = other.locator('[data-testid="eh-getting-day"] .eh-run-to [data-testid="eh-seat-picker"] [data-testid="eh-car"]', { has: other.locator('.eh-car-driver', { hasText: /^Morgan Exempt$/ }) });
      const bothOffered = (await c1.locator('[data-testid="eh-claim"]').count()) === 1 && (await c2.locator('[data-testid="eh-claim"]').count()) === 1;
      await t.press(c1.locator('[data-testid="eh-claim"]'));
      const confirmText = await c1.locator('[data-testid="eh-claim-confirm"]').textContent().catch(() => '');
      await t.press(c1.locator('[data-testid="eh-claim-yes"]'));
      await t.settle({ quietMs: 400 });
      await c2.locator('[data-testid="eh-claim"]').click();
      await c2.locator('[data-testid="eh-claim-yes"]').click();
      await other.waitForSelector('[data-testid="eh-seat-picker"] .eh-note-bad', { timeout: 8000 });
      const loser = (await other.locator('[data-testid="eh-seat-picker"] [data-testid="eh-car"] .eh-note-bad').first().textContent()).trim();
      const seats = (await store(t, 'hub_seats')).filter((s) => s.car_id === EH.carCaseySatTo);
      t.check('both families were offered the last seat, and the car warned it leaves early', bothOffered && /leaves the venue at 3:00 PM, before the day ends/.test(confirmText),
        `offered to both: ${bothOffered}; confirm "${confirmText.trim().slice(0, 70)}"`);
      t.check('one wins; the other reads "That car just filled. Pick another."', loser === 'That car just filled. Pick another.' && seats.length === 2,
        `loser sees "${loser}"; riders in the 2-seat car ${seats.length}`);
      await other.close();
    });

    // ════ the one-child rule ══════════════════════════════════════════════
    await t.step('one-child rule', async () => {
      await t.open('/_fixture', { persona: 'signedout', reset: true });
      t.as('Rowan and the empty mentor van');
      await familyPage(t, 'rowan');
      await part(t, 'Rides');
      const ruleText = await t.text('[data-testid="eh-one-child-rule"]');
      const van = seatCar(t, 'Saturday', 'to', 'Coach Max');
      const vanClaim = await van.locator('[data-testid="eh-claim"]').count();
      const vanNote = await van.locator('[data-testid="eh-needs-two"]').textContent().catch(() => '');
      // Past the page: the rule still refuses the first student.
      const forced = await rawFamilyCall(t, TOK.rowan, 'claim_seat', { car_id: EH.carMentorSat, day_id: EH.sat, run: 'to' });
      const vanRiders = (await store(t, 'hub_seats')).filter((s) => s.car_id === EH.carMentorSat).length;
      t.check('the rule is stated at the top of Rides; the empty van offers no Claim and says a mentor seats two; a claim forced past the page is refused',
        /one-child rule/i.test(ruleText) && vanClaim === 0 && /mentor seats the first two/.test(vanNote) && forced.status === 409 && /alone with an adult who is not their parent/.test(forced.body?.message ?? '') && vanRiders === 0,
        `rule shown ${!!ruleText}; van Claim ${vanClaim}; forced ${forced.status} "${(forced.body?.message ?? '').slice(0, 40)}"; riders ${vanRiders}`);
      await claimIn(t, seatCar(t, 'Saturday', 'to', 'Kim Nguyen'));
      const kim = (await store(t, 'hub_seats')).filter((s) => s.car_id === EH.carTaylorSatTo).length;
      t.check('positive control: a family car (the driver\'s own student aboard) takes one rider', kim === 1, `riders in Kim Nguyen's car ${kim}`);

      t.as('a mentor seats two in the empty van (0008)');
      await t.open(MANAGE, { persona: 'mentor', ready: '[data-testid="ehm-page"]' });
      await tab(t, 'Carpool');
      await day(t, 'Sat');
      const pair = car(t, 'Coach Max').locator('[data-testid="eh-pair"]');
      const moveOne = await car(t, 'Coach Max').locator('select[aria-label="Move a student into this car"]').count();
      const opts = await pair.locator('select[aria-label="First student"] option').allTextContents();
      await pair.locator('select[aria-label="First student"]').selectOption({ label: 'Jordan Okafor' });
      await pair.locator('select[aria-label="Second student"]').selectOption({ label: 'Avery Chen' });
      await t.press(pair.locator('[data-testid="eh-pair-go"]'));
      await t.settle({ quietMs: 500 });
      const seated = (await store(t, 'hub_seats')).filter((s) => s.car_id === EH.carMentorSat).length;
      const vanRow = (await store(t, 'hub_cars')).find((c) => c.id === EH.carMentorSat);
      t.check('the empty van offers "seat two together" instead of a one-student move; both are seated and no override is left on the car',
        moveOne === 0 && opts.length >= 3 && seated === 2 && !vanRow?.minor_override_reason, `one-student move ${moveOne}; choices ${opts.length - 1}; seated ${seated}; override "${vanRow?.minor_override_reason ?? ''}"`);

      t.as('Quinn leaves Coach Max\'s Sunday car');
      const redBefore = (await store(t, 'hub_outbox')).filter((o) => o.kind === 'car_red').length;
      await familyPage(t, 'quinn');
      await part(t, 'Rides');
      await t.press(seatCar(t, 'Sunday', 'to', 'Coach Max').locator('button', { hasText: /^Leave this car$/ }));
      await t.settle({ quietMs: 400 });
      await openFold(t, 'eh-board-fold');
      await day(t, 'Sun');
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
      await part(t, 'Rides');
      const fri = seatCar(t, 'Friday', 'to', 'Morgan Exempt');
      const leaveFri = await fri.locator('button', { hasText: /^Leave this car$/ }).count();
      const statusFri = await fri.locator('[data-testid="eh-car-status"]').textContent();
      const leaveSat = await seatCar(t, 'Saturday', 'to', 'Morgan Exempt').locator('button', { hasText: /^Leave this car$/ }).count();
      t.check('a car marked Left offers no Leave; the same family\'s car that has not left does', leaveFri === 0 && leaveSat === 1 && /^Left \d/.test(statusFri),
        `Friday (${statusFri}) ${leaveFri}, Saturday ${leaveSat}`);
      const leavingNow = await t.count('[data-testid="eh-leaving"]');
      t.check('a family is not offered "Leaving now" weeks before the day', leavingNow === 0, `${leavingNow}`);
      await part(t, 'Food');
      await openFold(t, 'eh-food-fold');
      const started = await t.page.locator('[data-testid="eh-meal"]', { hasText: 'Setup snacks' }).locator('button', { hasText: /^Claim$/ }).count();
      const dinner = await t.page.locator('[data-testid="eh-meal"]', { hasText: 'Fri dinner' }).locator('button', { hasText: /^Claim$/ }).count();
      t.check('a meal that started offers no Claim; one that has not does', started === 0 && dinner === 1, `started ${started}, Fri dinner ${dinner}`);
      await familyPage(t, 'past');
      const over = await t.text('[data-testid="eh-status"]');
      const enabledPast = await t.evaluate(() => [...document.querySelectorAll('.eh-chip, .eh-tick, .eh-input, .eh-option')].filter((b) => !b.disabled).length);
      const changePast = await t.count('[data-testid="eh-review-change"]');
      const trackerPast = await t.count('[data-testid="eh-tracker"]');
      await familyPage(t, 'sam');
      const enabledLive = await t.evaluate(() => [...document.querySelectorAll('.eh-chip, .eh-tick, .eh-input, .eh-option')].filter((b) => !b.disabled).length);
      const trackerLive = await t.count('[data-testid="eh-tracker"]');
      t.check('after the event ends nothing is offered to change and there is no tracker; a live event offers answers and its tracker',
        /is over\. Thank you!$/.test(over) && enabledPast === 0 && changePast === 0 && trackerPast === 0 && enabledLive > 5 && trackerLive === 1,
        `"${over}"; enabled controls: ended ${enabledPast}, live ${enabledLive}; tracker ${trackerPast} / ${trackerLive}`);
    });

    // ════ event info folds ════════════════════════════════════════════════
    await t.step('event info', async () => {
      await familyPage(t, 'riley', { persona: 'signedout', reset: true });
      t.as('event info, folded');
      await t.press('[data-testid="eh-info-open"]');
      await t.settle({ quietMs: 250 });
      const sections = await t.count('[data-testid="eh-info-section"]');
      const openNow = await t.count('[data-testid="eh-info-section"].eh-fold-open');
      const h0 = await t.evaluate(() => document.documentElement.scrollHeight);
      await t.press(t.page.locator('[data-testid="eh-info-section"] > .eh-fold-head').first());
      const openAfter = await t.count('[data-testid="eh-info-section"].eh-fold-open');
      const h1 = await t.evaluate(() => document.documentElement.scrollHeight);
      await t.press('[data-testid="eh-info-back"]');
      await t.settle({ quietMs: 200 });
      const back = await t.count('[data-testid="eh-tracker"]');
      t.check('event info is a list of closed sections that open on a tap, and Back returns to the form',
        sections >= 4 && openNow === 0 && openAfter === 1 && h1 > h0 && back === 1, `${sections} sections, ${openNow} open -> ${openAfter}; height ${h0} -> ${h1}; back to tracker ${back}`);
    });

    // ════ students read, never write ══════════════════════════════════════
    await t.step('student boards', async () => {
      await t.open(BOARD, { persona: 'student', reset: true, ready: '[data-testid="trip-board"]' });
      t.as('student on /trips/<id>');
      await day(t, 'Sat');
      const names = await t.count('[data-testid="eh-rider"]');
      const writes = await t.count('[data-testid="eh-claim"], [data-testid="eh-leaving"], [data-testid="eh-pair"], button:has-text("Leave this car")');
      const phones = await t.count('[data-testid="eh-driver-phone"], [data-testid="eh-rider-phone"], [data-testid="eh-spot"]');
      await t.open(BOARD, { persona: 'mentor', ready: '[data-testid="trip-board"]' });
      await day(t, 'Sat');
      const staffPhones = await t.count('[data-testid="eh-driver-phone"], [data-testid="eh-rider-phone"], [data-testid="eh-spot"]');
      t.check('a student sees cars and riders, with no write control and no phone or spot (staff on the same board see them)',
        names >= 1 && writes === 0 && phones === 0 && staffPhones >= 1, `riders ${names}; write controls ${writes}; phones/spots ${phones} against staff ${staffPhones}`);
    });

    // ════ the open link (0007): like a Google Form, option B ═════════════
    await t.step('open link', async () => {
      t.as('a parent on /join, signed out');
      await t.open('/join', { persona: 'signedout', reset: true, ready: '[data-testid="eh-join-form"]' });
      const names = await t.texts('.eh-join-opt');
      t.check('the open link lists students with this season\'s application, and no staff (Robin is a lead and a student)',
        names.includes('Dakota Hale') && names.includes('Riley Student') && !names.includes('Robin Park') && !names.some((n) => /Max|Ada/.test(n)),
        `${names.length} listed: ${names.slice(0, 4).join(', ')}...`);
      await t.tapTargets(CONTROLS + ', .eh-join-mentor a', '44px floor on every control of the open link');
      await t.noHScroll('no horizontal scroll on the open link');

      // Nobody has started for Dakota: straight in.
      await t.page.locator('[data-testid="eh-join-form"] input[aria-label="Search for your student"]').fill('dak');
      const filtered = await t.count('.eh-join-opt');
      await t.press(t.page.locator('.eh-join-opt', { hasText: 'Dakota Hale' }));
      await t.page.locator('input[autocomplete="name"]').fill('Dana Hale');
      await t.page.locator('input[type="email"]').fill('Dana.Hale@example.com');
      await t.press('button[type="submit"]');
      await t.waitFor('[data-testid="eh-join-error"]');
      const refused = await t.text('[data-testid="eh-join-error"]');
      const stillHere = await t.count('[data-testid="eh-join-form"]');
      t.check('typing filters the list; without the parent-or-guardian tick it does not start, and says why',
        filtered === 1 && /parent or guardian/.test(refused) && stillHere === 1, `${filtered} match for "dak"; "${refused}"`);
      await t.press('[data-testid="eh-join-guardian"]');
      await t.press('button[type="submit"]');
      await t.waitFor('[data-testid="eh-welcome"]');
      await t.waitFor('[data-testid="eh-status"]');
      const student = await t.text('[data-testid="eh-student"]');
      const welcome = await t.text('[data-testid="eh-welcome"]');
      const tiles = await t.count('[data-testid="eh-part-tile"]');
      t.check('the first person for a student goes straight into the form, told to bookmark it and that the link is emailed',
        /\/e\/[A-Za-z0-9_-]{22}$/.test(new URL(t.page.url()).pathname) && student === 'Dakota Hale' && /Bookmark it/.test(welcome) && /dana\.hale@example\.com/i.test(welcome) && tiles === 5,
        `${new URL(t.page.url()).pathname.slice(0, 6)}...; student "${student}"; ${tiles} tiles`);
      const invites = (await t.rows('hub_invites')).filter((i) => i.student_id === DAKOTA);
      const welcomes = (await t.rows('hub_outbox')).filter((o) => o.kind === 'welcome');
      t.check('one family is created for Dakota, with the email that was typed, and one welcome email is queued',
        invites.length === 1 && JSON.stringify(invites[0].emails) === '["dana.hale@example.com"]' && welcomes.length === 1,
        `invites ${invites.length}, emails ${JSON.stringify(invites[0]?.emails)}, welcome emails ${welcomes.length}`);

      // A second parent, added from Contacts.
      await part(t, 'Contacts');
      const people0 = await t.count('[data-testid="eh-person"]');
      const you = await t.text('[data-testid="eh-person"] .eh-tag');
      await t.page.locator('[data-testid="eh-add-parent"] input[aria-label="Their name"]').fill('Pat Hale');
      await t.page.locator('[data-testid="eh-add-parent"] input[type="email"]').fill('Pat.Hale@example.com');
      await t.press('[data-testid="eh-add-parent"] button[type="submit"]');
      await t.waitFor('[data-testid="eh-people"] [role="status"]');
      await t.settle({ quietMs: 400 });
      const addNote = await t.text('[data-testid="eh-people"] [role="status"]');
      const after = (await t.rows('hub_invites')).find((i) => i.student_id === DAKOTA);
      const added = (await t.rows('hub_outbox')).filter((o) => o.kind === 'added');
      const people1 = await t.texts('[data-testid="eh-person"] .eh-person-name');
      t.check('Contacts lists who is on the page (the joiner marked You); adding another parent with a name sends them their own link',
        people0 === 1 && you === 'You' && /Sent a link to Pat\.Hale@example\.com/.test(addNote) && after.emails.includes('pat.hale@example.com')
          && after.emails.length === 2 && added.length === 1 && people1.length === 2 && people1[1] === 'Pat Hale',
        `people ${people0} -> ${people1.join(' / ')}; "${addNote}"; emails ${JSON.stringify(after.emails)}; added emails ${added.length}`);

      // Reopening the open link on the same phone goes back to the page.
      await t.open('/join', { persona: 'signedout', ready: '[data-testid="eh-join-saved"]' });
      const back = await t.text('[data-testid="eh-join-saved"]');
      t.check('opening the link again on the same phone offers "Continue for Dakota Hale"', /Continue for Dakota Hale/.test(back), back.slice(0, 60));

      // Someone already started for Riley: the page is NOT opened.
      await t.press(t.page.locator('[data-testid="eh-join-saved"] button', { hasText: 'Sign up another student' }));
      await t.press(t.page.locator('.eh-join-opt', { hasText: 'Riley Student' }));
      await t.page.locator('input[autocomplete="name"]').fill('Someone Else');
      await t.page.locator('input[type="email"]').fill('someone.else@example.com');
      await t.press('[data-testid="eh-join-guardian"]');
      await t.press('button[type="submit"]');
      await t.waitFor('[data-testid="eh-join-done"]');
      const done = await t.text('[data-testid="eh-join-done"]');
      const onForm = await t.count('[data-testid="eh-status"]');
      const riley = (await t.rows('hub_invites')).find((i) => i.student_id === '00000000-0000-0000-0000-0000000000c2');
      const asks = (await t.rows('hub_outbox')).filter((o) => o.kind === 'join_request');
      t.check('once a family started, a second person is not let in: the link is emailed to that family, address masked, and the asker is not added',
        /already started/.test(done) && /•••@/.test(done) && !/someone\.else/.test(riley.emails.join()) && onForm === 0 && asks.length === 1 && asks[0].to_emails.join() === riley.emails.join(),
        `"${done.slice(0, 70)}..."; family page shown ${onForm}; join emails ${asks.length}`);

      // A dead family link now points at the open link; /e alone goes there.
      await t.open('/e/AAAAAAAAAAAAAAAAAAAAAA', { persona: 'signedout', ready: '[data-testid="eh-lost"]' });
      const dead = await t.count('[data-testid="eh-lost"] a[href="/join"]');
      const deadAdd = await t.count('[data-testid="eh-add-parent"]');
      await t.open('/e', { persona: 'signedout', ready: '[data-testid="eh-join-form"], [data-testid="eh-join-saved"]' });
      t.check('a dead link points to the sign-up form (no add-parent card on it), and /e alone opens the sign-up form',
        dead === 1 && deadAdd === 0 && new URL(t.page.url()).pathname === '/join', `link ${dead}, add-parent ${deadAdd}, /e -> ${new URL(t.page.url()).pathname}`);

      // Mentors: the copyable link, and the way to add a car.
      await t.open(MANAGE, { persona: 'mentor', ready: '[data-testid="ehm-open-link"]' });
      const link = await t.page.locator('[data-testid="ehm-open-link"] input').inputValue();
      t.check('the mentor page shows the family sign-up link for this event', link.endsWith(`/join/${EH.event}`), link);
      await t.open(`/join/${EH.event}`, { persona: 'signedout', ready: '.eh-join-mentor' });
      const mentorLink = await t.count(`.eh-join-mentor a[href="/trips/${EH.event}/manage"]`);
      t.check('the open link tells a driving mentor where to add a car', mentorLink === 1, `${mentorLink}`);
    });

    // ════ families (0008) ═════════════════════════════════════════════════
    await t.step('families (0008)', async () => {
      t.as('a parent drives other students, without their own');
      await t.open(fam('quinn'), { persona: 'signedout', reset: true, ready: '[data-testid="eh-status"]' });
      await part(t, 'Rides');
      const sat = rideDay(t, 'Saturday');
      const offerBefore = await sat.locator('[data-testid="eh-car-offer"]').count();
      const checksBefore = await t.count('[data-testid="eh-driver-checks"]');
      const foldShut = await sat.locator('[data-testid="eh-drive-extra"]').count();
      await t.press(sat.locator('[data-testid="eh-drive-fold"] > .eh-fold-head'));
      const drive = sat.locator('[data-testid="eh-drive-extra"]');
      const driveOpts = (await drive.locator('.eh-chip').allTextContents()).map((x) => x.trim());
      await pick(t, drive, 'Yes, going there');
      await t.settle({ quietMs: 600 });
      const offer = sat.locator('[data-testid="eh-car-offer"]');
      const offerAfter = await offer.count();
      const checksAfter = await t.count('[data-testid="eh-driver-checks"]');
      const seatsLabel = await offer.locator('.eh-q-label').first().textContent();
      t.check('Quinn is not coming Saturday, yet a parent can still drive: the optional question waits behind a heading; saying yes opens the car questions and the driver checks',
        foldShut === 0 && driveOpts.join('|') === 'No|Yes, going there|Yes, coming home|Yes, both ways' && offerBefore === 0 && offerAfter === 1 && checksBefore === 0 && checksAfter === 1 && seatsLabel === 'How many students fit?',
        `question shown before opening ${foldShut}; ${driveOpts.join(' / ')}; car questions ${offerBefore} -> ${offerAfter}; checks ${checksBefore} -> ${checksAfter}; "${seatsLabel}"`);
      await pick(t, offer, '3');
      await offer.locator('[data-testid="eh-car-desc"]').fill('blue minivan');
      await offer.locator('[data-testid="eh-car-desc"]').blur();
      await offer.locator('input[type="time"]').fill('18:00');
      await offer.locator('input[type="time"]').blur();
      await pick(t, offer.locator('fieldset', { hasText: 'pick up a student near their home' }), 'No');
      const checks = t.page.locator('[data-testid="eh-driver-checks"]');
      await t.press(checks.locator('.eh-tick', { hasText: 'I am 25 or older.' }));
      await t.press(checks.locator('.eh-tick', { hasText: "valid California driver's license" }));
      await t.page.waitForTimeout(1200);
      await t.settle({ quietMs: 500 });
      const quinnInvite = (await store(t, 'hub_invites')).find((i) => i.student_id === '00000000-0000-0000-0000-0000000000c8')?.id;
      const cars = (await store(t, 'hub_cars')).filter((c) => c.driver_invite_id === quinnInvite && c.day_id === EH.sat);
      const mine = await sat.locator('[data-testid="eh-my-car"]').count();
      const mineNote = await sat.locator('[data-testid="eh-my-car"] [data-testid="eh-needs-two"]').textContent().catch(() => '');
      t.check('the car is listed for the run chosen and no other, and says it takes two students together (her own student is not in it)',
        cars.length === 1 && cars[0].run === 'to' && cars[0].seats === 3 && mine === 1 && /two or more students together/.test(mineNote),
        `cars ${cars.map((c) => `${c.run}/${c.seats}`).join(', ')}; my car shown ${mine}; "${mineNote.slice(0, 50)}"`);
      await pick(t, drive, 'No');
      await t.settle({ quietMs: 600 });
      const carsGone = (await store(t, 'hub_cars')).filter((c) => c.driver_invite_id === quinnInvite && c.day_id === EH.sat).length;
      t.check('answering No takes the car off the carpool', carsGone === 0, `cars ${carsGone}`);

      t.as('one guardian removes another; a family leaves the trip');
      await t.open('/join', { persona: 'signedout', ready: '[data-testid="eh-join-form"], [data-testid="eh-join-saved"]' });
      if (await t.count('[data-testid="eh-join-saved"]')) await t.press(t.page.locator('[data-testid="eh-join-saved"] button', { hasText: 'Sign up another student' }));
      await t.press(t.page.locator('.eh-join-opt', { hasText: 'Dakota Hale' }));
      await t.page.locator('input[autocomplete="name"]').fill('Dana Hale');
      await t.page.locator('input[type="email"]').fill('dana.hale@example.com');
      await t.press('[data-testid="eh-join-guardian"]');
      await t.press('button[type="submit"]');
      await t.waitFor('[data-testid="eh-status"]');
      const myUrl = new URL(t.page.url()).pathname;
      await part(t, 'Contacts');
      await t.page.locator('[data-testid="eh-add-parent"] input[aria-label="Their name"]').fill('Pat Hale');
      await t.page.locator('[data-testid="eh-add-parent"] input[type="email"]').fill('pat.hale@example.com');
      await t.press('[data-testid="eh-add-parent"] button[type="submit"]');
      await t.waitFor('[data-testid="eh-people"] [role="status"]');
      await t.settle({ quietMs: 400 });
      const removeBtns = await t.count('[data-testid="eh-person-remove"]');
      await t.press(t.page.locator('[data-testid="eh-person"]', { hasText: 'Pat Hale' }).locator('[data-testid="eh-person-remove"]'));
      await t.press('[data-testid="eh-person-remove-yes"]');
      await t.waitFor(() => /was removed/.test(document.querySelector('[data-testid="eh-people"] [role="status"]')?.textContent ?? ''));
      await t.settle({ quietMs: 400 });
      const people = await t.count('[data-testid="eh-person"]');
      const removeLeft = await t.count('[data-testid="eh-person-remove"]');
      const emails = (await t.rows('hub_invites')).find((i) => i.student_id === DAKOTA)?.emails;
      t.check('with two on the page each has Remove; removing Pat leaves one, and the last one cannot be removed (only the family can leave)',
        removeBtns === 2 && people === 1 && removeLeft === 0 && JSON.stringify(emails) === '["dana.hale@example.com"]',
        `Remove buttons ${removeBtns} -> ${removeLeft}; people ${people}; emails ${JSON.stringify(emails)}`);

      const removedBefore = (await t.rows('hub_outbox')).filter((o) => o.kind === 'family_removed').length;
      await openFold(t, 'eh-leave-fold');
      await t.press('[data-testid="eh-leave"]');
      await t.press('[data-testid="eh-leave-yes"]');
      await t.waitFor('[data-testid="eh-removed"]');
      const gone = (await t.rows('hub_invites')).filter((i) => i.student_id === DAKOTA).length;
      const removedMail = (await t.rows('hub_outbox')).filter((o) => o.kind === 'family_removed').length;
      await t.open(myUrl, { persona: 'signedout', ready: '[data-testid="eh-lost"], [data-testid="eh-status"]' });
      const deadNow = await t.count('[data-testid="eh-lost"]');
      t.check('"Remove our family" takes the family off the trip: the page says so, mentors are told, and the old link no longer opens',
        gone === 0 && removedMail === removedBefore + 1 && deadNow === 1, `families for Dakota ${gone}; removal emails ${removedBefore} -> ${removedMail}; old link dead ${deadNow}`);
      await t.open('/join', { persona: 'signedout', ready: '[data-testid="eh-join-form"], [data-testid="eh-join-saved"]' });
      if (await t.count('[data-testid="eh-join-saved"]')) await t.press(t.page.locator('[data-testid="eh-join-saved"] button', { hasText: 'Sign up another student' }));
      await t.press(t.page.locator('.eh-join-opt', { hasText: 'Dakota Hale' }));
      await t.page.locator('input[autocomplete="name"]').fill('Dana Hale');
      await t.page.locator('input[type="email"]').fill('dana.hale@example.com');
      await t.press('[data-testid="eh-join-guardian"]');
      await t.press('button[type="submit"]');
      await t.waitFor('[data-testid="eh-status"]');
      const again = (await t.rows('hub_invites')).filter((i) => i.student_id === DAKOTA).length;
      t.check('the student can be signed up again afterwards, straight in', again === 1 && (await t.text('[data-testid="eh-student"]')) === 'Dakota Hale', `families for Dakota ${again}`);

      t.as('a mentor removes a family; the rule is always on');
      await t.open(MANAGE, { persona: 'admin', ready: '[data-testid="ehm-page"]' });
      await tab(t, 'Families');
      const rowsBefore = await t.count('[data-testid="ehm-families"] tbody tr');
      await t.press(t.page.locator('[data-testid="ehm-families"] .ehm-name-btn', { hasText: /^Jordan Okafor$/ }));
      await t.waitFor('[data-testid="ehm-removals"]');
      await t.press('[data-testid="ehm-remove-family"]');
      await t.press('[data-testid="ehm-remove-family-yes"]');
      await t.waitFor('[data-testid="ehm-families"]');
      await t.settle({ quietMs: 400 });
      const rowsAfter = await t.count('[data-testid="ehm-families"] tbody tr');
      const jordan = (await t.rows('hub_invites')).filter((i) => i.student_id === '00000000-0000-0000-0000-0000000000c4').length;
      t.check('a mentor removes a family from its page: one row fewer, and the family is gone', rowsAfter === rowsBefore - 1 && jordan === 0, `rows ${rowsBefore} -> ${rowsAfter}; Jordan's family ${jordan}`);
      await tab(t, 'Setup');
      const always = await t.count('[data-testid="ehm-one-child"]');
      const toggle = await t.count('.ehm-setup button:has-text("One-minor"), .ehm-setup button:has-text("one-child")');
      t.check('setup shows the one-child rule as always on, with no switch', always === 1 && toggle === 0, `always-on chip ${always}; switches ${toggle}`);

      t.as(`without 0008 (mig ${without0008})`);
      await t.open(fam('quinn'), { persona: 'signedout', mig: without0008, reset: true, ready: '[data-testid="eh-status"]' });
      await part(t, 'Rides');
      const driveNo = await t.count('[data-testid="eh-drive-fold"]');
      await part(t, 'Contacts');
      const leaveNo = await t.count('[data-testid="eh-leave-fold"]');
      const peopleNo = await t.count('[data-testid="eh-person"]');
      const addStill = await t.count('[data-testid="eh-add-parent"]');
      await t.open(fam('sam'), { persona: 'signedout', mig: without0008, ready: '[data-testid="eh-status"]' });
      await pick(t, t.page.locator('[data-testid="eh-day-q"]').nth(0), 'Coming');
      await t.settle({ quietMs: 400 });
      const moreNo = await t.count('[data-testid="eh-count-more"]');
      await t.open(fam('sam'), { persona: 'signedout', mig: 'all', ready: '[data-testid="eh-status"]' });
      const moreYes = await t.count('[data-testid="eh-count-more"]');
      t.check('without 0008 there is no drive-without-your-own question, no leaving, no people list and no "5 or more" (adding a parent stays, from 0007); with 0008 "5 or more" is back',
        driveNo === 0 && leaveNo === 0 && peopleNo === 0 && addStill === 1 && moreNo === 0 && moreYes === 1,
        `drive ${driveNo}, leave ${leaveNo}, people ${peopleNo}, add ${addStill}, 5-or-more ${moreNo} / with 0008 ${moreYes}`);
    });

    // ════ the mentor page ═════════════════════════════════════════════════
    await t.step('mentor page', async () => {
      await t.open(MANAGE, { persona: 'admin', mig: 'all', reset: true, ready: '[data-testid="ehm-page"]' });
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
