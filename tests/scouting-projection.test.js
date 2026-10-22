import { describe, it, expect } from 'vitest'
import { projectRecords } from '../src/scouting/projection'
import { aggregatePickLists, reliability } from '../src/scouting/model'
import { eventCoverage } from '../src/scouting/coverage'
const row = { id: 'r', event_id: 'e', member_id: 'm', kind: 'pick_list', version: 1, payload: { entries: [{ team: 5669, tier: 1, rank: 1 }] } }
const result = { ...row, version: 2, payload: { entries: [{ team: 5669, tier: 1, rank: 3 }] } }
const op = { member_id: 'm', event_id: 'e', record_id: 'r', status: 'local', args: { p_kind: 'pick_list', p_expected_version: 1, p_payload: result.payload }, result }
describe('confirmed evidence projection', () => {
  it('retains confirmed votes during pending corrections, then accepts a receipt without refresh', () => {
    const p = projectRecords([row], [op], 'm', 'e')
    expect(aggregatePickLists(p.confirmed)[0].rank).toBe(1)
    expect(p.visible[0].payload.entries[0].rank).toBe(3)
    expect(p.visible[0].localStatus).toBe('local')
    expect(aggregatePickLists(projectRecords([row], [{ ...op, status: 'synced' }], 'm', 'e').confirmed)[0].rank).toBe(3)
    expect(projectRecords([result], [{ ...op, status: 'synced', result: row }], 'm', 'e').confirmed).toEqual([result])
  })
  it.each(['failed', 'conflict', 'recovered'])('never uses %s proposals as confirmed evidence', status => {
    expect(projectRecords([row], [{ ...op, status }], 'm', 'e')).toEqual({ confirmed: [row], visible: [row] })
  })
  it('excludes foreign scope, mismatched receipts and unreleased recovered edits', () => {
    const invalid = [{ ...op, member_id: 'other' }, { ...op, event_id: 'elsewhere' }, { ...op, recoveredFrom: 'local' },
      { ...op, status: 'synced', result: { ...result, event_id: 'elsewhere' } }, { ...op, status: 'synced', result: { ...result, id: 'wrong' } }]
    expect(projectRecords([row, { ...row, id: 'foreign', event_id: 'elsewhere' }], invalid, 'm', 'e')).toEqual({ confirmed: [row], visible: [row] })
  })
  it('keeps coverage and reliability while an observation is edited, preserving its author', () => {
    const observed = { ...row, kind: 'observation', team_number: 5669, match_key: 'qm1', payload: { answers: { trench: 'yes' } } }
    const edit = { ...op, member_id: 'manager', args: { p_kind: 'observation', p_team: 5669, p_match: 'qm1', p_payload: { answers: { trench: 'no' } }, p_expected_version: 1 } }
    const p = projectRecords([observed], [edit], 'manager', 'e')
    expect(p.visible[0].member_id).toBe('m')
    expect(reliability(p.confirmed, 5669, 'trench')).toMatchObject({ yes: 1, no: 0, denominator: 1 })
    expect(eventCoverage(p.visible, p.confirmed)[0]).toMatchObject({ currentMatches: 1, localObservations: 1 })
  })
})
