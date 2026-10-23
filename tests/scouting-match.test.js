// REBUILT match fields (src/scouting/match.js, migration 0027, ledger 0017).
// Absent is never zero; one value per match; confirmed current evidence only;
// unknowns never pass a filter. Hand examples, each asserted both ways.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { MATCH_FIELDS, stepCount, cleanMatch, recordedCount, teamMatchSummary, passesMatchFilters, fmtMedian } from '../src/scouting/match.js'
import { MATCH_FIELD_LIST } from '../src/dev/fixture/features/scoutingmatch.js'

const obs = (member, match, m, extra = {}) => ({ id: `${member}-${match}`, kind: 'observation', event_id: 'ev', member_id: member, team_number: 101, match_key: match, version: 1, updated_at: '2026-10-30T18:00:00Z', payload: { answers: {}, source: 'live', match: m }, ...extra })

describe('the field list is the server list', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0027_scouting_match_fields.sql', import.meta.url), 'utf8')
  it('every client key is one 0027 validates, and every 0027 key is a client field', () => {
    const body = sql.slice(sql.indexOf('create or replace function scouting_private.validate_match'), sql.indexOf('revoke all on function scouting_private.validate_match'))
    const serverKeys = new Set([...body.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).filter(k => MATCH_FIELDS.some(f => f.key === k) || /_(fuel|missed|rating|skill)$|^(auto_climb|shuttled|died|tipped|stuck|broke|defense|tower|fouls)$/.test(k)))
    expect([...serverKeys].sort()).toEqual(MATCH_FIELDS.map(f => f.key).sort())
    const listed = [...MATCH_FIELD_LIST.counts, ...MATCH_FIELD_LIST.yes_no, ...MATCH_FIELD_LIST.ratings, 'defense', 'tower', ...MATCH_FIELD_LIST.notes]
    expect(listed.sort()).toEqual(MATCH_FIELDS.map(f => f.key).sort())
  })
  it('the tester asked for FUEL counts, defense, where it shoots and got stuck: all present, and the three capabilities are kept elsewhere', () => {
    for (const k of ['auto_fuel', 'teleop_fuel', 'defense', 'defense_rating', 'stuck', 'tower', 'driver_skill']) expect(MATCH_FIELDS.some(f => f.key === k), k).toBe(true)
    expect(readFileSync(new URL('../src/scouting/model.js', import.meta.url), 'utf8')).toMatch(/key: 'trench'/)
  })
})

describe('counts: absent is not zero', () => {
  it('stepping from not recorded', () => {
    expect(stepCount(undefined, 1)).toBe(1)
    expect(stepCount(undefined, 5)).toBe(5)
    expect(stepCount(undefined, -1)).toBeUndefined()
    expect(stepCount(0, -1)).toBe(0)
    expect(stepCount(3, -1)).toBe(2)
    expect(stepCount(498, 5)).toBe(500)
  })
  it('cleanMatch drops unrecorded and wrong-typed values and keeps 0', () => {
    expect(cleanMatch({ teleop_fuel: 0, auto_fuel: undefined, tower: 'level2', stuck: null, driver_skill: 0, fouls: '  ', bogus: 1 })).toEqual({ teleop_fuel: 0, tower: 'level2' })
    expect(recordedCount({})).toBe(0)
    expect(recordedCount({ teleop_fuel: 0 })).toBe(1)
  })
})

describe('team summary', () => {
  const rows = [
    obs('a', 'qm1', { teleop_fuel: 10, auto_fuel: 2, tower: 'level2', stuck: 'no', driver_skill: 4 }),
    obs('b', 'qm1', { teleop_fuel: 20, auto_fuel: 4, tower: 'level2', stuck: 'yes' }), // two scouts, one match
    obs('a', 'qm2', { teleop_fuel: 0, tower: 'level3', stuck: 'no', died: 'no' }),
    obs('a', 'qm3', { tower: 'did_not_see', stuck: 'did_not_see' }),
  ]
  const s = teamMatchSummary(rows, 101)
  it('one value per match: qm1 teleop is the median of 10 and 20, so the team median over qm1 and qm2 is 7.5', () => {
    expect(s.teleop_fuel).toEqual({ median: 7.5, n: 2 })
    expect(fmtMedian(s.teleop_fuel)).toBe('7.5')
  })
  it('an observed 0 counts; a match with nothing recorded does not add a 0', () => {
    expect(s.auto_fuel).toEqual({ median: 3, n: 1 })
    expect(s.totalFuel).toEqual({ median: 9, n: 2 }) // qm1: median(2+10, 4+20) = 18; qm2: 0 + teleop 0 = 0; median(18, 0) = 9
  })
  it('disagreeing scouts make a disputed match, excluded from the stuck rate; did not see is not a no', () => {
    expect(s.stuck).toMatchObject({ yes: 0, no: 1, n: 1, disputed: 1, unseen: 1 })
  })
  it('TOWER: best and median over decisive matches; did not see is not level 0', () => {
    expect(s.tower).toMatchObject({ best: 3, median: 2.5, n: 2 })
  })
  it('a team with no match fields reads no matches, and every median is null (never 0)', () => {
    const none = teamMatchSummary([obs('a', 'qm1', undefined)], 101)
    expect(none.matches).toBe(0)
    expect(none.teleop_fuel.median).toBeNull()
    expect(none.troubleRate.rate).toBeNull()
  })
  it('pending (unconfirmed) rows are the caller\'s to exclude; external footage is excluded here', () => {
    const ext = obs('c', '2026cabb_qm1', { teleop_fuel: 99 }, { payload: { answers: {}, source: 'video', video_url: 'https://x', source_scope: 'external', source_event: '2026cabb', match: { teleop_fuel: 99 } } })
    expect(teamMatchSummary([...rows, ext], 101).teleop_fuel.median).toBe(7.5)
  })
  it('a correction replaces the scout\'s earlier answer for that match', () => {
    const fixed = { ...rows[0], version: 2, updated_at: '2026-10-30T19:00:00Z', payload: { ...rows[0].payload, match: { ...rows[0].payload.match, teleop_fuel: 30 } } }
    expect(teamMatchSummary([...rows, fixed], 101).teleop_fuel.median).toBe(12.5) // qm1 median(30,20)=25, qm2 0
  })
})

describe('pick-list filters: unknown never passes', () => {
  const known = teamMatchSummary([obs('a', 'qm1', { teleop_fuel: 12, tower: 'level2', stuck: 'no', driver_skill: 4, defense: 'some' })], 101)
  const unknown = teamMatchSummary([obs('a', 'qm1', {})], 101)
  it('a team meeting each minimum passes; the same filters fail a team with nothing recorded', () => {
    const f = { min_fuel: 10, min_tower: 2, max_trouble: 10, min_driver: 4, defense: true }
    expect(passesMatchFilters(known, f)).toBe(true)
    expect(passesMatchFilters(unknown, f)).toBe(false)
    for (const [k, v] of Object.entries(f)) expect(passesMatchFilters(unknown, { [k]: v }), k).toBe(false)
  })
  it('a minimum above the value fails; an empty filter passes everyone', () => {
    expect(passesMatchFilters(known, { min_fuel: 13 })).toBe(false)
    expect(passesMatchFilters(unknown, {})).toBe(true)
    expect(passesMatchFilters(unknown, { min_fuel: '' })).toBe(true)
  })
})
