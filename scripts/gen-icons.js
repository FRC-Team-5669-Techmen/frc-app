// Generates the PWA icons, the Apple touch icon and the favicon FROM THE
// CANONICAL TEAM MARK.
//
// What this script used to do: write flat #005bff squares. The icons actually
// on disk are mark artwork in Techmen Gold and were never produced by it, so
// running it destroyed three correct files and replaced them with solid blue.
// That is why it is rewritten rather than left runnable.
//
// It renders public/assets/logos/Mark-Gold.svg, which is byte-pinned in
// src/lib/design-system/assets/PROVENANCE.json, and REFUSES TO RUN if that file
// does not hash to the recorded canonical value. An icon generator that will
// happily rasterise a recolored mark is how a wrong gold reaches every home
// screen on the team at once.
//
// Usage:
//   node scripts/gen-icons.js              write into public/
//   node scripts/gen-icons.js --out tmp/   write elsewhere, to compare first
//   node scripts/gen-icons.js --check      verify the mark and report, write nothing
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..')

const argv = process.argv.slice(2)
const CHECK_ONLY = argv.includes('--check')
const outFlag = argv.find((a) => a.startsWith('--out'))
const OUT = outFlag
  ? path.resolve(REPO, outFlag.includes('=') ? outFlag.split('=')[1] : argv[argv.indexOf(outFlag) + 1])
  : path.join(REPO, 'public')

const MARK = path.join(REPO, 'public/assets/logos/Mark-Gold.svg')
const PROVENANCE = path.join(REPO, 'src/lib/design-system/assets/PROVENANCE.json')

// Jet Black, the published brand ground. It is what the icons already on disk
// use, and nothing in the system is permitted to go darker than it.
const BG = '#000000'

/** Refuse to rasterise anything but the verified mark. */
function verifyMark() {
  const svg = fs.readFileSync(MARK)
  const sum = crypto.createHash('sha256').update(svg).digest('hex')
  const prov = JSON.parse(fs.readFileSync(PROVENANCE, 'utf8'))
  const entry = (prov.assets || []).find((a) => (a.mirrors || []).some((m) => m.endsWith('public/assets/logos/Mark-Gold.svg')))
  if (!entry) throw new Error('gen-icons: Mark-Gold.svg is not recorded in PROVENANCE.json — refusing to generate from an unverified mark')
  if (sum !== entry.sha256) {
    throw new Error(
      `gen-icons: ${path.relative(REPO, MARK)} hashes ${sum.slice(0, 16)}… but provenance records ${entry.sha256.slice(0, 16)}…\n` +
      '  The mark on disk is not the canonical file. Refusing to generate icons from it:\n' +
      '  a recolored mark rasterised here reaches every home screen on the team at once.',
    )
  }
  return { svg: svg.toString('utf8'), sum, source: entry.source }
}

// `scale` is the fraction of the canvas the <img> box takes. The MARK inside it
// is narrower, because the SVG carries its own margin, so these values were set
// by measuring the ink bounding box of the icons already on disk and matching
// it: 52% of the canvas for the standard icons, 39% for maskable, 50% for the
// favicon. Changing a number here changes how the mark sits on a home screen,
// so measure again rather than guessing.
const SIZES = [
  { file: 'pwa-192x192.png', size: 192, scale: 0.775 },
  { file: 'pwa-512x512.png', size: 512, scale: 0.775 },
  // Maskable art is cropped to a circle by the platform, so the mark sits well
  // inside the safe zone on the same ground.
  { file: 'pwa-512x512-maskable.png', size: 512, scale: 0.577 },
  { file: 'apple-touch-icon.png', size: 180, scale: 0.775 },
  { file: 'favicon.png', size: 32, scale: 0.734 },
]

async function main() {
  const { svg, sum, source } = verifyMark()
  console.log(`gen-icons: mark verified ${sum.slice(0, 16)}… (${source})`)
  if (CHECK_ONLY) {
    console.log('gen-icons: --check, nothing written')
    return
  }

  let chromium
  try {
    ({ chromium } = await import('playwright-core'))
  } catch {
    throw new Error('gen-icons: playwright-core is required to rasterise the mark. npm i -D playwright-core')
  }

  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  fs.mkdirSync(OUT, { recursive: true })

  for (const { file, size, scale } of SIZES) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
    await page.setContent(
      `<!doctype html><html><body style="margin:0">
         <div style="width:${size}px;height:${size}px;background:${BG};display:flex;align-items:center;justify-content:center">
           <img src="${dataUri}" style="width:${Math.round(size * scale)}px;height:${Math.round(size * scale)}px" />
         </div>
       </body></html>`,
      { waitUntil: 'load' },
    )
    await page.screenshot({ path: path.join(OUT, file), omitBackground: false })
    await page.close()
    console.log(`  ${file}  ${size}x${size}  mark at ${Math.round(scale * 100)}%`)
  }

  await browser.close()
  console.log(`gen-icons: written to ${path.relative(REPO, OUT) || '.'}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
