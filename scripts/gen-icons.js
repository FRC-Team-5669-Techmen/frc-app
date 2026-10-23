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
//   node scripts/gen-icons.js              verify the mark, then run tools/icons/build-icons.mjs
//   node scripts/gen-icons.js --check      verify the mark and report, write nothing
//   node tools/icons/build-icons.mjs --check   compare the built set with public/
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

// Since ledger 0016 (feedback c6771432) the icon set is built by ONE
// generator, tools/icons/build-icons.mjs: the HUD plate and brackets, the SVG
// favicon and favicon.ico, with the same canonical-mark check as here. This
// script keeps its name (npm run gen-icons) and its --check, and hands the
// build over, so there is never a second rasteriser to drift from the first.
async function main() {
  const { sum, source } = verifyMark()
  console.log(`gen-icons: mark verified ${sum.slice(0, 16)}… (${source})`)
  if (CHECK_ONLY) {
    console.log('gen-icons: --check, nothing written')
    return
  }
  if (OUT !== path.join(REPO, 'public')) throw new Error('gen-icons: --out is retired; the builder writes public/ (run it with --check to compare)')
  const { spawnSync } = await import('node:child_process')
  const r = spawnSync(process.execPath, [path.join(REPO, 'tools/icons/build-icons.mjs')], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error('gen-icons: tools/icons/build-icons.mjs failed')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
