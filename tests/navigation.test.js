import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { GUIDE, AREAS, guideFor } from '../src/featureGuide.js'
import { pageCommands, PRIVATE_LINKS, searchCommands } from '../src/navigation.js'
import { TOOLS } from '../src/adminTools.js'
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const paths = [...app.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)].map(m => m[1])
const member = { memberId: 'invented-member' }
const has = (commands, path) => commands.some(c => c.path === path)
describe('role-aware page inventory', () => {
  for (const [role, viewer] of Object.entries({ member, scoutLead: member, driver: member, mentor: { ...member, isStaff: true }, admin: { ...member, isStaff: true, isAdmin: true }, parent: { ...member, isParent: true }, parentStaff: { ...member, isStaff: true, isParent: true } })) {
    it(`${role}: every tour page is searchable or has a private-link reason`, () => {
      const commands = pageCommands(viewer)
      expect(commands.length).toBeGreaterThan(5)
      expect(commands.map(c => c.path)).toEqual(expect.arrayContaining(guideFor(viewer).filter(g => !PRIVATE_LINKS[g.path]).map(g => g.path)))
      expect(new Set(commands.map(c => c.path)).size).toBe(commands.length)
      for (const c of commands) {
        expect(paths).toContain(c.path)
        expect(c.to).not.toMatch(/[:*]/)
        expect(c.to.startsWith('/')).toBe(true)
        expect(`${c.title} ${c.what} ${c.hint}`).not.toContain('—')
        if (c.path.includes(':') && !c.path.startsWith('/members/')) expect(c.hint).not.toBe('')
      }
    })
  }
  it('admin tools are present for admin, absent for mentor, student and parent', () => {
    const restricted = ['/roster', '/feedback', '/announce', '/connector/*']
    for (const viewer of [member, { isStaff: true }, { isParent: true }]) {
      expect(pageCommands(viewer).filter(c => restricted.includes(c.path))).toEqual([])
    }
    expect(pageCommands({ isStaff: true, isAdmin: true }).filter(c => restricted.includes(c.path)).map(c => c.path).sort()).toEqual(restricted.sort())
  })
  it('staff and member pages stay out of the parent view, while family records are reachable', () => {
    const commands = pageCommands({ isParent: true })
    for (const path of ['/manage', '/scouting', '/drivers', '/jobs']) expect(has(commands, path)).toBe(false)
    for (const path of ['/manage', '/scouting', '/drivers', '/jobs']) expect(has(pageCommands({ isStaff: true }), path)).toBe(true)
    for (const path of ['/handbook', '/certifications', '/emergency-info', '/driver-docs']) expect(has(commands, path)).toBe(true)
    expect(has(pageCommands({ isParent: true, isStaff: true }), '/manage')).toBe(true)
  })
  it('sign-outs require staff or the existing approval capability; failed/unknown capability stays closed', () => {
    expect(has(pageCommands(member), '/signouts')).toBe(false)
    expect(has(pageCommands({ ...member, canApproveSignouts: true }), '/signouts')).toBe(true)
    expect(has(pageCommands({ isStaff: true }), '/signouts')).toBe(true)
    expect(has(pageCommands({ isParent: true, canApproveSignouts: true }), '/signouts')).toBe(false)
  })
  it('parameter routes use honest choosers, and reuse only matching current context', () => {
    expect(pageCommands(member).find(c => c.path === '/scouting/:eventId/board')).toMatchObject({ to: '/scouting', hint: 'Choose an event, then Pick board' })
    expect(pageCommands({ ...member, pathname: '/scouting/invented-event' }).find(c => c.path === '/scouting/:eventId/board')).toMatchObject({ to: '/scouting/invented-event/board', hint: '' })
    expect(pageCommands({ ...member, pathname: '/trips/invented-trip' }).find(c => c.path === '/scouting/:eventId/board').to).toBe('/scouting')
    expect(pageCommands(member).find(c => c.path === '/members/:id').to).toBe('/members/invented-member')
    expect(Object.keys(PRIVATE_LINKS)).toHaveLength(3)
    expect(pageCommands({ isStaff: true, isAdmin: true }).some(c => c.path.includes(':token'))).toBe(false)
  })
  it('covers each student step directly without adding primary nav items', () => {
    expect(pageCommands(member).filter(c => c.group === 'Your next step').map(c => c.to).sort()).toEqual(['/certifications', '/handbook', '/jobs', '/my-schedule', '/standing', '/survey'])
  })
})
describe('search', () => {
  const commands = pageCommands({ ...member, isStaff: true, isAdmin: true })
  it('finds titles, paths, task words, multi-word queries and normalized punctuation', () => {
    expect(searchCommands(commands, 'carpool').some(c => c.path === '/trips')).toBe(true)
    expect(searchCommands(commands, 'DRIVE practice').some(c => c.path === '/drivers')).toBe(true)
    expect(searchCommands(commands, 'verify-hours')[0].path).toBe('/verify-hours')
    expect(searchCommands(commands, 'nonsense-invented-query')).toEqual([])
    expect(searchCommands(commands, '   ')).toEqual(commands)
    expect(searchCommands(pageCommands(member), 'discord post')).toEqual([])
    expect(searchCommands(commands, 'discord post').map(c => c.path)).toContain('/announce')
  })
  it('the visibility oracle rejects a permissive admin mutant (the original bug)', () => {
    const source = readFileSync(new URL('../src/featureGuide.js', import.meta.url), 'utf8')
    const build = s => new Function(`${s.replaceAll('export ', '')}; return guideFor`)()
    const check = fn => { expect(fn({ isStaff: true }).filter(g => g.for.includes('admin'))).toEqual([]); expect(fn({ isStaff: true, isAdmin: true }).filter(g => g.for.includes('admin'))).toHaveLength(4) }
    check(build(source))
    const mutant = source.replace("g.for.includes('admin') && isAdmin", "g.for.includes('admin') && (isAdmin || isStaff)")
    expect(mutant).not.toBe(source)
    expect(() => check(build(mutant))).toThrow()
  })
})

it('parent visibility rejects a permissive guide mutant', () => {
  const source = readFileSync(new URL('../src/featureGuide.js', import.meta.url), 'utf8')
  const build = s => new Function(`${s.replaceAll('export ', '')}; return guideFor`)()
  const check = fn => { const pages = fn({ isParent: true }); expect(pages.some(g => g.path === '/jobs')).toBe(false); expect(pages.some(g => g.path === '/handbook')).toBe(true) }
  check(build(source))
  const mutant = source.replace("if (parentOnly) return g.for.includes('parent')", 'if (false) return true')
  expect(mutant).not.toBe(source)
  expect(() => check(build(mutant))).toThrow()
})

it('sign-out command visibility rejects a permissive capability mutant', () => {
  const source = readFileSync(new URL('../src/navigation.js', import.meta.url), 'utf8')
  const build = s => new Function('GUIDE', 'AREAS', 'guideFor', 'TOOLS', `${s.replace(/^import .*$/gm, '').replaceAll('export ', '')}; return pageCommands`)(GUIDE, AREAS, guideFor, TOOLS)
  const check = fn => { expect(has(fn({}), '/signouts')).toBe(false); expect(has(fn({ canApproveSignouts: true }), '/signouts')).toBe(true) }
  check(build(source))
  const mutant = source.replace('&& canApproveSignouts)', '&& true)')
  expect(mutant).not.toBe(source)
  expect(() => check(build(mutant))).toThrow()
})
