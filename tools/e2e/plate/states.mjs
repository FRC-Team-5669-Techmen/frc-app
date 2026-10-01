/**
 * The pages and states the plate tools photograph and measure beyond the
 * route table: pages that exist for one persona only, and the interactive
 * states a screenshot of a freshly loaded route never shows. Shared by
 * shots.mjs and measure.mjs so both look at the same things.
 */
import { STUDENT_ID } from './common.mjs';

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

export async function clearToday(page) {
  await page.evaluate(({ id, since }) => {
    const db = window.__fx.db;
    db.attendance_events = db.attendance_events.filter((e) => !(e.user_id === id && Date.parse(e.event_time) >= since));
    window.__fx.save();
  }, { id: STUDENT_ID, since: TODAY_START });
}

