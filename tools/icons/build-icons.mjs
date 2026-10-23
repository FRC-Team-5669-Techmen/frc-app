#!/usr/bin/env node
/**
 * The Techmen site icon set, built from the team mark (feedback c6771432,
 * "proper site icons, the same kind of way the idea app does it", ledger
 * 0016). Committed so the set can be rebuilt, never hand-edited:
 *
 *   node tools/icons/build-icons.mjs           # write every file into public/
 *   node tools/icons/build-icons.mjs --check   # rebuild in memory, compare, exit 1 on drift
 *
 * The shape follows pina-hash/idea-app (src/app.html and
 * static/manifest.webmanifest, read 2026-10-22): favicon.ico at 32, an SVG
 * favicon, a 180 apple-touch icon, 192 and 512 "any" icons and a 512
 * "maskable" one in the manifest. In the Tactical HUD theme: the gold mark
 * (public/assets/logos/Mark-Gold.svg, the one source) on the near-black plate
 * (--bg #0A0B0D), with gold-dim targeting brackets on every size large
 * enough to read them (180 and up). The maskable icon keeps the mark inside
 * the central 80 percent safe circle. Pixels come from Chromium (the
 * container's Playwright build, tools/browser-verify/browser.mjs), so every
 * PNG is the SVG rasterised, not a resample of a smaller PNG.
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch } from '../browser-verify/browser.mjs'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUB = path.join(REPO, 'public')
const CHECK = process.argv.includes('--check')

const BG = '#0A0B0D'      // src/theme.css --bg
const GOLD = '#FFE629'    // --gold
const GOLD_DIM = '#C7B320' // --gold-dim

// The mark's path, read from the one source file, and only if that file is
// the canonical one recorded in the design system's PROVENANCE.json (the
// check scripts/gen-icons.js has always made: a recolored mark rasterised
// here would reach every home screen on the team at once).
const markBytes = readFileSync(path.join(PUB, 'assets', 'logos', 'Mark-Gold.svg'))
{
  const prov = JSON.parse(readFileSync(path.join(REPO, 'src/lib/design-system/assets/PROVENANCE.json'), 'utf8'))
  const entry = (prov.assets || []).find((a) => (a.mirrors || []).some((m) => m.endsWith('public/assets/logos/Mark-Gold.svg')))
  const sum = createHash('sha256').update(markBytes).digest('hex')
  if (!entry || entry.sha256 !== sum) {
    console.error(`icons: public/assets/logos/Mark-Gold.svg (${sum.slice(0, 16)}) is not the canonical mark in PROVENANCE.json; refusing to build`)
    process.exit(1)
  }
}
const markSvg = markBytes.toString('utf8')
const D = /<path d="([^"]+)"/.exec(markSvg)[1]
// The mark's own box inside its 287.139 viewBox (measured from the path).
const MARK = { x: 47.85, y: 84.2, w: 191.43, h: 118.8 }

/**
 * One icon as SVG. size: output pixels. mark: share of the width the mark
 * spans. radius: plate corner as a share of size (0 = full bleed). brackets:
 * draw the HUD corners.
 */
export function iconSvg({ size = 512, mark = 0.74, radius = 0.22, brackets = true, plate = true }) {
  const s = size
  const scale = (s * mark) / MARK.w
  const tx = (s - MARK.w * scale) / 2 - MARK.x * scale
  // Optically centred: the mark is top-heavy, so it sits a touch low.
  const ty = (s - MARK.h * scale) / 2 - MARK.y * scale + s * 0.02
  const r = s * radius
  const parts = []
  if (plate) parts.push(`<rect width="${s}" height="${s}" rx="${r.toFixed(2)}" fill="${BG}"/>`)
  if (brackets) {
    const inset = s * 0.13
    const arm = s * 0.12
    const w = Math.max(2, s * 0.022)
    const c = (x, y, dx, dy) => `<path d="M${x} ${y + dy * arm}V${y}H${x + dx * arm}" fill="none" stroke="${GOLD_DIM}" stroke-width="${w.toFixed(2)}" stroke-linecap="square"/>`
    parts.push(c(inset, inset, 1, 1), c(s - inset, inset, -1, 1), c(inset, s - inset, 1, -1), c(s - inset, s - inset, -1, -1))
  }
  parts.push(`<path d="${D}" fill="${GOLD}" transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(5)})"/>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${parts.join('')}</svg>\n`
}

// What ships. The favicon is small: no brackets, the mark nearly edge to edge.
export const ICONS = [
  { file: 'favicon.svg', svg: { size: 64, mark: 0.9, radius: 0.18, brackets: false } },
  { file: 'favicon.png', png: 32, svg: { size: 32, mark: 0.92, radius: 0.18, brackets: false } },
  { file: 'apple-touch-icon.png', png: 180, svg: { size: 180, mark: 0.66, radius: 0, brackets: true } },
  { file: 'pwa-192x192.png', png: 192, svg: { size: 192, mark: 0.7, radius: 0.22, brackets: true } },
  { file: 'pwa-512x512.png', png: 512, svg: { size: 512, mark: 0.7, radius: 0.22, brackets: true } },
  // Maskable: full bleed; the mark (0.58 wide, so its corners stay inside the
  // 0.8 safe circle) and the brackets (pulled in) survive any platform mask.
  { file: 'pwa-512x512-maskable.png', png: 512, svg: { size: 512, mark: 0.58, radius: 0, brackets: false } },
]
const ICO_SIZES = [16, 32, 48]

async function rasterise(page, svg, px) {
  await page.setViewportSize({ width: px, height: px })
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`)
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } })
}

// An ICO holding PNG images (Windows Vista and later, every current browser).
export function icoFrom(pngs) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4)
  const dir = Buffer.alloc(16 * pngs.length)
  let offset = 6 + dir.length
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1)
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3)
    dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6)
    dir.writeUInt32LE(data.length, o + 8); dir.writeUInt32LE(offset, o + 12)
    offset += data.length
  })
  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)])
}

async function build() {
  const { browser } = await launch()
  const page = await browser.newPage({ deviceScaleFactor: 1 })
  const out = new Map()
  for (const icon of ICONS) {
    const svg = iconSvg(icon.svg)
    out.set(icon.file, icon.png ? await rasterise(page, svg, icon.png) : Buffer.from(svg))
  }
  const ico = []
  for (const size of ICO_SIZES) ico.push({ size, data: await rasterise(page, iconSvg({ size, mark: 0.92, radius: 0.18, brackets: false }), size) })
  out.set('favicon.ico', icoFrom(ico))
  await browser.close()
  return out
}

const files = await build()
if (CHECK) {
  // SVGs must match byte for byte; PNGs are compared by size only (a
  // Chromium update may move a pixel of anti-aliasing).
  let drift = 0
  for (const [file, data] of files) {
    let have
    try { have = readFileSync(path.join(PUB, file)) } catch { have = null }
    const same = file.endsWith('.svg') ? have?.equals(data) : !!have && Math.abs(have.length - data.length) / data.length < 0.25
    if (!same) { drift += 1; console.log(`DRIFT ${file}`) }
  }
  console.log(`icons: ${files.size - drift}/${files.size} match`)
  process.exit(drift ? 1 : 0)
}
for (const [file, data] of files) writeFileSync(path.join(PUB, file), data)
console.log(`icons: wrote ${files.size} files into public/ (${[...files.keys()].join(', ')})`)
