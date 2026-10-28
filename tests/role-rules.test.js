// The role board rule check (src/roleRules.js, ledger 0029). Every rule is
// driven both ways on the same fixture: a board that keeps the rule yields no
// issue (positive control) and one change breaks it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { roleRuleIssues, compatible, DRIVE_TEAM, MAX_IN_A_ROW, ROLE_PLACE } from '../src/roleRules.js'
import { ROLE_ORDER } from '../src/roleBoard.js'

let rid = 0
const req = (member, role, status = 'assigned') => ({ id: `q${rid++}`, member_id: member, name: member.toUpperCase(), role, status })
const slot = (id, hour, requests, needs = { scout: 6, pit_crew: 3, driver: 1, human_player: 1, battery_captain: 1 }, day = '2026-10-31') =>
  ({ id, day, label: id, starts_at: `${day}T${String(hour).padStart(2, '0')}:00:00Z`, needs, requests })

describe('compatibility', () => {
  it('every role on the board has a place (no role silently skips the check)', () => {
    for (const r of ROLE_ORDER) expect(ROLE_PLACE[r], r).toBeTruthy()
  })
  it('pit roles share a person; field and stands do not', () => {
    expect(compatible('pit_crew', 'battery_captain')).toBe(true)
    expect(compatible('pit_crew', 'safety_captain')).toBe(true)
    expect(compatible('human_player', 'pit_crew')).toBe(false)
    expect(compatible('driver', 'operator')).toBe(false)
    expect(compatible('scout', 'scouting_lead')).toBe(false)
    expect(compatible('scout', 'pit_crew')).toBe(false)
  })
})

describe('one place at a time', () => {
  it('human player and pit crew in one slot is a conflict; in different slots it is not', () => {
    const clash = roleRuleIssues({ slots: [slot('Q1', 9, [req('m', 'human_player'), req('m', 'pit_crew')])] })
    expect(clash.filter((i) => i.rule === 'one_place')).toHaveLength(1)
    expect(clash[0].roles).toEqual(['human_player', 'pit_crew'])
    const apart = roleRuleIssues({ slots: [slot('Q1', 9, [req('m', 'human_player')]), slot('Q2', 10, [req('m', 'pit_crew')])] })
    expect(apart.filter((i) => i.rule === 'one_place')).toHaveLength(0)
  })
  it('pit crew plus battery captain is fine (positive control for the pit)', () => {
    const ok = roleRuleIssues({ slots: [slot('Q1', 9, [req('d', 'pit_crew'), req('d', 'battery_captain'), req('d', 'scout', 'backup')]), slot('Q2', 10, [req('d', 'scout')])] })
    expect(ok.filter((i) => i.rule === 'one_place')).toHaveLength(0)
  })
  it('a backup or an ask never counts', () => {
    const asks = roleRuleIssues({ slots: [slot('Q1', 9, [req('m', 'human_player'), req('m', 'pit_crew', 'backup'), req('m', 'scout', 'asked')])] })
    expect(asks.filter((i) => i.rule === 'one_place')).toHaveLength(0)
  })
})

describe('two in a row at most', () => {
  const run = (n, role = 'scout') => ({ slots: Array.from({ length: n }, (_, i) => slot(`Q${i + 1}`, 9 + i, [req('a', role)])) })
  it(`${MAX_IN_A_ROW} in a row is fine; ${MAX_IN_A_ROW + 1} is flagged once with every slot named`, () => {
    expect(roleRuleIssues(run(2)).filter((i) => i.rule === 'in_a_row')).toHaveLength(0)
    const three = roleRuleIssues(run(3)).filter((i) => i.rule === 'in_a_row')
    expect(three).toHaveLength(1)
    expect(three[0].slots).toEqual(['Q1', 'Q2', 'Q3'])
  })
  it('a break resets the run: on, on, off, on, on is fine', () => {
    const b = { slots: [1, 2, 3, 4, 5].map((i) => slot(`Q${i}`, 8 + i, i === 3 ? [] : [req('a', 'scout')])) }
    expect(roleRuleIssues(b).filter((i) => i.rule === 'in_a_row')).toHaveLength(0)
  })
  it('a slot that does not need the role (lunch) does not break the run', () => {
    const b = { slots: [slot('Q1', 9, [req('a', 'scout')]), slot('Q2', 10, [req('a', 'scout')]), slot('Lunch', 11, [], { pit_crew: 1 }), slot('Q3', 12, [req('a', 'scout')])] }
    expect(roleRuleIssues(b).filter((i) => i.rule === 'in_a_row')).toHaveLength(1)
  })
  it('lunch pit watch counts toward a pit run', () => {
    const b = { slots: [slot('Q2', 10, [req('p', 'pit_crew'), req('p', 'scout', 'asked')]), slot('Lunch A', 11, [req('p', 'pit_crew')], { pit_crew: 1 }), slot('Q3', 12, [req('p', 'pit_crew')])] }
    expect(roleRuleIssues(b).filter((i) => i.rule === 'in_a_row' && i.name === 'P')).toHaveLength(1)
  })
  it('the drive team is exempt; the same run as pit crew is not', () => {
    for (const r of DRIVE_TEAM) expect(roleRuleIssues(run(6, r)).filter((i) => i.rule === 'in_a_row'), r).toHaveLength(0)
    expect(roleRuleIssues(run(6, 'pit_crew')).filter((i) => i.rule === 'in_a_row')).toHaveLength(1)
  })
  it('runs are counted per day', () => {
    const b = { slots: [slot('Sat Q5', 20, [req('a', 'scout')]), slot('Sat Q6', 21, [req('a', 'scout')]), slot('Sun Q7', 8, [req('a', 'scout')], undefined, '2026-11-01')] }
    expect(roleRuleIssues(b).filter((i) => i.rule === 'in_a_row')).toHaveLength(0)
  })
})

describe('everyone scouts', () => {
  it('a pit-only day is flagged; adding one scout slot clears it', () => {
    const pitOnly = { slots: [slot('Q1', 9, [req('p', 'pit_crew')]), slot('Q2', 10, [req('p', 'pit_crew')])] }
    expect(roleRuleIssues(pitOnly).filter((i) => i.rule === 'no_scout')).toHaveLength(1)
    const withScout = { slots: [slot('Q1', 9, [req('p', 'pit_crew')]), slot('Q2', 10, [req('p', 'pit_crew')]), slot('Q3', 11, [req('p', 'scout')])] }
    expect(roleRuleIssues(withScout).filter((i) => i.rule === 'no_scout')).toHaveLength(0)
  })
  it('a scouting lead slot counts as scouting', () => {
    const b = { slots: [slot('Q1', 9, [req('l', 'pit_crew')]), slot('Q2', 10, [req('l', 'scouting_lead')])] }
    expect(roleRuleIssues(b).filter((i) => i.rule === 'no_scout')).toHaveLength(0)
  })
  it('the drive team that day is exempt', () => {
    const b = { slots: [slot('Q1', 9, [req('d', 'driver')]), slot('Q2', 10, [req('d', 'driver')])] }
    expect(roleRuleIssues(b)).toHaveLength(0)
  })
  it('a day with no scout slots (load-in) flags nobody', () => {
    const b = { slots: [slot('Load-in', 17, [req('p', 'pit_crew')], { pit_crew: 3 }, '2026-10-30')] }
    expect(roleRuleIssues(b)).toHaveLength(0)
  })
})

describe('wiring', () => {
  it('the page and the connector both read the same function', () => {
    expect(readFileSync(new URL('../src/RoleBoardPage.jsx', import.meta.url), 'utf8')).toMatch(/roleRuleIssues/)
    expect(readFileSync(new URL('../api/_lib/connector/tools.js', import.meta.url), 'utf8')).toMatch(/roleRuleIssues/)
  })
})
