/**
 * The pages and states the plate tools photograph and measure beyond the
 * route table: pages that exist for one persona only, and the interactive
 * states a screenshot of a freshly loaded route never shows. Shared by
 * shots.mjs and measure.mjs so both look at the same things.
 */
import { STUDENT_ID, fxUrl } from './common.mjs';

// Pages that only exist for one persona, shot once each (not per admin/student).
export const PERSONA_PAGES = [
  { persona: 'parent', url: '/dashboard', name: 'dashboard' },
  { persona: 'pending', url: '/dashboard', name: 'gate' },
  { persona: 'signedout', url: '/', name: 'landing' },
  { persona: 'signedout', url: '/login', name: 'login' },
];

export const TODAY_START = Date.parse('2026-10-01T00:00:00-07:00');

// Interactive states. Each prepares the page from a fresh store and leaves it
// in the state to photograph; the on/off pair is then taken from that page.
export const STATES = [
  {
    name: 'state-avatar-menu', personas: ['student', 'admin'], url: '/dashboard',
    run: async (page) => {
      await page.locator('.nav-avatar-btn').first().click();
      await page.waitForSelector('.nav-avatar-menu', { timeout: 10_000 });
    },
  },
  {
    name: 'state-hours-menu', personas: ['student', 'admin'], url: '/dashboard',
    run: async (page) => {
      await page.locator('.nav-dropdown-trigger', { hasText: 'Hours' }).first().click();
      await page.waitForSelector('.nav-dropdown-menu', { timeout: 10_000 });
    },
  },
  {
    name: 'state-feedback-open', personas: ['student', 'admin'], url: '/dashboard',
    run: async (page) => {
      await page.locator('.fb-launch').first().click();
      await page.waitForSelector('.fb-panel', { timeout: 10_000 });
    },
  },
  {
    name: 'state-hours-drilldown', personas: ['student', 'admin'], url: '/hours',
    run: async (page) => {
      await page.locator('.board-row-click').first().click();
      await page.waitForSelector('.ah-dialog', { timeout: 10_000 });
      await page.waitForFunction(() => !document.querySelector('.ah-dialog')?.textContent?.includes('Loading'), null, { timeout: 10_000 }).catch(() => {});
    },
  },
  {
    name: 'state-schedule-agenda', personas: ['student', 'admin'], url: '/schedule',
    run: async (page) => {
      await page.locator('.sch-viewtab', { hasText: 'Agenda' }).first().click();
      await page.waitForFunction(() => document.querySelector('.sch-viewtab.on')?.textContent?.includes('Agenda'), null, { timeout: 10_000 });
    },
  },
  {
    name: 'state-schedule-new', personas: ['student', 'admin'], url: '/schedule',
    run: async (page) => {
      await page.locator('.sch-new-btn').first().click();
      await page.waitForSelector('.sch-form', { timeout: 10_000 });
    },
  },
  {
    name: 'state-job-detail', personas: ['student', 'admin'], url: '/jobs',
    run: async (page) => {
      await page.locator('.jobs-row').first().click();
      await page.waitForSelector('.jobs-detail', { timeout: 10_000 });
    },
  },
  {
    name: 'state-flag-session', personas: ['student'], url: '/my-hours',
    run: async (page) => {
      await page.locator('.mh-session-flagbtn').first().click();
      await page.waitForSelector('.mh-modal', { timeout: 10_000 });
    },
  },
  {
    name: 'state-log-correction', personas: ['student'], url: '/log-hours',
    run: async (page) => {
      await page.locator('.lh-corr-btn').first().click();
      await page.waitForSelector('.lh-modal', { timeout: 10_000 });
    },
  },
  {
    // The confirm screen: Sam must be checked OUT for /checkin to offer it,
    // and a feature fixture seeds Sam a session, so today's rows are cleared
    // first (the same setup tools/e2e/checkin.mjs does).
    // Each runs in a FRESH context: /checkin keeps a tap receipt in
    // localStorage, and under the fixed clock an earlier /checkin route shot
    // in the same context would read as a duplicate tap inside 60 s.
    name: 'state-checkin-confirm', personas: ['student'], url: '/_fixture', fresh: true,
    run: async (page, origin) => {
      await clearToday(page);
      await page.goto(`${origin}/checkin?loc=shop-main`);
      await page.waitForFunction(() => (document.body.textContent || '').includes('Confirm check-in'), null, { timeout: 15_000 });
    },
  },
  {
    name: 'state-checkin-success', personas: ['student'], url: '/_fixture', fresh: true,
    run: async (page, origin) => {
      await clearToday(page);
      await page.goto(`${origin}/checkin?loc=shop-main`);
      await page.waitForFunction(() => (document.body.textContent || '').includes('Confirm check-in'), null, { timeout: 15_000 });
      await page.locator('button', { hasText: 'Confirm check-in' }).click();
      await page.waitForFunction(() => (document.body.textContent || '').includes('CHECKED IN'), null, { timeout: 15_000 });
    },
  },
];

// The views the four visual reviewers opened by hand on the first pass
// (docs/SHAPES.md, "The review"): each found a defect the route set could not
// show, so each is now a state every later run photographs and measures.
// Kept in a list of their own so the identity proof can shoot the base for
// exactly these (`shots.mjs --routes none --states review`).
export const REVIEW_STATES = [
  {
    // A duplicate tap: /checkin, then /checkin-volunteer inside the 60 s tap
    // window, which lands on the amber "ALREADY OUT" readout panel (the one
    // chamfered panel in the app). A fresh context, like the other check-in
    // states, so no earlier route's tap receipt decides what it shows.
    name: 'state-checkin-duplicate', personas: ['student'], url: '/_fixture', fresh: true,
    run: async (page, origin) => {
      await page.goto(fxUrl(origin, '/checkin', 'student'));
      await page.waitForFunction(() => (document.body.textContent || '').includes('CHECKED OUT'), null, { timeout: 15_000 });
      await page.goto(fxUrl(origin, '/checkin-volunteer', 'student'));
      await page.waitForSelector('.checkin-panel', { timeout: 15_000 });
    },
  },
  {
    name: 'state-skills-coverage', personas: ['student'], url: '/skills',
    run: async (page) => {
      await page.locator('.msh-toggle-btn', { hasText: 'Team coverage' }).first().click();
      await page.waitForSelector('.cm-toggle-label', { timeout: 10_000 });
    },
  },
  {
    name: 'state-jobs-new', personas: ['student', 'admin'], url: '/jobs',
    run: async (page) => {
      await page.locator('.jobs-add-btn').first().click();
      await page.waitForSelector('.jobs-form-card', { timeout: 10_000 });
    },
  },
  {
    name: 'state-cert-open', personas: ['student'], url: '/certifications',
    run: async (page) => {
      await page.locator('.ic-cert-btn').first().click();
      await page.waitForSelector('.ic-facts', { timeout: 10_000 });
    },
  },
  {
    name: 'state-roster-expand', personas: ['admin'], url: '/roster',
    run: async (page) => {
      await page.locator('.roster-member-head').first().click();
      await page.waitForSelector('.roster-member-detail', { timeout: 10_000 });
    },
  },
  {
    name: 'state-surveys-settings', personas: ['admin'], url: '/surveys',
    run: async (page) => {
      await page.locator('.sa-tab', { hasText: 'Settings' }).first().click();
      await page.waitForSelector('.sa-manage-row', { timeout: 10_000 });
    },
  },
  {
    name: 'state-certify-member', personas: ['admin'], url: '/certify',
    run: async (page) => {
      const value = await page.locator('.cp-picker-select option').nth(1).getAttribute('value');
      await page.locator('.cp-picker-select').selectOption(value);
      await page.waitForSelector('.cp-category', { timeout: 10_000 });
    },
  },
  {
    name: 'state-catalog-open', personas: ['admin'], url: '/skills',
    run: async (page) => {
      await page.locator('.sc-cat-header').first().click();
      await page.waitForSelector('.sc-table-wrap', { timeout: 10_000 });
    },
  },
  {
    name: 'state-feedback-detail', personas: ['admin'], url: '/feedback',
    run: async (page) => {
      await page.locator('.fbp-item').first().click();
      await page.waitForSelector('.fbp-modal', { timeout: 10_000 });
    },
  },
];
STATES.push(...REVIEW_STATES);

export async function clearToday(page) {
  await page.evaluate(({ id, since }) => {
    const db = window.__fx.db;
    db.attendance_events = db.attendance_events.filter((e) => !(e.user_id === id && Date.parse(e.event_time) >= since));
    window.__fx.save();
  }, { id: STUDENT_ID, since: TODAY_START });
}

