#!/usr/bin/env node
// FRC5669DesignSystem — visual capture. `npm run ds:capture`.
//
// Renders EVERY sheet pattern across all three grounds and both audience modes
// to PNG on disk, headless, at the real 1920 x 1440.
//
// This exists because DOM measurement is not visual verification. A computed
// style confirms that an alias resolved; it never confirms that a sheet reads
// well, that two elements are not colliding, or that a layout is worth
// projecting. Pre-delivery audit check 41 - "someone looked at it" - cannot be
// satisfied without images, and until this script existed nothing in this
// system had been seen.
//
// It boots its own dev server on a private port, drives the capture route
// (/_ds?capture=<Pattern>&ground=<g>&audience=<a>), and writes
// artifacts/ds-capture/<ground>/<audience>/NN-Pattern.png.
//
// Flags
//   --reduced-motion   emulate prefers-reduced-motion: reduce, and write to
//                      artifacts/ds-capture-reduced-motion/. Verifying reduced
//                      motion by SETTING the preference and looking at the
//                      result is the point: gate coverage proves the rule was
//                      applied, not that the output is legible.
//   --ground=<g>       one ground only
//   --audience=<a>     one audience only
//   --only=<A,B>       one or more patterns only
//   --ambient          stack the ground's ambient layer behind each sheet
//   --port=<n>         dev server port (default 5188)
//
// Chrome comes from the machine (playwright-core drives the installed browser),
// so nothing is downloaded.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const value = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

const REDUCED = flag('reduced-motion')
const AMBIENT = flag('ambient')
const PORT = Number(value('port', '5188'))
const OUT = path.join(REPO, 'artifacts', REDUCED ? 'ds-capture-reduced-motion' : 'ds-capture')

const GROUNDS = value('ground') ? [value('ground')] : ['squadron', 'field', 'paper']
const AUDIENCES = value('audience') ? [value('audience')] : ['internal', 'external']

/** The pattern list comes from the bundle, so this can never drift from it. */
async function readPatterns() {
  const src = fs.readFileSync(path.join(REPO, 'src/lib/design-system/components/sheets/SheetsDemoCard.jsx'), 'utf8')
  const block = src.slice(src.indexOf('export const SHEET_PATTERNS'))
  const names = [...block.matchAll(/'(\w+Sheet)'/g)].map((m) => m[1])
  if (!names.length) throw new Error('ds-capture: could not read SHEET_PATTERNS from SheetsDemoCard.jsx')
  return names
}

function startServer() {
  return new Promise((resolve, reject) => {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(npm, ['run', 'ds:dev', '--', '--port', String(PORT), '--strictPort'], {
      cwd: REPO,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let settled = false
    const done = (fn, arg) => { if (!settled) { settled = true; fn(arg) } }
    const onData = (buf) => {
      const line = String(buf)
      if (/ready in|Local:/i.test(line)) done(resolve, child)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => done(reject, new Error(`dev server exited with ${code}`)))
    setTimeout(() => done(reject, new Error('dev server did not start within 60s')), 60000)
  })
}

/**
 * Kill the dev server AND its children. `npm run` spawns a shell which spawns
 * node/vite, so killing the shell alone leaves vite holding the port — which is
 * exactly what happened the first time this script was run twice in a row.
 */
function stopServer(child) {
  if (!child || child.killed) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' })
      return
    } catch {
      // fall through to the portable kill
    }
  }
  child.kill('SIGTERM')
}

async function waitForRoute(page, url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 })
      if (res && res.ok()) return true
    } catch {
      // server still coming up
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

const run = async () => {
  const patterns = (value('only') ? value('only').split(',') : await readPatterns()).map((s) => s.trim())
  console.log(`ds-capture: ${patterns.length} patterns x ${GROUNDS.length} grounds x ${AUDIENCES.length} audiences = ${patterns.length * GROUNDS.length * AUDIENCES.length} images`)
  if (REDUCED) console.log('ds-capture: emulating prefers-reduced-motion: reduce')

  const server = await startServer()
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1440 },
    deviceScaleFactor: 1,
    reducedMotion: REDUCED ? 'reduce' : 'no-preference',
  })
  const page = await context.newPage()

  const base = `http://localhost:${PORT}/_ds`
  const first = `${base}?capture=${patterns[0]}&ground=squadron&audience=internal`
  if (!(await waitForRoute(page, first))) throw new Error('ds-capture: /_ds never became reachable')

  const report = { images: 0, faults: [], errors: [], reducedMotion: REDUCED }
  page.on('pageerror', (e) => report.errors.push(String(e.message)))

  for (const ground of GROUNDS) {
    for (const audience of AUDIENCES) {
      const dir = path.join(OUT, ground, audience)
      fs.mkdirSync(dir, { recursive: true })
      for (const [i, pattern] of patterns.entries()) {
        const url = `${base}?capture=${pattern}&ground=${ground}&audience=${audience}${AMBIENT ? '&ambient=on' : ''}`
        await page.goto(url, { waitUntil: 'networkidle' })
        await page.waitForSelector('.frc-sheet', { timeout: 10000 })
        // Fonts settle before the shot, or the type in the PNG is the fallback.
        await page.evaluate(async () => { await document.fonts.ready; return true })
        // Settle motion. The first capture run shot several sheets MID-TRANSITION
        // — a banner wipe still crossing the frame — which is a picture of the
        // transition, not of the sheet. Finite animations are finished, infinite
        // ambient loops are paused at their first frame, so what lands on disk is
        // the end state the system promises is the base state, and a normal run
        // is comparable with a reduced-motion one.
        await page.evaluate(() => {
          for (const a of document.getAnimations()) {
            const iterations = a.effect && a.effect.getTiming ? a.effect.getTiming().iterations : 1
            if (iterations === Infinity) { a.currentTime = 0; a.pause() } else { try { a.finish() } catch { /* already done */ } }
          }
        })
        const stage = await page.$('.frc-stage')
        const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${pattern}.png`)
        await stage.screenshot({ path: file })
        report.images++
        const faults = await page.$$eval('[data-frc-fault]', (els) => els.map((el) => el.getAttribute('data-frc-fault')))
        if (faults.length) report.faults.push({ pattern, ground, audience, faults })
      }
      console.log(`  ${ground}/${audience}: ${patterns.length} images -> ${path.relative(REPO, dir)}`)
    }
  }

  await browser.close()
  stopServer(server)

  fs.writeFileSync(path.join(OUT, 'capture-report.json'), JSON.stringify({ ...report, patterns, grounds: GROUNDS, audiences: AUDIENCES, generated: 'see git log' }, null, 2))
  console.log(`\nds-capture: ${report.images} images in ${path.relative(REPO, OUT)}`)
  console.log(`ds-capture: ${report.faults.length} sheet(s) carrying a guard fault marker, ${report.errors.length} page error(s)`)
  if (report.faults.length) {
    for (const f of report.faults) console.log(`  FAULT ${f.pattern} ${f.ground}/${f.audience}: ${f.faults.join(', ')}`)
    process.exitCode = 1
  }
  if (report.errors.length) {
    for (const e of report.errors.slice(0, 5)) console.log(`  ERROR ${e}`)
    process.exitCode = 1
  }
}

run().catch((err) => {
  console.error('ds-capture failed:', err.message)
  process.exit(1)
})

process.on('exit', () => { /* stopServer already ran; this is the backstop */ })
