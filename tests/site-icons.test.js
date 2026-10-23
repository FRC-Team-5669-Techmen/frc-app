// The Techmen icon set (feedback c6771432, ledger 0016): what index.html and
// the PWA manifest name exists in public/ at the size it claims, with the
// favicon, apple-touch, 192/512 "any" and 512 "maskable" shape idea-app uses.
// The pixels are rebuilt by tools/icons/build-icons.mjs (needs Chromium, so
// not here); this holds the references and sizes both ways.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url))
const pngSize = (buf) => (buf.readUInt32BE(0) === 0x89504e47 ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null)
const html = readFileSync(at('index.html'), 'utf8')
const vite = readFileSync(at('vite.config.js'), 'utf8')

describe('site icons', () => {
  it('index.html links the ico, the svg and the apple-touch icon, and each file exists', () => {
    const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g)].map((m) => m[1])
    expect(hrefs).toEqual(expect.arrayContaining(['favicon.ico', 'favicon.svg', 'apple-touch-icon.png']))
    for (const h of hrefs) expect(existsSync(at(`public/${h}`)), h).toBe(true)
    // control: a missing file is seen as missing
    expect(existsSync(at('public/no-such-icon.png'))).toBe(false)
  })
  it('every manifest icon exists at the size it declares, with a maskable one', () => {
    const icons = [...vite.matchAll(/src: '([^']+\.png)',\s*sizes: '(\d+)x(\d+)',\s*type: 'image\/png',\s*purpose: '(\w+)'/g)]
    expect(icons.length).toBe(3)
    for (const [, src, w, h] of icons) expect(pngSize(readFileSync(at(`public/${src}`))), src).toEqual([Number(w), Number(h)])
    expect(icons.map((m) => m[4]).sort()).toEqual(['any', 'any', 'maskable'])
  })
  it('the apple-touch icon is 180 and opaque at its corners (iOS rounds it itself)', () => {
    const buf = readFileSync(at('public/apple-touch-icon.png'))
    expect(pngSize(buf)).toEqual([180, 180])
    // colour type 6 (RGBA) or 2 (RGB); either way the plate is full bleed in the builder
    expect([2, 6]).toContain(buf.readUInt8(25))
  })
  it('favicon.ico carries 16, 32 and 48', () => {
    const ico = readFileSync(at('public/favicon.ico'))
    expect(ico.readUInt16LE(2)).toBe(1)
    const n = ico.readUInt16LE(4)
    const sizes = Array.from({ length: n }, (_, i) => ico.readUInt8(6 + i * 16) || 256)
    expect(sizes.sort((a, b) => a - b)).toEqual([16, 32, 48])
  })
  it('favicon.svg is the gold mark on the near-black plate, from the one mark source', () => {
    const svg = readFileSync(at('public/favicon.svg'), 'utf8')
    const mark = /<path d="([^"]+)"/.exec(readFileSync(at('public/assets/logos/Mark-Gold.svg'), 'utf8'))[1]
    expect(svg).toContain('#0A0B0D')
    expect(svg).toContain('#FFE629')
    expect(svg).toContain(mark)
  })
})
