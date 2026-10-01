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
import { nextApproval } from '../src/claimApproval.js'

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
})
