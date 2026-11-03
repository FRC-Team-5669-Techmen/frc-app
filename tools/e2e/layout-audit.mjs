#!/usr/bin/env node
// Repeatable page-by-page evidence; --baseline records pre-change failures.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { flag, REPO, viewportFor, startFixtureServer, launchBrowser, newContext, ensureDir, waitForFixture, watchConsole } from './lib.mjs'
import { CLOCK_START } from './features/_util.mjs'
import { LAYOUT_WIDTHS, LAYOUT_PAGES, layoutSlug, waitForLayout, prepareLayout, measureLayout, layoutChecks } from './layout.mjs'

const args = process.argv.slice(2)
const out = ensureDir(path.resolve(REPO, String(flag(args, 'out', 'artifacts/desktop-layout'))))
const widths = String(flag(args, 'widths', LAYOUT_WIDTHS.join(','))).split(',')
const themes = String(flag(args, 'themes', 'dark,light')).split(',')
const only = flag(args, 'only', null)
const labels = flag(args, 'labels', null)
const pages = LAYOUT_PAGES.filter(p => (!only || String(only).split(',').includes(p.path)) && (!labels || String(labels).split(',').includes(p.label)))
const server = await startFixtureServer({ port: Number(flag(args, 'port', 5440)) })
const browser = await launchBrowser()
const results = []
try {
  for (const theme of themes) for (const width of widths) {
    const vp = viewportFor(width)
    const { context } = await newContext(browser, vp, { geolocation: { latitude: 34.041550, longitude: -118.086826, accuracy: 10 }, permissions: ['geolocation'] })
    await context.clock.setFixedTime(CLOCK_START)
    await context.addInitScript(t => localStorage.setItem('techmen:theme', t), theme)
    for (const p of pages) {
      const page = await context.newPage()
      const errors = watchConsole(page)
      try {
        const sep = p.url.includes('?') ? '&' : '?'
        await page.goto(`${server.origin}${p.url}${sep}__fx=persona:${p.persona},mig:all,reset`)
        await waitForFixture(page)
        await waitForLayout(page)
        await prepareLayout(page, p)
        const m = await measureLayout(page)
        const checks = layoutChecks(m)
        const png = `${layoutSlug(p)}-${width}-${theme}.png`
        await page.screenshot({ path: path.join(out, png), fullPage: true })
        results.push({ ...p, ...m, route: p.path, finalPath: m.path, checks, png, consoleErrors: errors })
        console.log(`${Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'} ${theme} ${width} ${p.persona} ${p.path}: content ${m.width}px, overflow ${m.overflow}px, escapes ${m.escapes.length}, ${m.chars} chars`)
      } catch (e) {
        results.push({ ...p, theme, viewport: Number(width), error: String(e), checks: { rendered: false } })
        console.log(`FAIL ${theme} ${width} ${p.path}: ${e.message}`)
      } finally { await page.close() }
    }
    await context.close()
  }
} finally { await browser.close(); await server.stop() }
writeFileSync(path.join(out, 'layout.json'), JSON.stringify(results, null, 2))
const passed = results.filter(r => Object.values(r.checks).every(Boolean)).length
console.log(`layout audit: ${passed}/${results.length} page views pass; ${results.reduce((n, r) => n + (r.overflow ?? 0), 0)}px total horizontal overflow`)
if (!flag(args, 'baseline', false) && passed !== results.length) process.exitCode = 1
