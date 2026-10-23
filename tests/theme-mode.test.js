// The light/dark switch (ledger 0019): the resolver in src/themeMode.js and
// its deliberate duplicate, the pre-paint script in index.html. The script is
// RUN here against every choice and both system preferences, so the two
// copies cannot drift. Also holds the light token block to the gold rule.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { resolveTheme, normalizeChoice, readChoice, writeChoice, applyTheme, THEME_KEY, THEME_COLOR } from '../src/themeMode.js'

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const CSS = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8')
const SCRIPT = HTML.match(/<script id="theme-boot">([\s\S]*?)<\/script>/)?.[1]

function memStore(init = {}) {
  const m = new Map(Object.entries(init))
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), map: m }
}

// Run the inline script in a sandbox; return the theme it painted.
function runBoot(stored, prefersLight, { throwing = false, source = SCRIPT } = {}) {
  const attrs = {}
  const meta = { content: '#0A0B0D', setAttribute(k, v) { if (k === 'content') this.content = v } }
  const ctx = {
    localStorage: throwing ? { getItem() { throw new Error('blocked') } } : memStore(stored == null ? {} : { [THEME_KEY]: stored }),
    matchMedia: (q) => ({ matches: q === '(prefers-color-scheme: light)' ? prefersLight : !prefersLight }),
    document: {
      documentElement: { setAttribute: (k, v) => { attrs[k] = v } },
      querySelector: (sel) => (sel === 'meta[name="theme-color"]' ? meta : null),
    },
  }
  vm.runInNewContext(source, ctx)
  return { theme: attrs['data-theme'], meta: meta.content }
}

describe('resolveTheme', () => {
  it('defaults to dark for anything unknown', () => {
    for (const raw of [null, undefined, '', 'blue', 'LIGHT']) expect(resolveTheme(raw, true)).toBe('dark')
  })
  it('honors an explicit choice whatever the system says (positive control)', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
  })
  it('System follows the device both ways', () => {
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
  })
  it('normalizeChoice keeps only the three choices', () => {
    expect(['light', 'dark', 'system', 'x'].map(normalizeChoice)).toEqual(['light', 'dark', 'system', 'dark'])
  })
})

describe('storage survives a blocked localStorage', () => {
  it('reads and writes through a working store', () => {
    const s = memStore()
    expect(writeChoice('light', s)).toBe('light')
    expect(s.map.get(THEME_KEY)).toBe('light')
    expect(readChoice(s)).toBe('light')
  })
  it('a throwing store reads dark and writing does not throw', () => {
    const bad = { getItem() { throw new Error('x') }, setItem() { throw new Error('x') } }
    expect(readChoice(bad)).toBe('dark')
    expect(() => writeChoice('light', bad)).not.toThrow()
  })
})

describe('applyTheme paints <html> and the theme-color meta', () => {
  it('sets data-theme and the chrome color for each theme', () => {
    for (const t of ['light', 'dark']) {
      const meta = { c: null, setAttribute(_, v) { this.c = v } }
      const doc = { documentElement: { dataset: {} }, querySelector: () => meta }
      applyTheme(t, doc)
      expect(doc.documentElement.dataset.theme).toBe(t)
      expect(meta.c).toBe(THEME_COLOR[t])
    }
  })
})

describe('the index.html pre-paint script agrees with resolveTheme', () => {
  it('is present and imports nothing', () => {
    expect(SCRIPT).toBeTruthy()
    expect(SCRIPT).not.toMatch(/\bimport\b|\bsrc=/)
    expect(SCRIPT.length).toBeLessThan(600)
  })
  it('matches the resolver on every choice and both system preferences', () => {
    let lights = 0
    for (const stored of [null, 'light', 'dark', 'system', 'junk']) {
      for (const pl of [true, false]) {
        const got = runBoot(stored, pl)
        const want = resolveTheme(stored, pl)
        expect(got.theme, `${stored}/${pl}`).toBe(want)
        expect(got.meta).toBe(THEME_COLOR[want])
        if (got.theme === 'light') lights++
      }
    }
    // Positive control: light is actually reachable (light x2, system+light x1).
    expect(lights).toBe(3)
  })
  it('falls back to dark when storage throws', () => {
    expect(runBoot(null, true, { throwing: true }).theme).toBe('dark')
  })
  it('a mutated script (always light) is caught by the same comparison', () => {
    const mutant = SCRIPT.replace("var t='dark'", "var t='light'")
    expect(mutant).not.toBe(SCRIPT)
    const disagree = [null, 'dark'].some((s) => runBoot(s, false, { source: mutant }).theme !== resolveTheme(s, false))
    expect(disagree).toBe(true)
  })
})

describe('the light token block keeps gold a fill', () => {
  const light = CSS.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)?.[1] ?? ''
  const val = (block, name) => block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim().toUpperCase()
  it('finds the block (positive control)', () => {
    expect(light).toContain('--bg:')
    expect(val(light, 'bg')).toBe('#FFFFFF')
  })
  it('gold text tokens are ink or steel in light, the fill stays Techmen Gold', () => {
    expect(val(light, 'gold')).toBe('#0A0B0D')
    expect(val(light, 'gold-bright')).toBe('#0A0B0D')
    expect(val(light, 'gold-dim')).not.toBe('#C7B320')
    expect(val(light, 'gold-fill')).toBe('#FFE629')
    expect(val(light, 'on-gold')).toBe('#0A0B0D')
  })
  it('dark still paints gold text (the other direction)', () => {
    const dark = CSS.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(val(dark, 'gold')).toBe('#FFE629')
    expect(val(dark, 'bg')).toBe('#0A0B0D')
  })
})
