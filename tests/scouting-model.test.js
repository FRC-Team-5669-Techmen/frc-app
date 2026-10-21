import { describe, it, expect } from 'vitest'
import { reliability, aggregatePickLists, previewComparison, filterTeams } from '../src/scouting/model.js'
const obs = (match, member, answer, extra = {}) => ({ kind: 'observation', event_id: 'e', team_number: 5669,
  member_id: member, match_key: match, version: 1, payload: { answers: answer === undefined ? {} : { trench: answer } }, ...extra })
const list = (member, entries, extra = {}) => ({ kind: 'pick_list', event_id: 'e', member_id: member, version: 1, payload: { entries }, ...extra })
describe('Techmen reliability, independently counted match trials', () => {
  const rows = [obs('qm1', 'a', 'yes'), obs('qm1', 'b', 'yes'), obs('qm2', 'a', 'no'), obs('qm2', 'b', 'did_not_see'),
    obs('qm3', 'a', 'yes'), obs('qm3', 'b', 'no'), obs('qm4', 'a', 'not_applicable'), obs('qm4', 'b', undefined), obs('qm5', 'a', 'yes')]
  it('counts two successful matches and one failed match; does not count two scouts twice', () => {
    expect(reliability(rows, 5669, 'trench')).toEqual({ yes: 2, no: 1, denominator: 3, percent: 200 / 3,
      sufficient: true, disputed: 1, didNotSee: 1, notApplicable: 1, missing: 1 })
  })
  it('a correction changes a trial, never grows the denominator', () => {
    const corrected = [...rows, obs('qm2', 'a', 'yes', { version: 2 })]
    expect(reliability(corrected, 5669, 'trench')).toMatchObject({ yes: 3, no: 0, denominator: 3, percent: 100 })
    expect(reliability(rows, 5669, 'trench').percent).toBeLessThan(100)
  })
  it('does not turn unknown, N/A, missing or another team into failed evidence', () => {
    expect(reliability([obs('1', 'a', 'did_not_see'), obs('2', 'a', 'not_applicable'), obs('3', 'a', undefined)], 5669, 'trench'))
      .toMatchObject({ denominator: 0, percent: null, sufficient: false })
    expect(reliability([obs('1', 'a', 'no')], 5669, 'trench')).toMatchObject({ denominator: 1, percent: 0, sufficient: false })
    expect(reliability(rows, 4414, 'trench').denominator).toBe(0)
    expect(reliability(rows, 5669, 'trench').denominator).toBe(3)
  })
  it('keeps events with the same match key distinct', () => {
    expect(reliability([obs('1', 'a', 'yes'), obs('1', 'a', 'no', { event_id: 'another' })], 5669, 'trench')).toMatchObject({ yes: 1, no: 1, denominator: 2, disputed: 0 })
  })
})
describe('Techmen master list', () => {
  const a = list('a', [{ team: 1, tier: 1, rank: 1 }, { team: 2, tier: 'dnp', rank: 1 }])
  const b = list('b', [{ team: 1, tier: 3, rank: 5 }, { team: 2, tier: 2, rank: 2 }])
  const c = list('c', [{ team: 1, tier: 2, rank: 2 }, { team: 3, tier: 'dnp', rank: 1 }])
  it('uses medians with all evidence retained and displays DNP separately', () => {
    const result = aggregatePickLists([a, b, c])
    expect(result.map(x => x.team)).toEqual([1, 2, 3])
    expect(result[0]).toEqual({ team: 1, tier: 2, rank: 2, support: 3, rankedVotes: 3, dnpVotes: 0, dnpFraction: 0 })
    expect(result[1]).toMatchObject({ tier: 2, rank: 2, support: 2, dnpVotes: 1, dnpFraction: 0.5 })
    expect(result[2]).toMatchObject({ tier: 'dnp', rank: null, dnpFraction: 1 })
    expect(result.some(x => x.team === 999)).toBe(false)
    expect(result.some(x => x.team === 1)).toBe(true)
  })
  it('uses only the latest author list, excluding duplicate team rows in malformed input', () => {
    const replacement = list('a', [{ team: 1, tier: 3, rank: 4 }, { team: 1, tier: 1, rank: 1 }], { version: 2 })
    expect(aggregatePickLists([a, replacement])[0]).toMatchObject({ tier: 3, rank: 4, support: 1 })
    expect(aggregatePickLists([a])[0].tier).toBe(1)
  })
})
describe('three-team comparison preview', () => {
  const entries = [{ team: 1, tier: 1, rank: 1 }, { team: 99, tier: 1, rank: 2 }, { team: 2, tier: 2, rank: 1 }, { team: 3, tier: 3, rank: 1 }]
  it('reorders only selected slots and never mutates the original', () => {
    const result = previewComparison(entries, [1, 2, 3], [{ winner: 3, loser: 1 }, { winner: 3, loser: 2 }, { winner: 2, loser: 1 }])
    expect(result.entries.map(e => e.team)).toEqual([3, 99, 2, 1])
    expect(result.entries.map(({ tier, rank }) => [tier, rank])).toEqual([[1, 1], [1, 2], [2, 1], [3, 1]])
    expect(entries.map(e => e.team)).toEqual([1, 99, 2, 3])
    expect(result.changed).toBe(true)
  })
  it('preserves original order for a three-way tie', () => {
    const result = previewComparison(entries, [3, 2, 1], [{ winner: 1, loser: 2 }, { winner: 2, loser: 3 }, { winner: 3, loser: 1 }])
    expect(result.entries).toEqual(entries)
    expect(result.changed).toBe(false)
  })
  it('requires each pair exactly once and three distinct existing teams', () => {
    expect(() => previewComparison(entries, [1, 1, 2], [])).toThrow()
    expect(() => previewComparison(entries, [1, 2, 4], [])).toThrow()
    expect(() => previewComparison(entries, [1, 2, 3], [{ winner: 1, loser: 2 }])).toThrow()
    expect(() => previewComparison(entries, [1, 2, 3], [{ winner: 1, loser: 2 }, { winner: 2, loser: 1 }])).toThrow()
  })
})
describe('capability and EPA filtering', () => {
  it('shows measured zero, rejects unknown and stale EPA, and filters documented pit claims', () => {
    const now = Date.parse('2026-10-20T12:00:00Z')
    const teams = [0, null, 10, 20].map((epa, i) => ({ kind: 'team', event_id: 'e', team_number: i + 1,
      payload: { epa, epa_fetched_at: i === 3 ? '2020-01-01T00:00:00Z' : '2026-10-20T11:00:00Z' } }))
    const pit = { kind: 'pit', event_id: 'e', team_number: 1, payload: { capabilities: { trench: 'yes' } } }
    expect(filterTeams([...teams, pit], { minEpa: 0, now }).map(r => r.team_number)).toEqual([1, 3])
    expect(filterTeams([...teams, pit], { capability: 'trench' }).map(r => r.team_number)).toEqual([1])
    expect(filterTeams(teams).length).toBe(4)
    expect(filterTeams(teams, { minEpa: 'bad', now })).toEqual([])
  })
})


describe('pit location provenance', () => {
  it('prefers an attributed pit report and flags age without erasing the address', async () => {
    const { pitLocation } = await import('../src/scouting/model.js')
    const now=Date.parse('2026-10-21T18:00:00Z')
    const records=[{kind:'team',team_number:5669,payload:{pit_location:'A12',pit_source:'nexus',pit_fetched_at:'2026-10-21T17:00:00Z'}},{kind:'pit',team_number:5669,updated_at:'2026-10-19T18:00:00Z',payload:{pit_location:'C04'}}]
    expect(pitLocation(records,5669,now)).toMatchObject({value:'C04',source:'Scout pit report',stale:true})
    expect(pitLocation(records.slice(0,1),5669,now)).toMatchObject({value:'A12',source:'Nexus',stale:false})
    expect(pitLocation(records,9999,now)).toMatchObject({value:null,at:null,source:'Not recorded'})
  })
})
