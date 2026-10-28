// Feedback 449543dd (Azad): "This evidence/scouting material does not seem
// good, as I believe every robot does these areas." spread.js decides which
// answers tell robots apart. Every "shared" assertion below is paired with the
// same fixture driven the other way, so a function that always says "shared"
// or always says "varies" fails.
import { describe, it, expect } from 'vitest'
import { observedTeams, capabilitySpread, optionSpread, byDifference, sharedText, SHARED_MIN } from '../src/scouting/spread.js'

let n = 0
const obs = (team, match, answers = {}, extra = {}) => ({ id: `o${++n}`, kind: 'observation', event_id: 'e', member_id: extra.member ?? 'm', team_number: team, match_key: match, version: 1, updated_at: `2026-10-30T10:${String(n).padStart(2, '0')}:00Z`, payload: { source: 'live', answers, ...(extra.custom ? { custom: extra.custom } : {}), ...(extra.payload ?? {}) } })
const passes = { key: 'passes', type: 'yesno', status: 'active', label: 'Passes' }
const from = { key: 'passes_from', type: 'choice', status: 'active', label: 'Passes from', choices: [['neutral', 'Neutral zone'], ['alliance', 'Alliance zone']] }
const count = { key: 'pass_count', type: 'count', status: 'active', label: 'Passes made' }
const note = { key: 'pass_note', type: 'note', status: 'active', label: 'Passing note' }

describe('capability spread', () => {
  const allYes = [obs(1, 'qm1', { trench: 'yes' }), obs(2, 'qm1', { trench: 'yes' }), obs(3, 'qm2', { trench: 'yes' })]
  it('every observed robot yes is shared, and says how many robots', () => {
    expect(capabilitySpread(allYes, 'trench')).toEqual({ state: 'shared', teams: 3, value: 'yes' })
    expect(sharedText(capabilitySpread(allYes, 'trench'))).toBe('Every robot observed so far does this (3 robots).')
  })
  it('one observed failure on one robot makes it vary (positive control on the same fixture)', () => {
    expect(capabilitySpread([...allYes, obs(3, 'qm3', { trench: 'no' })], 'trench').state).toBe('varies')
    expect(capabilitySpread([...allYes, obs(4, 'qm3', { trench: 'no' })], 'trench').state).toBe('varies')
  })
  it('every observed robot no is shared too, worded as no robot', () => {
    const s = capabilitySpread([obs(1, 'qm1', { bump: 'no' }), obs(2, 'qm1', { bump: 'no' })], 'bump')
    expect(s).toEqual({ state: 'shared', teams: 2, value: 'no' })
    expect(sharedText(s)).toBe('No robot observed so far does this (2 robots).')
  })
  it(`fewer than ${SHARED_MIN} robots with a decisive answer is never called shared`, () => {
    expect(capabilitySpread([obs(1, 'qm1', { trench: 'yes' })], 'trench')).toEqual({ state: 'unknown', teams: 1, value: null })
    expect(capabilitySpread([], 'trench').state).toBe('unknown')
  })
  it('a robot with only did-not-see or unanswered is left out, never counted as no', () => {
    const records = [...allYes, obs(9, 'qm4', { trench: 'did_not_see' }), obs(8, 'qm4', {})]
    expect(capabilitySpread(records, 'trench')).toEqual({ state: 'shared', teams: 3, value: 'yes' })
    expect(observedTeams(records)).toEqual([1, 2, 3, 8, 9])
  })
  it('super-scout notes and prior-event footage do not enter the comparison', () => {
    const superNote = obs(5, 'qm5', {}, { payload: { role: 'super', super: { driver_skill: 2 } } })
    const prior = obs(6, '2026cabb_qm1', { trench: 'no' }, { payload: { source: 'video', video_url: 'https://example.org/v', source_scope: 'external', source_event: '2026cabb' } })
    expect(capabilitySpread([...allYes, superNote, prior], 'trench')).toEqual({ state: 'shared', teams: 3, value: 'yes' })
    expect(observedTeams([...allYes, superNote, prior])).toEqual([1, 2, 3])
  })
})

describe('observation option spread (0037)', () => {
  it('yes/no options compare like capabilities', () => {
    const same = [obs(1, 'qm1', {}, { custom: { passes: 'yes' } }), obs(2, 'qm1', {}, { custom: { passes: 'yes' } })]
    expect(optionSpread(same, passes)).toEqual({ state: 'shared', teams: 2, value: 'yes' })
    expect(optionSpread([...same, obs(3, 'qm2', {}, { custom: { passes: 'no' } })], passes).state).toBe('varies')
  })
  it('pick-one options are shared only when every robot gives the one same answer', () => {
    const same = [obs(1, 'qm1', {}, { custom: { passes_from: 'neutral' } }), obs(2, 'qm1', {}, { custom: { passes_from: 'neutral' } })]
    expect(optionSpread(same, from)).toEqual({ state: 'shared', teams: 2, value: 'neutral' })
    expect(sharedText(optionSpread(same, from), { yesno: false, valueLabel: 'Neutral zone' })).toBe('Same for every robot observed so far: Neutral zone (2 robots).')
    expect(optionSpread([...same, obs(2, 'qm2', {}, { custom: { passes_from: 'alliance' } })], from).state).toBe('varies')
  })
  it('counts compare by median; a note never compares', () => {
    const zero = [obs(1, 'qm1', {}, { custom: { pass_count: 0 } }), obs(2, 'qm1', {}, { custom: { pass_count: 0 } })]
    expect(optionSpread(zero, count)).toEqual({ state: 'shared', teams: 2, value: '0' })
    expect(optionSpread([...zero, obs(3, 'qm2', {}, { custom: { pass_count: 4 } })], count).state).toBe('varies')
    expect(optionSpread([obs(1, 'qm1', {}, { custom: { pass_note: 'a' } }), obs(2, 'qm1', {}, { custom: { pass_note: 'a' } })], note).state).toBe('unknown')
  })
  it('a robot that never answered the option is left out, not counted as no', () => {
    const records = [obs(1, 'qm1', {}, { custom: { passes: 'yes' } }), obs(2, 'qm1', {}, { custom: { passes: 'yes' } }), obs(3, 'qm2', { trench: 'yes' })]
    expect(optionSpread(records, passes)).toEqual({ state: 'shared', teams: 2, value: 'yes' })
  })
})

describe('ordering', () => {
  it('varies first, then not yet compared, then shared, keeping the original order within each', () => {
    const items = [['a', 'shared'], ['b', 'unknown'], ['c', 'varies'], ['d', 'shared'], ['e', 'varies']].map(([k, state]) => ({ k, spread: { state } }))
    expect(byDifference(items).map(x => x.k)).toEqual(['c', 'e', 'b', 'a', 'd'])
  })
})
