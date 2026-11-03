#!/usr/bin/env node
/**
 * Measure navigation and content bounds at 375, 1152 and 1440, in both themes, on fixture
 * mode (feedback 9b01037c, "the app is getting busy", ledger 0016):
 *
 *   node tools/e2e/nav-audit.mjs [--port 5436] [--out artifacts/nav-audit]
 *
 * For each persona and width it prints, and writes to <out>/nav.json: the top
 * bar links, the account menu items in order (with the section headings), how
 * many taps reach each page from the dashboard (1: a top link, 2: a menu
 * item), and a screenshot of the dashboard with the account menu open. It is
 * the BEFORE measurement decision 49 rests on, and is rerun as the AFTER once
 * the nav changes. It reads only; it writes nothing to the store.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { REPO, viewportFor, flag, startFixtureServer, launchBrowser, newContext, ensureDir, waitForFixture } from './lib.mjs'
import { LAYOUT_WIDTHS, measureLayout, layoutChecks } from './layout.mjs'

const args = process.argv.slice(2)
const port = Number(flag(args, 'port', 5436))
const out = ensureDir(path.resolve(REPO, String(flag(args, 'out', 'artifacts/nav-audit'))))
const PERSONAS = ['student', 'mentor', 'admin', 'parent']
const WIDTHS = LAYOUT_WIDTHS
const THEMES = ['dark', 'light']

const server = await startFixtureServer({ port })
const browser = await launchBrowser()
const results = []
try {
  for (const theme of THEMES) for (const persona of PERSONAS) {
    for (const width of WIDTHS) {
      const { context: ctx } = await newContext(browser, viewportFor(width))
      await ctx.addInitScript(t => localStorage.setItem('techmen:theme', t), theme)
      const page = await ctx.newPage()
      const geometry = []
      const measure = async state => {
        const m = await measureLayout(page)
        const checks = layoutChecks(m)
        const menus = await page.locator('.nav-dropdown-menu:visible').evaluateAll(els => els.map(el => {
          const r = el.getBoundingClientRect()
          return { left: r.left, right: r.right, width: r.width }
        }))
        const menuBounds = menus.every(r => r.left >= 0 && r.right <= width && r.width > 100)
        geometry.push({ state, ...m, checks: { ...checks, menuBounds } })
      }
      await page.goto(`${server.origin}/dashboard?__fx=persona:${persona},mig:all,reset`)
      await waitForFixture(page)
      await page.waitForSelector('.navbar-links, [data-tour="nav-profile"]', { timeout: 20_000 })
      await page.waitForTimeout(600)
      if (await page.locator('.driver-popover').count()) { await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
      const top = await page.$$eval('.navbar-links > a, .navbar-links .nav-dropdown > button', (els) => els.map((e) => e.textContent.trim()))
      await measure('dashboard')
      // Dropdowns in the top bar (Hours): their items are 2 taps away.
      const dropdowns = []
      for (const b of await page.$$('.navbar-links .nav-dropdown > button')) {
        await b.click(); await page.waitForTimeout(150)
        dropdowns.push(...await page.$$eval('.navbar-links .nav-dropdown-menu .nav-dropdown-item', (els) => els.map((e) => e.textContent.trim())))
        await measure('hours menu')
        await b.click(); await page.waitForTimeout(100)
      }
      await page.click('[data-tour="nav-profile"]')
      await page.waitForSelector('.nav-avatar-menu')
      const menu = await page.$$eval('.nav-avatar-menu .nav-dropdown-item, .nav-avatar-menu .nav-dropdown-divider', (els) => els.map((e) => ({ kind: e.classList.contains('nav-dropdown-item') ? 'item' : 'divider', text: e.textContent.trim() })))
      await measure('account menu')
      const shot = path.join(out, `nav-${persona}-${width}-${theme}.png`)
      await page.screenshot({ path: shot, fullPage: width === 375 })
      const items = menu.filter((m) => m.kind === 'item').length
      // AFTER (ledger 0017): staff tools live on /manage behind one menu item.
      let manage = null
      if (await page.locator('.nav-avatar-menu a[href="/manage"]').count()) {
        await page.click('.nav-avatar-menu a[href="/manage"]')
        await page.waitForSelector('.hub-tile', { timeout: 20_000 })
        await page.waitForTimeout(500)
        manage = await page.$$eval('.hub-tile', (els) => els.map((e) => ({ path: e.getAttribute('data-tile'), waiting: e.querySelector('.hub-tile-badge')?.textContent.trim() ?? null })))
        await measure('team admin')
        await page.screenshot({ path: path.join(out, `manage-${persona}-${width}-${theme}.png`), fullPage: width === 375 })
      }
      // The Robot hub, for members.
      let robot = null
      if (await page.locator('.navbar-links a[href="/robot"]').count()) {
        await page.goto(`${server.origin}/robot`)
        await page.waitForSelector('.hub-tile', { timeout: 20_000 })
        await page.waitForTimeout(400)
        robot = await page.$$eval('.hub-tile', (els) => els.map((e) => e.getAttribute('data-tile')))
        await measure('robot')
        await page.screenshot({ path: path.join(out, `robot-${persona}-${width}-${theme}.png`), fullPage: width === 375 })
      }
      const ok = top.length === (persona === 'parent' ? 3 : 5) && items > 0 && geometry.every(g => Object.values(g.checks).every(Boolean))
      results.push({ persona, width, theme, ok, geometry, top, dropdowns, menu, manage, robot, counts: { top: top.length, dropdownItems: dropdowns.length, menuItems: items, manageTiles: manage?.length ?? 0 } })
      console.log(`${ok ? 'PASS' : 'FAIL'} ${theme} ${persona} @${width}: overflow ${Math.max(...geometry.map(g => g.overflow))}px; content ${geometry.map(g => `${g.state}=${g.width}px`).join(', ')}`)
      console.log(`${persona} @${width}: top ${top.length} [${top.join(' | ')}]; hours menu ${dropdowns.length}; account menu ${items} items [${menu.filter((m) => m.kind === 'item').map((m) => m.text).join(' | ')}]${manage ? `; Team admin ${manage.length} tools, ${manage.filter((t) => t.waiting).length} waiting first` : ''}${robot ? `; Robot ${robot.length} tiles` : ''}`)
      await ctx.close()
    }
  }
} finally {
  await browser.close()
  await server.stop()
}
writeFileSync(path.join(out, 'nav.json'), JSON.stringify(results, null, 2))
console.log(`nav audit: ${results.length} views written to ${path.relative(REPO, out)}`)
console.log(`nav geometry: ${results.filter(r => r.ok).length}/${results.length} passed (375, 1152, 1440; dark and light)`)
if (results.some(r => !r.ok)) process.exitCode = 1
