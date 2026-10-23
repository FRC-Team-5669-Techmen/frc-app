// Ledger 0022: match-number shifts, coverage modes, redundant-pair
// reconciliation and super scouts. Every absence below is paired with a
// presence on the same fixture.
import { describe, expect, it } from 'vitest'
import { matchNumber, blockFor, shiftBlocks, blockRange, upNext, upNextText, onShift, nextNow } from '../src/scouting/shifts.js'
import { coveragePerRobot, planAssignments, PAIR_MIN } from '../src/scouting/schedule.js'
import { reconcilePairs, pairRows, PAIR_THRESHOLDS } from '../src/scouting/pairs.js'
import { cleanSuper, superProposals, superSummary, superAssignmentDone, alliances } from '../src/scouting/superscout.js'
import { reliability } from '../src/scouting/model.js'
import { teamMatchSummary } from '../src/scouting/match.js'
import { eventCoverage } from '../src/scouting/coverage.js'

const E = 'e1'
let seq = 0
const obs = (member, team, match, payload) => ({ id: `o${++seq}`, version: 1, event_id: E, kind: 'observation', member_id: member, team_number: team, match_key: match, payload: { answers: {}, source: 'live', ...payload } })
const asg = (assignee, team, match, payload = {}) => ({ id: `a${++seq}`, version: 1, event_id: E, kind: 'assignment', member_id: 'lead', team_number: team, match_key: match, payload: { assignee, status: 'assigned', ...payload } })
const sched = n => Array.from({ length: n }, (_, i) => ({ key: `qm${i + 1}`, teams: [1, 2, 3, 4, 5, 6].map(t => t + i * 10) }))
const scouts = n => Array.from({ length: n }, (_, i) => ({ id: `s${String(i).padStart(2, '0')}` }))

describe('match numbers and shift blocks', () => {
  it('reads the qualification number from every form a key takes, and nothing else', () => {
    expect(['qm12', '2026cabb_qm12', 'Q12', 'q12', '12', ' QM12 '].map(matchNumber)).toEqual([12, 12, 12, 12, 12, 12])
    expect(['sf1m1', '2026cabb_f1m2', 'pm3', '', null, 'qm0', 'qm1000'].map(matchNumber)).toEqual([null, null, null, null, null, null, null])
  })
  it('blocks run by match number: 30 matches in blocks of 12 are Q1-12, Q13-24, Q25-30', () => {
    expect(shiftBlocks(30, 12).map(b => b.label)).toEqual(['Q1 to Q12', 'Q13 to Q24', 'Q25 to Q30'])
    expect(blockFor(13, 12)).toMatchObject({ from: 13, to: 24 })
    expect(blockFor(12, 12)).toMatchObject({ from: 1, to: 12 })
    expect(blockFor(0, 12)).toBe(null)
    expect(shiftBlocks(0, 12)).toEqual([])
  })
  it('a block maps to the schedule index range, whatever the clock says', () => {
    const m = sched(30)
    expect(blockRange(m, blockFor(13, 12))).toEqual({ start: 12, end: 23 })
    expect(blockRange([{ key: 'sf1m1', teams: [1] }], blockFor(1, 12))).toBe(null)
  })
  it('a lead bump clamps to 0..999', () => {
    expect(nextNow(5, { delta: 1 })).toBe(6)
    expect(nextNow(0, { delta: -1 })).toBe(0)
    expect(nextNow(5, { set: 20 })).toBe(20)
    expect(nextNow(998, { delta: 5 })).toBe(999)
    expect(nextNow(null, { delta: 1 })).toBe(1)
  })
})

describe("you're up in N matches", () => {
  const recs = [asg('me', 254, 'qm9'), asg('me', 1678, 'qm5'), asg('me', 971, 'qm2', { status: 'cancelled' }), asg('you', 118, 'qm4')]
  it('counts from the current match to the next of MY active assignments', () => {
    expect(upNext(recs, 'me', 3)).toMatchObject({ match: 5, inMatches: 2 })
    expect(upNextText(upNext(recs, 'me', 3))).toBe("You're up in 2 matches: Q5")
    expect(upNextText(upNext(recs, 'me', 4))).toBe("You're up in 1 match: Q5")
    expect(upNextText(upNext(recs, 'me', 5))).toBe("You're up now: Q5")
    expect(upNext(recs, 'me', 6)).toMatchObject({ match: 9, inMatches: 3 })
  })
  it('nothing ahead, a cancelled slot, or someone else\'s slot is not "up" (positive control above)', () => {
    expect(upNext(recs, 'me', 10)).toBe(null)
    expect(upNext(recs, 'me', 1).match).toBe(5) // the cancelled qm2 is skipped
    expect(upNext(recs, 'you', 5)).toBe(null)
    expect(upNext(recs, 'you', 4)).toMatchObject({ inMatches: 0 })
    expect(upNext(recs, 'me', null)).toBe(null)
  })
  it('on shift: assignees in the block containing now, split by role', () => {
    const r = [asg('a', 1, 'qm1'), asg('a', 2, 'qm3'), asg('b', 3, 'qm13'), asg('c', 4, 'qm2', { role: 'super', alliance: 'red', teams: [4] })]
    const s = onShift(r, 2, 12)
    expect(s.block.label).toBe('Q1 to Q12')
    expect(s.scouts).toEqual([{ id: 'a', count: 2 }])
    expect(s.supers).toEqual([{ id: 'c', count: 1 }])
    expect(onShift(r, 14, 12).scouts).toEqual([{ id: 'b', count: 1 }])
  })
})

describe('coverage modes', () => {
  it('auto pairs only at PAIR_MIN scouts; pairs refuses a short shift', () => {
    expect(PAIR_MIN).toBe(12)
    expect(coveragePerRobot('auto', 11)).toBe(1)
    expect(coveragePerRobot('auto', 12)).toBe(2)
    expect(coveragePerRobot('single', 20)).toBe(1)
    expect(coveragePerRobot('pairs', 12)).toBe(2)
    expect(() => coveragePerRobot('pairs', 11)).toThrow(/12 or more/)
  })
  it('12 scouts put two different scouts on every robot; 6 scouts put one (both directions, same schedule)', () => {
    const two = planAssignments({ matches: sched(2), scouts: scouts(12), coverage: 'auto' })
    expect(two.perRobot).toBe(2)
    expect(two.proposals).toHaveLength(24)
    for (const m of ['qm1', 'qm2']) {
      const rows = two.proposals.filter(p => p.match_key === m)
      expect(new Set(rows.map(p => p.payload.assignee)).size).toBe(12) // nobody watches two robots in one match
      for (const t of new Set(rows.map(p => p.team_number))) expect(new Set(rows.filter(p => p.team_number === t).map(p => p.payload.assignee)).size).toBe(2)
    }
    const one = planAssignments({ matches: sched(2), scouts: scouts(6), coverage: 'auto' })
    expect(one.perRobot).toBe(1)
    expect(one.proposals).toHaveLength(12)
  })
  it('an existing observation fills one pair slot; the other is still assigned', () => {
    const r = planAssignments({ matches: sched(1), scouts: scouts(12), coverage: 'pairs', records: [obs('x', 1, 'qm1', {})] })
    expect(r.proposals.filter(p => p.team_number === 1)).toHaveLength(1)
    expect(r.proposals.filter(p => p.team_number === 2)).toHaveLength(2)
  })
  it('super scouts get one alliance each per match and are never also robot scouts', () => {
    const r = planAssignments({ matches: sched(2), scouts: scouts(6), supers: [{ id: 'sup1' }, { id: 'sup2' }], superPerAlliance: 1 })
    const sup = r.proposals.filter(p => p.payload.role === 'super')
    expect(sup).toHaveLength(4)
    expect(sup.map(p => p.payload.alliance).sort()).toEqual(['blue', 'blue', 'red', 'red'])
    expect(sup.find(p => p.match_key === 'qm1' && p.payload.alliance === 'red').payload.teams).toEqual([1, 2, 3])
    expect(r.proposals.filter(p => p.payload.role !== 'super').some(p => p.payload.assignee.startsWith('sup'))).toBe(false)
    expect(r.proposals.filter(p => p.payload.role !== 'super')).toHaveLength(12)
    expect(planAssignments({ matches: sched(2), scouts: scouts(6) }).proposals.some(p => p.payload.role === 'super')).toBe(false)
    expect(() => planAssignments({ matches: sched(1), scouts: [{ id: 'a' }], supers: [{ id: 'a' }], superPerAlliance: 1 })).toThrow()
  })
  it('two supers per alliance needs two people; one short leaves an explicit gap', () => {
    const r = planAssignments({ matches: sched(1), scouts: [], supers: [{ id: 'sup1' }, { id: 'sup2' }, { id: 'sup3' }], superPerAlliance: 2 })
    expect(r.proposals).toHaveLength(3)
    expect(r.gaps).toHaveLength(1)
    expect(r.gaps[0].reason).toMatch(/super scout/)
  })
})

describe('redundant-pair reconciliation', () => {
  it('averages a pair and flags only a disagreement beyond the threshold', () => {
    const recs = [obs('a', 254, 'qm1', { match: { teleop_fuel: 20, driver_skill: 4, stuck: 'no' } }), obs('b', 254, 'qm1', { match: { teleop_fuel: 25, driver_skill: 4, stuck: 'no' } }),
      obs('a', 254, 'qm2', { match: { teleop_fuel: 20, stuck: 'yes' } }), obs('b', 254, 'qm2', { match: { teleop_fuel: 35, stuck: 'no' } }),
      obs('a', 118, 'qm3', { match: { teleop_fuel: 50 } })]
    const pairs = reconcilePairs(recs)
    expect(pairs).toHaveLength(2) // 118 has one scout: not a pair
    const q1 = pairs.find(p => p.match === 'qm1'), q2 = pairs.find(p => p.match === 'qm2')
    expect(q1.fields.teleop_fuel).toMatchObject({ value: 22.5, flagged: false })
    expect(q1.flags).toEqual([])
    expect(q2.fields.teleop_fuel).toMatchObject({ value: 27.5, flagged: true })
    expect(q2.flags.sort()).toEqual(['stuck', 'teleop_fuel'])
    expect(pairs[0].match).toBe('qm2') // flagged first
    // Positive control on the threshold: a tighter one flags qm1 too.
    expect(reconcilePairs(recs, { thresholds: { ...PAIR_THRESHOLDS, count: 4 } }).find(p => p.match === 'qm1').flags).toEqual(['teleop_fuel'])
    // The pair average equals the team summary's per-match value (median of two).
    expect(teamMatchSummary(recs.filter(r => r.match_key === 'qm1'), 254).teleop_fuel.median).toBe(22.5)
  })
  it('did not see never disagrees; a correction replaces the earlier version', () => {
    const a1 = obs('a', 7, 'qm4', { match: { tipped: 'did_not_see', teleop_fuel: 10 } })
    const recs = [a1, obs('b', 7, 'qm4', { match: { tipped: 'yes', teleop_fuel: 40 } }), { ...a1, version: 2, payload: { ...a1.payload, match: { tipped: 'did_not_see', teleop_fuel: 35 } } }]
    const [p] = reconcilePairs(recs)
    expect(p.fields.tipped).toMatchObject({ value: 'yes', flagged: false })
    expect(p.fields.teleop_fuel).toMatchObject({ value: 37.5, flagged: false })
  })
  it('the pairs sheet: one row per pair, Check with the two values named', () => {
    const rows = pairRows([obs('a', 9, 'qm1', { match: { auto_fuel: 5 } }), obs('b', 9, 'qm1', { match: { auto_fuel: 20 } })])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ team: 9, match: 'qm1', scouts: 2, auto_fuel: 12.5, status: 'Check' })
    expect(rows[0].flags).toMatch(/5 vs 20/)
    expect(rows[0].teleop_fuel).toBe('')
  })
})

describe('super scouts', () => {
  const sup = (member, team, match, s) => obs(member, team, match, { role: 'super', super: s })
  it('an unrated field is absent, never 0; out-of-range is dropped', () => {
    expect(cleanSuper({ driver_skill: 4, speed: 0, intake: 6, defense: 2.5, failures: '  chain  ' })).toEqual({ driver_skill: 4, failures: 'chain' })
    expect(superProposals({ match: 'qm1', notes: { 1: {}, 2: { speed: 3 } } }).map(p => p.team_number)).toEqual([2])
    expect(superProposals({ match: 'qm1', notes: { 2: { speed: 3 } } })[0].payload).toMatchObject({ role: 'super', super: { speed: 3 }, answers: {} })
  })
  it('a summary means the ratings over notes that rated them', () => {
    const recs = [sup('a', 5, 'qm1', { driver_skill: 4, failures: 'tipped' }), sup('b', 5, 'qm2', { driver_skill: 2, speed: 5 })]
    const s = superSummary(recs, 5)
    expect(s.notes).toBe(2)
    expect(s.driver_skill).toEqual({ mean: 3, n: 2 })
    expect(s.speed).toEqual({ mean: 5, n: 1 })
    expect(s.intake).toEqual({ mean: null, n: 0 })
    expect(s.failures).toEqual([{ match: 'qm1', text: 'tipped' }])
    expect(superSummary(recs, 6).notes).toBe(0)
  })
  it('super notes never enter rates, counts or coverage; a data scout sheet does (both directions)', () => {
    const superOnly = [sup('a', 5, 'qm1', { driver_skill: 4 })]
    const dataOnly = [obs('a', 5, 'qm1', {})]
    expect(reliability(superOnly, 5, 'trench').missing).toBe(0)
    expect(reliability(dataOnly, 5, 'trench').missing).toBe(1)
    expect(eventCoverage(superOnly)[0].currentMatches).toBe(0)
    expect(eventCoverage(dataOnly)[0].currentMatches).toBe(1)
    const plan = planAssignments({ matches: [{ key: 'qm1', teams: [5] }], scouts: [{ id: 'z' }], records: superOnly })
    expect(plan.proposals).toHaveLength(1)
    expect(planAssignments({ matches: [{ key: 'qm1', teams: [5] }], scouts: [{ id: 'z' }], records: dataOnly }).proposals).toHaveLength(0)
  })
  it('a super assignment is done when every alliance robot has the assignee\'s note', () => {
    const row = asg('me', 1, 'qm1', { role: 'super', alliance: 'red', teams: [1, 2, 3] })
    const notes = [sup('me', 1, 'qm1', { speed: 3 }), sup('me', 2, 'qm1', { speed: 3 })]
    expect(superAssignmentDone(row, notes)).toBe(false)
    expect(superAssignmentDone(row, [...notes, sup('me', 3, 'qm1', { speed: 3 })])).toBe(true)
    expect(superAssignmentDone(row, [...notes, sup('other', 3, 'qm1', { speed: 3 })])).toBe(false)
  })
  it('alliances follow TBA order: red first three, blue last three', () => {
    expect(alliances({ teams: [1, 2, 3, 4, 5, 6] })).toEqual([{ alliance: 'red', teams: [1, 2, 3] }, { alliance: 'blue', teams: [4, 5, 6] }])
    expect(alliances({ teams: [1, 2] })).toEqual([{ alliance: 'red', teams: [1, 2] }])
  })
})
