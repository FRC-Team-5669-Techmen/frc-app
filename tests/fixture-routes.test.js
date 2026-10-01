// src/dev/fixture/routes.js is a second list of the routes in src/App.jsx (the
// /_fixture page links them, tools/e2e/shoot.mjs sweeps them). CLAUDE.md
// allows a duplicate only when it is gated, and this is the gate: every
// <Route path="..."> in App.jsx must be listed, and nothing may be listed that
// App.jsx no longer routes.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ROUTES } from '../src/dev/fixture/routes.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

function appPaths(source) {
  return [...source.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
}

describe('fixture route list', () => {
  const inApp = appPaths(APP)

  it('reads the route table out of App.jsx (positive control for the parser)', () => {
    expect(inApp).toContain('/checkin')
    expect(inApp).toContain('/checkin-volunteer')
    expect(inApp).toContain('/dashboard')
    expect(inApp.length).toBeGreaterThan(25)
    expect(appPaths('<Route path="/x" element={<X />} /><Route path="*" />')).toEqual(['/x'])
  })

  it('lists every App.jsx route', () => {
    const listed = new Set(ROUTES.map((r) => r.path))
    expect(inApp.filter((p) => !listed.has(p))).toEqual([])
  })

  it('lists nothing App.jsx does not route', () => {
    const routed = new Set(inApp)
    expect(ROUTES.map((r) => r.path).filter((p) => !routed.has(p))).toEqual([])
  })

  it('gives every route a concrete URL with no :param left in it', () => {
    for (const r of ROUTES) {
      expect(r.url.startsWith('/')).toBe(true)
      expect(r.url).not.toMatch(/:[a-z]/i)
    }
  })
})
