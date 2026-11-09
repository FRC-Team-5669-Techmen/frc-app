// Repeatable baseline measurement against an archived pre-job checkout.
// git archive 77cc698 | tar -x -C work/ops-before
// ln -s "$PWD/node_modules" work/ops-before/node_modules
// node tools/e2e/ops-before.mjs --checkout work/ops-before
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { measureLayout, layoutChecks } from './layout.mjs'
const idx = process.argv.indexOf('--checkout')
if (idx < 0) throw new Error('Pass --checkout with an archived 77cc698 checkout')
const root = path.resolve(process.argv[idx + 1])
const { startFixtureServer, launchBrowser, viewportFor, newContext } = await import(pathToFileURL(path.join(root, 'tools/e2e/lib.mjs')))
const out = path.resolve('work/ops-before-views'); mkdirSync(out, { recursive: true })
const server = await startFixtureServer({ port: 5424 }), browser = await launchBrowser(), results = []
try {
 for (const width of [375, 1152, 1440]) for (const theme of ['dark', 'light']) {
  const { context } = await newContext(browser, viewportFor(String(width)))
  await context.clock.install({ time: new Date('2026-10-01T23:00:00Z') }); await context.clock.setFixedTime(new Date('2026-10-01T23:00:00Z'))
  await context.addInitScript(value => localStorage.setItem('techmen:theme', value), theme)
  const page = await context.newPage()
  const views = [
   ['parent-export', '/trips/e0b00000-0000-4000-8000-000000000001/manage', '[data-testid="ehm-page"]', async () => { await page.locator('.eh-tabs button', { hasText: /^Exports$/ }).click(); await page.waitForSelector('[data-testid="ehm-service-hours"]') }],
   ['checkin', '/checkin', '.checkin-wrap', async () => { await page.waitForSelector('button:has-text("Confirm check-in")') }],
   ['scout-tally', '/scouting/16000000-0000-4000-8000-000000000001', '.sc-tabs', async () => { await page.locator('summary', { hasText: /^Manage event$/ }).click(); await page.waitForSelector('.sc-manage[open]') }],
   ['role-board', '/roles/16000000-0000-4000-8000-000000000001', '[data-page="role-board"]', async () => {}],
   ['updates', '/updates', '.upd-card', async () => {}],
  ]
  for (const [view, route, ready, prepare] of views) {
   await page.goto(`${server.origin}${route}${route.includes('?') ? '&' : '?'}__fx=persona:${view === 'checkin' ? 'student2' : 'admin'},mig:all,reset`)
   await page.waitForSelector(ready); await prepare(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500)
   const m = await measureLayout(page)
   const evidence = await page.evaluate(() => ({ parentNamedReport: document.querySelectorAll('[data-parent-report]').length, tally: document.querySelectorAll('[data-scout-tally]').length, suggestions: document.querySelectorAll('[data-rotation-suggestions]').length, newest: document.querySelector('.upd-date')?.getAttribute('datetime'), legacy: document.querySelector('[data-testid="ehm-service-hours"]')?.textContent }))
   const checks = layoutChecks(m)
   results.push({ requestedWidth: width, theme, view, ...m, evidence, checks })
   if (!Object.values(checks).every(Boolean)) throw new Error(`Baseline layout failed ${view} ${width} ${theme}: ${JSON.stringify(m)}`)
   await page.screenshot({ path: path.join(out, `${view}-${width}-${theme}.png`), fullPage: true })
  }
  await context.close()
 }
 writeFileSync(path.join(out, 'measurements.json'), JSON.stringify(results, null, 2))
 console.log(`ops baseline: ${results.length}/${results.length} populated views; all zero document overflow`)
} finally { await browser.close(); await server.stop() }
