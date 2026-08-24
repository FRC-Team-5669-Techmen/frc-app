#!/usr/bin/env node
// FRC5669DesignSystem — verify the sheet cards in a real browser before upload.
//
// `node scripts/design-system/ds-sheet-verify.mjs`
//
// The /design-sync skill grades cards by rendering them; that skill is not
// available in every session, and uploading 26 cards nobody has looked at is
// exactly how an empty box ships. So this serves `ds-bundle/` over HTTP and
// loads every card page in headless Chromium the way the platform will, then
// MEASURES rather than asserts: it reports what each card actually painted.
//
// The bundle it renders against is built from HEAD (see ds-sheet-bundle.mjs) and
// is NOT the bundle on the project. That difference is deliberate and stated:
// the sheet patterns' public API is identical either way, so a card that renders
// here renders there.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '../..')
const OUT = path.join(REPO, 'ds-bundle')
const MANIFEST = JSON.parse(fs.readFileSync(path.join(REPO, 'src/lib/design-system/_ds_manifest.json'), 'utf8'))
const SHEETS = MANIFEST.components.filter((c) => c.group === 'sheets').map((c) => c.name)

const TYPES = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html' }
const server = http.createServer((req, res) => {
  const file = path.join(OUT, decodeURIComponent(req.url.split('?')[0]))
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
  fs.createReadStream(file).pipe(res)
})
await new Promise((r) => server.listen(0, r))
const base = `http://127.0.0.1:${server.address().port}`

const EXEC = ['/opt/pw-browsers/chromium/chrome-linux/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome']
  .find((p) => fs.existsSync(p))
const browser = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] })

const rows = []
for (const name of SHEETS) {
  const page = await browser.newPage({ viewport: { width: 1010, height: 800 } })
  const errors = []
  // The system's one documented external host. Fulfil it locally so a proxied
  // font fetch cannot masquerade as a card defect.
  for (const host of ['https://fonts.googleapis.com/**', 'https://fonts.gstatic.com/**']) {
    await page.route(host, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  }
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`${base}/components/sheets/${name}/${name}.html`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.frc-sheet', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(150)
  const m = await page.evaluate(() => {
    const sheet = document.querySelector('.frc-sheet')
    const stage = document.querySelector('.frc-stage')
    const box = sheet?.getBoundingClientRect()
    const cs = sheet ? getComputedStyle(sheet) : null
    return {
      sheet: Boolean(sheet),
      kind: sheet ? [...sheet.classList].find((c) => c.startsWith('frc-sheet-')) ?? null : null,
      display: cs?.display ?? null,
      stage: stage ? `${stage.offsetWidth}x${stage.offsetHeight}` : null,
      painted: box ? `${Math.round(box.width)}x${Math.round(box.height)}` : null,
      bg0: cs?.getPropertyValue('--bg0').trim() || null,
      fg: cs?.color ?? null,
      chars: sheet ? sheet.innerText.replace(/\s+/g, ' ').trim().length : 0,
      footer: Boolean(document.querySelector('.frc-footer')),
      faults: document.querySelectorAll('[data-frc-fault]').length,
      warn: (document.body.innerText.match(/⚠[^\n]*/) || [null])[0],
    }
  })
  await page.close()
  // HubSheet is the one pattern with no footer rail — the deck's rail is what
  // carries 5669 there, and that exemption is in the spec, not a miss.
  const wantFooter = name !== 'HubSheet'
  const ok = m.sheet && m.display !== 'none' && m.chars > 40 && m.faults === 0 && !m.warn
    && errors.length === 0 && m.footer === wantFooter && m.stage === '1920x1440'
  rows.push({ name, ok, ...m, errors: errors.slice(0, 2) })
}

await browser.close()
server.close()

const pad = (s, n) => String(s).padEnd(n)
console.log(pad('pattern', 22) + pad('verdict', 9) + pad('kind', 22) + pad('painted', 12) + pad('--bg0', 10) + 'chars')
for (const r of rows) {
  console.log(pad(r.name, 22) + pad(r.ok ? 'PASS' : 'FAIL', 9) + pad(r.kind ?? '-', 22) + pad(r.painted ?? '-', 12) + pad(r.bg0 ?? '-', 10) + r.chars)
  if (!r.ok) {
    if (r.warn) console.log(`    ${r.warn}`)
    for (const e of r.errors) console.log(`    ${e.split('\n')[0]}`)
    if (r.footer !== (r.name !== 'HubSheet')) console.log(`    footer rail: ${r.footer} (expected ${r.name !== 'HubSheet'})`)
    if (r.faults) console.log(`    ${r.faults} guard fault marker(s)`)
  }
}
const bad = rows.filter((r) => !r.ok)
console.log(`\n${rows.length - bad.length}/${rows.length} sheet cards render clean`)
process.exit(bad.length ? 1 : 0)
