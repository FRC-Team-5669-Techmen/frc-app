import { describe, it, expect } from 'vitest'
import { parseSchedule, planAssignments, assignmentFingerprint } from '../src/scouting/schedule.js'
const scouts = ['a', 'b', 'c'].map(id => ({ id }))
const matches = parseSchedule('qm10, 101, 102, 103\nqm2, 104, 105, 106\nqm1, 107, 108, 109')
const assignment = (match, team, assignee, status = 'assigned') => ({ id: `${match}:${team}`, version: 1, kind: 'assignment', match_key: match, team_number: team, payload: { assignee, status } })
describe('Techmen shift planning', () => {
  it('orders match numbers naturally, balances a full shift and never double-books', () => {
    expect(matches.map(m => m.key)).toEqual(['qm1', 'qm2', 'qm10'])
    const result = planAssignments({ matches, scouts })
    expect(result.proposals).toHaveLength(9); expect(result.gaps).toEqual([])
    expect(result.loads.map(s => s.count)).toEqual([3, 3, 3])
    for (const match of matches) expect(new Set(result.proposals.filter(p => p.match_key === match.key).map(p => p.payload.assignee)).size).toBe(3)
    expect(planAssignments({ matches, scouts })).toEqual(result)
  })
  it('keeps occupied slots, ignores cancelled work, respects breaks and exposes insufficient coverage', () => {
    const records = [assignment('qm1', 107, 'a'), assignment('qm1', 108, 'b', 'cancelled')]
    const result = planAssignments({ matches, scouts: [{ id: 'a' }, { id: 'b', unavailable: ['qm1'] }], records, end: 0 })
    expect(result.existing).toEqual([{ match: 'qm1', team: 107 }])
    expect(result.proposals).toHaveLength(0)
    expect(result.gaps.map(g => g.team)).toEqual([108, 109])
    const available = planAssignments({ matches, scouts: [{ id: 'a' }, { id: 'b' }], records, end: 0 })
    expect(available.proposals.map(p => [p.team_number, p.payload.assignee])).toEqual([[108, 'b']])
    expect(available.gaps).toHaveLength(1)
  })
  it('limits targets and ranges, retaining observations as covered rather than inventing extra work', () => {
    const records = [{ id: 'seen', kind: 'observation', match_key: 'qm2', team_number: 104 }]
    const r = planAssignments({ matches, scouts, records, start: 1, end: 1, teams: [104, 105] })
    expect(r.proposals.map(p => p.team_number)).toEqual([105])
    expect(r.existing.map(p => p.team)).toEqual([104])
    expect(planAssignments({ matches, scouts, start: 1, end: 1 }).proposals.map(p => p.team_number)).toEqual([104, 105, 106])
  })
  it('requires footage for film assignments and retains the actual link', () => {
    const m = [{ key: 'old_qm1', teams: [101], videos: ['https://www.youtube.com/watch?v=abcdefghijk'] }, { key: 'old_qm2', teams: [101] }]
    const r = planAssignments({ matches: m, scouts, mode: 'video' })
    expect(r.proposals).toHaveLength(1)
    expect(r.proposals[0].payload.video_url).toBe(m[0].videos[0])
    expect(r.gaps).toEqual([{ match: 'old_qm2', team: 101, reason: 'No footage link' }])
  })
  it('spots existing double-booking and invalidates a preview when assignments change', () => {
    const records = [assignment('qm1', 107, 'a'), assignment('qm1', 108, 'a')]
    expect(planAssignments({ matches, scouts, records, end: 0 }).conflicts).toEqual([{ match: 'qm1', scout: 'a' }])
    expect(assignmentFingerprint(records)).not.toBe(assignmentFingerprint([{ ...records[0], version: 2 }, records[1]]))
    expect(assignmentFingerprint(records)).toBe(assignmentFingerprint([...records].reverse()))
  })
  it('rejects duplicate matches, invalid teams and invalid ranges with useful errors', () => {
    for (const text of ['', 'qm1, -2', 'qm1, 0', 'qm1, 1, 1', 'qm1, 1\nqm1, 2']) expect(() => parseSchedule(text)).toThrow()
    expect(() => planAssignments({ matches, scouts: [] })).toThrow('Select')
    expect(() => planAssignments({ matches, scouts, start: 2, end: 0 })).toThrow('range')
  })
})
