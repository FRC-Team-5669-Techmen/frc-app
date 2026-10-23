// Download spreadsheet (src/scouting/spreadsheet.js, ledger 0017): readable
// CSVs beside the JSON archive. Not recorded is an empty cell, never 0;
// one row per observation; team rows from confirmed records only.
import { describe, it, expect } from 'vitest'
import { toCsv } from '../src/csv.js'
import { OBSERVATION_COLUMNS, TEAM_COLUMNS, observationRows, teamRows } from '../src/scouting/spreadsheet.js'

const obs = (id, member, team, match, m, answers = {}, extra = {}) => ({ id, kind: 'observation', event_id: 'ev', member_id: member, team_number: team, match_key: match, version: 1, updated_at: '2026-10-30T18:00:00Z', payload: { answers, source: 'live', notes: '', match: m }, ...extra })
const recs = [
  obs('1', 'a', 1538, 'qm10', { teleop_fuel: 12, tower: 'level2', stuck: 'no' }, { trench: 'yes' }),
  obs('2', 'a', 1538, 'qm2', { teleop_fuel: 0, stuck: 'did_not_see' }),
  obs('3', 'b', 4414, 'qm2', {}),
  { id: '1', kind: 'observation', event_id: 'ev', member_id: 'a', team_number: 1538, match_key: 'qm10', version: 2, updated_at: '2026-10-30T19:00:00Z', payload: { answers: { trench: 'yes' }, source: 'live', notes: '=HYPERLINK("x")', match: { teleop_fuel: 14, tower: 'level2', stuck: 'no' } } },
]
const names = { memberName: id => ({ a: 'Riley', b: 'Sam' })[id], nameFor: n => ({ 1538: 'The Holy Cows' })[n] ?? '' }

describe('observations sheet', () => {
  const rows = observationRows(recs, names)
  it('one row per observation (the latest version), sorted by team then match order', () => {
    expect(rows.map(r => `${r.team} ${r.match} v${r.version}`)).toEqual(['1538 qm2 v1', '1538 qm10 v2', '4414 qm2 v1'])
    expect(rows[1].m_teleop_fuel).toBe(14)
    expect(rows[1].scout).toBe('Riley')
  })
  it('an observed 0 is 0; not recorded is empty; did not see is written out', () => {
    const csv = toCsv(OBSERVATION_COLUMNS, rows).split('\r\n')
    const head = csv[0].replace('﻿', '').split(',')
    const col = name => head.indexOf(name)
    const row2 = csv[1].split(',')
    expect(row2[col('FUEL scored in teleop')]).toBe('0')
    expect(row2[col('FUEL scored in auto')]).toBe('')
    expect(row2[col('Got stuck')]).toBe('did not see')
    expect(csv[3].split(',')[col('FUEL scored in teleop')]).toBe('')
  })
  it('free text is formula-guarded (decision 18)', () => {
    expect(toCsv(OBSERVATION_COLUMNS, rows)).toContain(`"'=HYPERLINK(""x"")"`)
  })
  it('has a column per match field and per capability, and the scout, match and team', () => {
    const heads = OBSERVATION_COLUMNS.map(c => c[1])
    for (const h of ['Team', 'Match', 'Scout', 'TOWER level reached', 'Passes under the TRENCH', 'Fouls or cards']) expect(heads).toContain(h)
  })
})

describe('teams sheet', () => {
  it('one row per team with medians from one value per match; a team with nothing recorded reads empty, not 0', () => {
    const rows = teamRows(recs, names)
    expect(rows.map(r => r.team)).toEqual([1538, 4414])
    expect(rows[0]).toMatchObject({ team_name: 'The Holy Cows', matches: 2, teleop_fuel: 7, tower_best: 2, c_trench: 100, c_trench_n: 1 })
    expect(rows[1].teleop_fuel).toBeNull()
    expect(rows[1].matches).toBe(0)
    const csv = toCsv(TEAM_COLUMNS, rows).split('\r\n')
    expect(csv[2].split(',')[TEAM_COLUMNS.findIndex(c => c[0] === 'teleop_fuel')]).toBe('')
  })
  it('the caller passes confirmed records; an unsynced row given separately does not change the team sheet', () => {
    const local = obs('9', 'a', 1538, 'qm20', { teleop_fuel: 99 }, {}, { localStatus: 'local' })
    expect(teamRows(recs, names)[0].teleop_fuel).toBe(7)
    expect(observationRows([...recs, local], names).find(r => r.match === 'qm20').status).toMatch(/not synced/)
  })
})
