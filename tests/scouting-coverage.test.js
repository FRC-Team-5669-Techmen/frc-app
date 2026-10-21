import { describe, it, expect } from 'vitest'
import { eventCoverage, filterCoverage } from '../src/scouting/coverage.js'
const obs = (match, member, answer, extra = {}) => ({ id: `${match}-${member}`, event_id: 'e', kind: 'observation', team_number: 5669, member_id: member, match_key: match, payload: { source: 'live', answers: { trench: answer, bump: answer, ground_intake: answer } }, ...extra })
describe('event evidence coverage', () => {
  it('does not count duplicate scouts, prior-event footage, or local work as extra current matches', () => {
    const rows = [obs('qm1', 'a', 'yes'), obs('qm1', 'b', 'yes'), obs('qm2', 'a', 'did_not_see'), obs('qm3', 'a', 'yes', { localStatus: 'local' }), obs('2026old_qm1', 'a', 'yes', { payload: { source: 'video', source_scope: 'external', source_event: '2026old', answers: { trench: 'yes' } } })]
    const [coverage] = eventCoverage(rows)
    expect(coverage).toMatchObject({ currentMatches: 2, priorMatches: 1, localObservations: 1, thin: true, pit: false })
    expect(coverage.trials[0]).toMatchObject({ denominator: 1, percent: 100 })
  })
  it('flags disputed trials and thin evidence independently, and clears the flags with sufficient observations', () => {
    const disputed = eventCoverage([obs('qm1', 'a', 'yes'), obs('qm1', 'b', 'no')])
    expect(filterCoverage(disputed, 'disputed')).toHaveLength(1)
    expect(disputed[0].trials[0].denominator).toBe(0)
    const complete = eventCoverage([obs('qm1', 'a', 'yes'), obs('qm2', 'a', 'no'), obs('qm3', 'a', 'yes'), { kind: 'pit', team_number: 5669 }])
    expect(filterCoverage(complete, 'thin')).toEqual([])
    expect(filterCoverage(complete, 'disputed')).toEqual([])
    expect(filterCoverage(complete, 'pit')).toEqual([])
    expect(complete[0]).toMatchObject({ pit: true, thin: false, currentMatches: 3 })
  })
  it('does not mark an assignment covered by another scout or by an unsynced observation', () => {
    const assignment = { id: 'assigned', kind: 'assignment', team_number: 5669, match_key: 'qm1', payload: { assignee: 'a', status: 'assigned' } }
    expect(eventCoverage([assignment, obs('qm1', 'b', 'yes')])[0].outstanding).toBe(1)
    expect(eventCoverage([assignment, obs('qm1', 'a', 'yes', { localStatus: 'syncing' })])[0].outstanding).toBe(1)
    expect(eventCoverage([assignment, obs('qm1', 'a', 'yes')])[0].outstanding).toBe(0)
    expect(eventCoverage([{ ...assignment, payload: { ...assignment.payload, status: 'cancelled' } }])[0].outstanding).toBe(0)
  })
})
