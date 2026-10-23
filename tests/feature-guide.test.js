// The feature guide and the tour built from it (feedback aa4e3c4d, ledger
// 0016). The guide is held to App.jsx's route table BOTH ways, so a new page
// with no guide line fails here, and the tour is held to the guide: every
// page a person can use is in their tour.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { GUIDE, NOT_IN_GUIDE, AREAS, guideFor } from '../src/featureGuide.js'
import { tourSteps } from '../src/tourSteps.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const appPaths = (src) => [...src.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')
const pathsIn = (steps) => new Set(steps.flatMap((s) => [
  ...[...String(s.popover?.description ?? '').matchAll(/data-tour-path="([^"]+)"/g)].map((m) => m[1]),
  ...(s.element ? [GUIDE.find((g) => g.anchor === s.element)?.path].filter(Boolean) : []),
]))

describe('the feature guide covers every route', () => {
  const routes = appPaths(APP)
  it('reads the route table (positive control for the parser)', () => {
    expect(routes).toContain('/dashboard')
    expect(routes.length).toBeGreaterThan(40)
  })
  it('every App.jsx route has a guide line or a written reason', () => {
    const covered = new Set([...GUIDE.map((g) => g.path), ...Object.keys(NOT_IN_GUIDE)])
    expect(routes.filter((p) => !covered.has(p))).toEqual([])
  })
  it('nothing in the guide or the reasons is a route App.jsx no longer has', () => {
    const routed = new Set(routes)
    expect([...GUIDE.map((g) => g.path), ...Object.keys(NOT_IN_GUIDE)].filter((p) => !routed.has(p))).toEqual([])
  })
  it('a route added without a guide line is caught (the check above, run on a planted route)', () => {
    const planted = appPaths(`${APP}<Route path="/brand-new-page" element={<X />} />`)
    const covered = new Set([...GUIDE.map((g) => g.path), ...Object.keys(NOT_IN_GUIDE)])
    expect(planted.filter((p) => !covered.has(p))).toEqual(['/brand-new-page'])
  })
  it('every line is complete, plain and in a known area, with no weekday names or em dashes', () => {
    const areas = new Set(AREAS.map((a) => a.key))
    for (const g of GUIDE) {
      expect(areas.has(g.area), g.path).toBe(true)
      expect(g.title && g.what && g.where && g.for.length, g.path).toBeTruthy()
      expect(`${g.title} ${g.what} ${g.where}`).not.toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|—/)
    }
    expect(new Set(GUIDE.map((g) => g.path)).size).toBe(GUIDE.length)
  })
})

describe('the tour is built from the guide', () => {
  const roles = {
    student: { isStaff: false, isParent: false },
    staff: { isStaff: true, isParent: false },
    admin: { isStaff: true, isParent: false, isAdmin: true },
    parent: { isStaff: false, isParent: true },
  }
  for (const [who, r] of Object.entries(roles)) {
    it(`${who}: every guide page they can use is in their tour, and nothing else`, () => {
      const steps = tourSteps(r.isStaff, r.isParent, { isAdmin: !!r.isAdmin, present: () => true })
      const want = new Set(guideFor(r).map((g) => g.path))
      expect(want.size).toBeGreaterThan(5)
      expect(pathsIn(steps)).toEqual(want)
    })
  }
  it('staff see the staff tools, a student does not (both counts)', () => {
    const staffN = guideFor(roles.staff).filter((g) => g.area === 'staff').length
    const studentN = guideFor(roles.student).filter((g) => g.area === 'staff').length
    expect(staffN).toBeGreaterThan(5)
    expect(studentN).toBe(0)
  })
  it('a parent sees the family pages and not the student pages', () => {
    const p = guideFor(roles.parent).map((g) => g.path)
    expect(p).toContain('/family/:token')
    expect(p).not.toContain('/jobs')
  })
  it('an anchor not on screen becomes a line in its area card instead of a spotlight', () => {
    const steps = tourSteps(false, false, { present: () => false })
    expect(steps.some((s) => s.element)).toBe(false)
    expect(pathsIn(steps).has('/schedule')).toBe(true)
  })
})
