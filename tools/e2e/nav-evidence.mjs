#!/usr/bin/env node
// Reproducible before/after role audit. No real accounts or external requests.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { REPO, flag, ensureDir, startFixtureServer, launchBrowser, newContext, viewportFor, waitForFixture, watchConsole } from './lib.mjs'
import { CLOCK_START } from './features/_util.mjs'
const sourceFiles = ['src/NavBar.jsx', 'src/NavBar.css', 'src/CommandPalette.jsx', 'src/CommandPalette.css', 'src/navigation.js', 'src/featureGuide.js', 'src/App.jsx']
const sourceHashes = Object.fromEntries(sourceFiles.filter(file => existsSync(path.join(REPO, file))).map(file => [file, createHash('sha256').update(readFileSync(path.join(REPO, file))).digest('hex')]))
const args = process.argv.slice(2)
const baseline = !!flag(args, 'baseline', false)
const out = ensureDir(path.resolve(REPO, String(flag(args, 'out', 'artifacts/nav-evidence'))))
const roles = ['member', 'scout-lead', 'driver', 'mentor', 'admin', 'parent', 'staff-lead', 'approver', 'parent-staff']
const server = await startFixtureServer({ port: Number(flag(args, 'port', 5440)) })
const browser = await launchBrowser()
const results = []
try {
  for (const role of roles) for (const theme of ['dark', 'light']) {
    await Promise.all([375, 1152, 1440].map(async width => {
      const { context } = await newContext(browser, viewportFor(width))
      await context.clock.setFixedTime(CLOCK_START)
      await context.addInitScript(t => localStorage.setItem('techmen:theme', t), theme)
      const page = await context.newPage()
      const errors = watchConsole(page)
      const persona = role === 'parent' ? 'parent' : role === 'admin' ? 'admin' : ['mentor', 'staff-lead', 'parent-staff'].includes(role) ? 'mentor' : role === 'approver' ? 'student2' : 'student'
      await page.goto(`${server.origin}/_fixture?__fx=persona:${persona},mig:all,reset`)
      await waitForFixture(page)
      await page.evaluate(role => {
        const fx = window.__fx, id = fx.personas[localStorage.getItem('__fx_persona')].id
        if (role === 'scout-lead') fx.insert('member_permissions', { member_id: id, capability: 'scouting.manage', granted_by: fx.personas.admin.id })
        if (role === 'driver') fx.patch('event_roles', { member_id: id }, { role: 'driver' })
        if (role === 'staff-lead') fx.patch('member_roles', { member_id: id, role: 'mentor' }, { role: 'lead' })
        if (role === 'parent-staff') fx.insert('member_roles', { member_id: id, role: 'parent' })
      }, role)
      await page.goto(`${server.origin}/dashboard`)
      await page.waitForSelector('.nav-avatar-btn')
      await page.waitForTimeout(700)
      if (await page.locator('.driver-popover').count()) await page.keyboard.press('Escape')
      const top = await page.locator('.navbar-links > a, .navbar-links .nav-dropdown > button').allTextContents()
      await page.locator('.nav-avatar-btn').click()
      const menu = page.locator('.nav-avatar-menu')
      const flat = await menu.locator('.nav-dropdown-item').allTextContents()
      const entries = baseline ? await menu.locator('.nav-dropdown-item').count() : await menu.locator(':scope > .nav-dropdown-item, :scope > details > summary').count()
      const controls = await menu.locator('a, button, summary').evaluateAll(els => els.filter(el => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })).length)
      const states = []
      const inventory = { hours: [], robot: [], manage: [], palette: [] }
      const capture = async state => {
        const boxes = await page.locator('.navbar, .nav-avatar-menu, .command-palette[open]').evaluateAll(els => els.filter(e => e.getClientRects().length).map(e => {
          const r = e.getBoundingClientRect(); return { selector: e.className, x: r.x, y: r.y, width: r.width, right: r.right, bottom: r.bottom }
        }))
        const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth))
        const ok = overflow === 0 && boxes.every(b => b.x >= 0 && b.right <= width + 1 && b.y >= 0 && b.bottom <= (width === 375 ? 812 : 900) + 1)
        states.push({ state, boxes, overflow, ok })
        await page.screenshot({ path: path.join(out, `${role}-${width}-${theme}-${state}.png`) })
      }
      await capture('account')
      if (!baseline) {
        await menu.locator('summary').filter({ hasText: 'My record' }).click()
        await menu.locator('summary').filter({ hasText: 'Preferences' }).click()
        await capture('groups')
        await page.keyboard.press('Escape')
        await page.locator('.nav-search-btn').click()
        await page.waitForSelector('.command-palette[open]')
        await capture('palette')
        inventory.palette = await page.locator('[data-command]').evaluateAll(els => els.map(e => e.dataset.command))
        await page.keyboard.press('Escape')
        const hours = page.locator('.navbar-links .nav-dropdown-trigger')
        if (await hours.count()) {
          await hours.click()
          inventory.hours = await page.locator('.navbar-links .nav-dropdown-menu a').evaluateAll(els => els.map(e => ({ path: e.getAttribute('href'), label: e.textContent.trim() })))
          await capture('hours')
          await page.keyboard.press('Escape')
        }
        if (role !== 'parent') {
          await page.goto(`${server.origin}/robot`)
          await page.waitForSelector('.hub-tile')
          inventory.robot = await page.locator('.hub-tile').evaluateAll(els => els.map(e => e.getAttribute('href')))
        }
        if (['mentor', 'admin', 'staff-lead', 'parent-staff'].includes(role)) {
          await page.goto(`${server.origin}/manage`)
          await page.waitForSelector('.hub-tile')
          inventory.manage = await page.locator('.hub-tile').evaluateAll(els => els.map(e => e.getAttribute('href')))
        }
      }
      const collapsedCount = controls === (baseline ? entries + 3 : entries)
      const ok = collapsedCount && top.length === (role === 'parent' ? 3 : 5) && (baseline || entries <= 6) && states.every(s => s.ok) && errors.length === 0
      results.push({ role, theme, width, top, flat, entries, visibleControls: controls, states, inventory, errors, ok })
      await context.close()
    }))
    console.log(`${role} ${theme}: ${results.slice(-3).filter(r => r.ok).length}/3`)
  }
} finally { await browser.close(); await server.stop() }
writeFileSync(path.join(out, 'nav.json'), JSON.stringify({ baseline, sourceHashes, results }, null, 2))
console.log(`navigation evidence: ${results.filter(r => r.ok).length}/${results.length} configurations`)
if (results.some(r => !r.ok)) process.exitCode = 1
