// The navigation overhaul (ledger 0017, decision 49): the Team admin catalog,
// its live counts and the account menu's size, held to App.jsx.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { TOOLS, GROUPS, toolsFor, totalWaiting, manageLayout, loadAdminCounts } from '../src/adminTools.js'

const APP = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
const NAV = readFileSync(new URL('../src/NavBar.jsx', import.meta.url), 'utf8')
const routes = new Set([...APP.matchAll(/<Route\b[^>]*?\bpath="([^"]+)"/g)].map((m) => m[1]))

describe('the Team admin catalog', () => {
  it('every tool is a real route, and the groups are the four asked for', () => {
    for (const t of TOOLS) expect(routes.has(t.path), t.path).toBe(true)
    expect(GROUPS.map((g) => g.title)).toEqual(['Right now', 'Events', 'People', 'Hours'])
  })
  it('every staff page the old account menu reached is on /manage', () => {
    for (const p of ['/signouts', '/access-requests', '/feedback', '/trips', '/rosters', '/readiness', '/announce', '/surveys', '/roster', '/applications', '/squad', '/standing/team', '/emergency-info', '/no-photo', '/verify-hours', '/hours', '/reports', '/activity', '/display'])
      expect(TOOLS.some((t) => t.path === p), p).toBe(true)
  })
  it('admin-only tools: 3 for an admin, 0 for a mentor', () => {
    const adminOnly = TOOLS.filter((t) => t.admin).map((t) => t.path)
    expect(adminOnly.sort()).toEqual(['/announce', '/feedback', '/roster'])
    expect(toolsFor({ isAdmin: true }).length - toolsFor({ isAdmin: false }).length).toBe(3)
  })
  it('a tool with something waiting moves to the top, most waiting first; nothing waiting leaves the groups as they are', () => {
    const counts = { signouts: 2, verify: 5, feedback: 1, access: 0, readiness: null }
    const l = manageLayout(counts, { isAdmin: true })
    expect(l.waiting.map((t) => t.path)).toEqual(['/verify-hours', '/signouts', '/feedback'])
    expect(l.groups.flatMap((g) => g.tools).some((t) => t.path === '/verify-hours')).toBe(false)
    const quiet = manageLayout({}, { isAdmin: true })
    expect(quiet.waiting).toEqual([])
    expect(quiet.groups[0].tools.map((t) => t.path)).toEqual(['/signouts', '/access-requests', '/feedback'])
  })
  it('the filter finds a tool by title or by a word it answers to; nonsense finds nothing', () => {
    expect(manageLayout({}, { query: 'carpool' }).filtered.map((t) => t.path)).toEqual(['/trips'])
    expect(manageLayout({}, { query: 'verify' }).filtered.map((t) => t.path)).toContain('/verify-hours')
    expect(manageLayout({}, { isAdmin: false, query: 'discord post' }).filtered).toEqual([]) // Announce is admin only
    expect(manageLayout({}, { isAdmin: true, query: 'discord post' }).filtered.map((t) => t.path)).toEqual(['/announce'])
    expect(manageLayout({}, { query: 'zzzz' }).filtered).toEqual([])
  })
  it('the badge total counts only tools this person can open, and null is not zero', () => {
    const counts = { signouts: 2, feedback: 4, verify: null }
    expect(totalWaiting(counts, { isAdmin: true })).toBe(6)
    expect(totalWaiting(counts, { isAdmin: false })).toBe(2)
    expect(totalWaiting({}, { isAdmin: true })).toBe(0)
  })
  it('loadAdminCounts: a missing table reads null; a working one reads its count; feedback is not read for a mentor', async () => {
    const calls = []
    const fake = {
      from: (t) => { const q = { t, select: () => q, eq: () => q, in: () => q, then: (r) => r(t === 'absence_requests' ? { count: null, error: { code: 'PGRST205' } } : { count: t === 'signout_requests' ? 3 : 1, error: null }) }; calls.push(t); return q },
      rpc: async (n) => (n === 'can_approve_signouts' ? { data: true, error: null } : { data: { action_queue: { total: 2 } }, error: null }),
    }
    const c = await loadAdminCounts(fake, { isAdmin: false })
    expect(c).toMatchObject({ access: 2, signouts: 3, standing: null, verify: 4, readiness: 2, feedback: null })
    expect(calls.includes('feedback')).toBe(false)
    calls.length = 0
    expect((await loadAdminCounts(fake, { isAdmin: true })).feedback).toBe(1)
    expect(calls.includes('feedback')).toBe(true)
  })
})

describe('the navigation', () => {
  it('the member top bar is Home, Schedule, Scouting, Robot, Hours; parents keep Home, Schedule, Team Hours', () => {
    const bar = NAV.slice(NAV.indexOf('<div className="navbar-links">'), NAV.indexOf('<div className="navbar-account">'))
    const labels = [...bar.matchAll(/<Icon\w+ \/>([A-Za-z ]+)/g)].map((m) => m[1].trim())
    expect(labels).toEqual(['Home', 'Schedule', 'Team Hours', 'Scouting', 'Robot', 'Hours'])
  })
  it('the account menu holds at most six entries for anyone, and no staff tool but Team admin', () => {
    const menu = NAV.slice(NAV.indexOf('function AvatarMenu('), NAV.indexOf('export default function NavBar('))
    const links = [...menu.matchAll(/<NavLink to="([^"]+)"/g)].map((m) => m[1])
    const buttons = [...menu.matchAll(/<button className="nav-dropdown-item[^"]*"[^\n]*?>([A-Z][a-z ]+)<\/button>/g)].map((m) => m[1].trim())
    expect(links.sort()).toEqual(['/handbook', '/manage', '/profile', '/signouts', '/standing', '/standing'].sort())
    expect(buttons).toEqual(['Replay tour', 'Sign out'])
    // student: profile, standing, handbook, tour, sign out = 5; staff: team admin, profile, handbook, tour, sign out = 5;
    // parent: profile, standing, handbook, tour, sign out = 5. Two /standing links never show together (student or parent).
    // A student approver adds Sign-outs: profile, standing, sign-outs, handbook, tour, sign out = 6.
    expect(menu).toMatch(/!isStaff && signouts !== null/)
    expect(links.length - 2 + buttons.length).toBeLessThanOrEqual(6)
  })
})
