// A transient claim_profile error never signs a member out of the app.
//
// supabase-js 2.106 emits SIGNED_IN on every hidden-to-visible transition of
// the tab, and App.jsx re-runs claim_profile on it. It used to do
// setApproved(claimed === true), so an error on that resume (the phone waking
// on a flaky connection) set approved to false and the AccessGate early return
// replaced the whole tree, unmounting /checkin and /dashboard under a student
// who had just opened the phone to check out. src/claimApproval.js now decides,
// and App.jsx passes it the approval it already holds FOR THAT MEMBER.
//
// Both directions are pinned: an error keeps what is held, and a real answer
// (including a real "no") still decides.

import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { nextApproval, nextOnboardedAt, nextRoles } from '../src/claimApproval.js'

const transient = { data: null, error: { code: 'PGRST301', message: 'JWT expired' } }
const network = { data: null, error: { message: 'TypeError: Failed to fetch' } }

describe('nextApproval', () => {
  test('an error never revokes an approval the tab already holds', () => {
    expect(nextApproval(true, transient)).toBe(true)
    expect(nextApproval(true, network)).toBe(true)
  })

  test('positive control: a real answer of false DOES revoke it', () => {
    expect(nextApproval(true, { data: false, error: null })).toBe(false)
    expect(nextApproval(true, { data: null, error: null })).toBe(false)
  })

  test('an answer of true approves, from any starting point', () => {
    for (const held of [null, false, true]) expect(nextApproval(held, { data: true, error: null })).toBe(true)
  })

  test('an error with nothing held (first load) reads as not approved, as before', () => {
    expect(nextApproval(null, transient)).toBe(false)
    expect(nextApproval(undefined, transient)).toBe(false)
    expect(nextApproval(false, transient)).toBe(false)
  })

  test('a missing result is an empty answer, never a throw', () => {
    expect(nextApproval(true, undefined)).toBe(false)
    expect(nextApproval(null, {})).toBe(false)
  })
})

// The two reads after the claim, on the same SIGNED_IN: member_roles and
// profiles.onboarded_at. An error used to answer [] (staff nav gone, a mentor
// or parent put behind the student application) and null (the onboarding tour
// started over /dashboard).
const MENTOR = { data: [{ role: 'mentor' }], error: null }

describe('nextRoles', () => {
  test('an error keeps the roles held for this member', () => {
    expect(nextRoles(['mentor'], transient)).toEqual(['mentor'])
    expect(nextRoles(['parent'], network)).toEqual(['parent'])
  })

  test('positive control: a real answer decides, including a real "no roles"', () => {
    expect(nextRoles(['mentor'], { data: [], error: null })).toEqual([])
    expect(nextRoles(['mentor'], { data: null, error: null })).toEqual([])
    expect(nextRoles(null, MENTOR)).toEqual(['mentor'])
    expect(nextRoles(['student'], { data: [{ role: 'student' }, { role: 'lead' }], error: null })).toEqual(['student', 'lead'])
  })

  test('an error with nothing held is UNKNOWN (null), never "no roles" ([])', () => {
    expect(nextRoles(null, transient)).toBeNull()
    expect(nextRoles(undefined, network)).toBeNull()
    // and the held empty list is a real answer held, kept as it is
    expect(nextRoles([], transient)).toEqual([])
  })
})

describe('nextOnboardedAt', () => {
  const DONE = '2026-06-03T23:00:00.000Z'
  test('an error keeps what is held: never null, so never "start the tour"', () => {
    expect(nextOnboardedAt(DONE, transient)).toBe(DONE)
    expect(nextOnboardedAt(undefined, network)).toBeUndefined()
  })

  test('positive control: a real answer decides, including a real "never onboarded"', () => {
    expect(nextOnboardedAt(undefined, { data: { onboarded_at: DONE }, error: null })).toBe(DONE)
    expect(nextOnboardedAt(DONE, { data: { onboarded_at: null }, error: null })).toBeNull()
    expect(nextOnboardedAt(undefined, { data: { onboarded_at: null }, error: null })).toBeNull()
  })
})

// App.jsx's wiring, read from source (no DOM here; see vitest.config.js).
// Each check holds on the shipped file and fails on a mutant of it.
describe('App.jsx claimAndLoad', () => {
  const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const body = src.slice(src.indexOf('async function claimAndLoad('), src.indexOf('async function loadApplicationState('))

  const CHECKS = {
    'decides through nextApproval with the rpc answer':
      (b) => /const claim = await supabase\.rpc\('claim_profile'\)/.test(b) && /nextApproval\(held, claim\)/.test(b),
    // Two claims run at once on every boot (getSession and INITIAL_SESSION). The
    // held value is read once the answer is back, so an error on one keeps what
    // the other decided while it was in flight; read before the call, the
    // error would see nothing held and revoke an approval the tab now holds.
    'reads what is held only after the answer arrives':
      (b) => {
        const call = b.indexOf("await supabase.rpc('claim_profile')")
        const read = b.indexOf('approvedRef.current?.userId === userId')
        return call >= 0 && read > call
      },
    'holds the approval per member, so another member starts from nothing':
      (b) => /approvedRef\.current\?\.userId === userId \? approvedRef\.current\.approved : null/.test(b),
    'never sets approval straight from the raw answer':
      (b) => !/setApproved\(claimed === true\)/.test(b) && /setApproved\(isApproved\)/.test(b),
    'the application gate gets the same decision':
      (b) => /loadApplicationState\(userId, isApproved, roleList\)/.test(b),
    'roles: decided through nextRoles with the read and what is held for this member':
      (b) => /const roleList = nextRoles\(heldRoles, rolesRead\)/.test(b)
        && /rolesRef\.current\?\.userId === userId \? rolesRef\.current\.roles : null/.test(b),
    'roles: what is held is read only after the answer arrives':
      (b) => {
        const call = b.indexOf('const rolesRead = await supabase')
        const read = b.indexOf('const heldRoles =')
        return call >= 0 && read > call
      },
    'roles: never set straight from the raw read, and unknown shows as none':
      (b) => !/setRoles\(roleList\)/.test(b) && !/data\?\.map\(r => r\.role\) \?\? \[\]/.test(b) && /setRoles\(roleList \?\? \[\]\)/.test(b),
    'roles: only a known list is held':
      (b) => /if \(roleList\) rolesRef\.current = \{ userId, roles: roleList \}/.test(b),
    'onboarded_at: set only through nextOnboardedAt, from what is held':
      (b) => /setOnboardedAt\(prev => nextOnboardedAt\(prev, profRead\)\)/.test(b) && !/setOnboardedAt\(prof\?\.onboarded_at/.test(b),
  }
  const MUTANTS = {
    'decides through nextApproval with the rpc answer':
      (b) => b.replace(/const isApproved = nextApproval\([^\n]*\n/, "const { data: claimed } = claim\n      const isApproved = claimed === true\n"),
    'reads what is held only after the answer arrives':
      (b) => b.replace(/(\s*)const claim = await supabase\.rpc\('claim_profile'\)\n(\s*const held = [^\n]*\n)/, '\n$2$1const claim = await supabase.rpc(\'claim_profile\')\n'),
    'holds the approval per member, so another member starts from nothing':
      (b) => b.replace(/approvedRef\.current\?\.userId === userId \? approvedRef\.current\.approved : null/, 'approvedRef.current?.approved ?? null'),
    'never sets approval straight from the raw answer':
      (b) => b.replace('setApproved(isApproved)', 'setApproved(claimed === true)'),
    'the application gate gets the same decision':
      (b) => b.replace('loadApplicationState(userId, isApproved, roleList)', 'loadApplicationState(userId, claimed === true, roleList)'),
    // The shipped bug, each half: an error read as [] ...
    'roles: decided through nextRoles with the read and what is held for this member':
      (b) => b.replace('const roleList = nextRoles(heldRoles, rolesRead)', 'const roleList = rolesRead.data?.map(r => r.role) ?? []'),
    'roles: what is held is read only after the answer arrives':
      (b) => b.replace(/(\s*)const rolesRead = await supabase\n([^]*?)\n(\s*const heldRoles = [^\n]*\n)/, '\n$3$1const rolesRead = await supabase\n$2\n'),
    'roles: never set straight from the raw read, and unknown shows as none':
      (b) => b.replace('setRoles(roleList ?? [])', 'setRoles(roleList)'),
    'roles: only a known list is held':
      (b) => b.replace('if (roleList) rolesRef.current = { userId, roles: roleList }', 'rolesRef.current = { userId, roles: roleList ?? [] }'),
    // ... and an error read as "never onboarded".
    'onboarded_at: set only through nextOnboardedAt, from what is held':
      (b) => b.replace('setOnboardedAt(prev => nextOnboardedAt(prev, profRead))', 'setOnboardedAt(profRead.data?.onboarded_at ?? null)'),
  }

  test('the function body was found', () => {
    expect(body.length).toBeGreaterThan(100)
  })
  for (const [name, check] of Object.entries(CHECKS)) {
    test(name, () => {
      expect(check(body)).toBe(true)
      const mutant = MUTANTS[name](body)
      expect(mutant).not.toBe(body)
      expect(check(mutant)).toBe(false)
    })
  }

  test('signing out drops the held approval', () => {
    expect(src).toMatch(/approvedRef\.current = null\n\s*setApproved\(null\)/)
  })

  test('signing out drops the held roles', () => {
    expect(src).toMatch(/setRoles\(\[\]\)\n\s*rolesRef\.current = null/)
  })
})

// The application gate, read from source: unknown roles fail OPEN, the way an
// application read error already does, and known roles still decide.
describe('App.jsx loadApplicationState', () => {
  const src = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')
  const start = src.indexOf('async function loadApplicationState(')
  const body = src.slice(start, src.indexOf('supabase.auth.getSession()', start))
  const failsOpen = (b) => {
    const guard = b.indexOf('if (roleList === null) { setAppSeason(null); return }')
    const use = b.indexOf('roleList.some(')
    return guard >= 0 && use > guard
  }

  test('unknown roles (null) fail open before the roles are read as a track', () => {
    expect(body.length).toBeGreaterThan(100)
    expect(failsOpen(body)).toBe(true)
    const mutant = body.replace('if (roleList === null) { setAppSeason(null); return }\n', '')
    expect(mutant).not.toBe(body)
    expect(failsOpen(mutant)).toBe(false)
  })

  test('positive control: known roles still decide (staff and parent skip, the member track is asked)', () => {
    expect(body).toMatch(/const staff {2}= roleList\.some\(r => \['mentor', 'lead', 'admin'\]\.includes\(r\)\)/)
    expect(body).toMatch(/if \(!isApproved \|\| staff \|\| parent\) \{ setAppSeason\(null\); return \}/)
    expect(body).toMatch(/setAppSeason\(existing \? null : season\)/)
  })
})
