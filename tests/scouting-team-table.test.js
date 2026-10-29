// The Teams tab table's pure rules (src/scouting/teamTable.js): its figures
// come from the existing helpers, empty is "--" and sorts last, ties go to
// the lower team number, and the remembered sort survives bad storage.
import { describe, it, expect } from 'vitest'
import { TABLE_COLUMNS, DEFAULT_SORT, SORT_STORAGE_KEY, teamTableRows, sortTeamRows, nextSort, readSort, writeSort } from '../src/scouting/teamTable.js'
import { teamMatchSummary, fmtMedian, towerLabel, fmtRate } from '../src/scouting/match.js'
import { superSummary, fmtMean } from '../src/scouting/superscout.js'
import { reliability, CAPABILITIES } from '../src/scouting/model.js'

const EVENT = 'e1'
let n = 0
const obs = (team, match, member, payload) => ({ id: `r${++n}`, event_id: EVENT, member_id: member, kind: 'observation', team_number: team, match_key: match, version: 1, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', payload: { answers: {}, notes: '', source: 'live', video_url: '', ...payload } })
const team = (t, name) => ({ id: `t${t}`, event_id: EVENT, member_id: 'm', kind: 'team', team_number: t, match_key: null, version: 1, payload: { name } })
const records = [
  team(100, 'Alpha'), team(200, 'Bravo'), team(300, 'Charlie'), team(400, 'Delta'),
  obs(100, 'qm1', 'a', { answers: { trench: 'yes' }, match: { auto_fuel: 2, teleop_fuel: 10, tower: 'level1', stuck: 'no', defense: 'some' } }),
  obs(100, 'qm1', 'b', { answers: { trench: 'yes' }, match: { auto_fuel: 4, teleop_fuel: 12, tower: 'level1', stuck: 'no' } }),
  obs(100, 'qm2', 'a', { answers: { trench: 'no' }, match: { auto_fuel: 0, teleop_fuel: 20, tower: 'level3', stuck: 'yes', defense: 'none' } }),
  obs(200, 'qm1', 'c', { answers: { trench: 'yes' }, match: { auto_fuel: 0, teleop_fuel: 0, tower: 'none' } }),
  obs(300, 'qm2', 'c', { match: { auto_fuel: 5, teleop_fuel: 11 } }),
  obs(200, 'qm3', 'd', { role: 'super', alliance: 'red', super: { driver_skill: 4 } }),
  obs(200, 'qm4', 'e', { role: 'super', alliance: 'red', super: { driver_skill: 5 } }),
]
const numbers = [100, 200, 300, 400]
const nameFor = t => records.find(r => r.kind === 'team' && r.team_number === t)?.payload.name ?? ''
const rows = teamTableRows(numbers, records, records, nameFor)
const by = t => rows.find(r => r.team === t)
const order = sort => sortTeamRows(rows, sort).map(r => r.team)

describe('the team table reads the existing rules', () => {
  it('each cell is the existing helper formatted the existing way', () => {
    for (const t of numbers) {
      const s = teamMatchSummary(records, t), sup = superSummary(records, t)
      expect(by(t).cells.fuel).toBe(fmtMedian(s.totalFuel))
      expect(by(t).cells.tower).toBe(towerLabel(s.tower.best))
      expect(by(t).cells.trouble).toBe(fmtRate(s.troubleRate))
      expect(by(t).cells.defense).toBe(fmtRate(s.defense))
      expect(by(t).cells.driver).toBe(fmtMean(sup.driver_skill))
      for (const c of CAPABILITIES) {
        const r = reliability(records, t, c.key)
        expect(by(t).cells[`cap_${c.key}`]).toBe(r.denominator ? `${r.yes}/${r.denominator}` : '--')
      }
    }
  })
  it('known figures: 100 has median FUEL 17 over two matches, L3, 1 trouble in 2; 200 a super-scout driver mean of 4.5', () => {
    // qm1: scouts 12 and 16 -> 14; qm2: 20 -> median(14, 20) = 17.
    expect(by(100).cells).toMatchObject({ team: '100', name: 'Alpha', matches: '2', fuel: '17', tower: 'L3', trouble: '50%', cap_trench: '1/2' })
    expect(by(200).cells).toMatchObject({ fuel: '0', tower: 'None', driver: '4.5', cap_trench: '1/1' })
  })
  it('a team with nothing recorded reads -- in every figure, never 0 (against 200 observed scoring 0)', () => {
    const figures = Object.entries(by(400).cells).filter(([k]) => !['team', 'name'].includes(k))
    expect(figures).toHaveLength(TABLE_COLUMNS.length - 2)
    expect(figures.every(([, v]) => v === '--')).toBe(true)
    expect(Object.values(by(400).values).filter(v => v === 0)).toHaveLength(0)
    expect(by(200).values.fuel).toBe(0)
  })
  it('super-scout notes are not scouted matches', () => {
    expect(by(200).cells.matches).toBe('1')
  })
})

describe('sorting', () => {
  it('defaults to team number ascending', () => {
    expect(DEFAULT_SORT).toEqual({ key: 'team', dir: 'asc' })
    expect(order(DEFAULT_SORT)).toEqual([100, 200, 300, 400])
  })
  it('FUEL highest first, an observed 0 above an empty value, empty last', () => {
    expect(order({ key: 'fuel', dir: 'desc' })).toEqual([100, 300, 200, 400])
  })
  it('ascending keeps empty last too (positive control: 0 sorts first, the empty team does not)', () => {
    expect(order({ key: 'fuel', dir: 'asc' })).toEqual([200, 300, 100, 400])
  })
  it('ties go to the lower team number in either direction', () => {
    const tied = [{ team: 9, values: { fuel: 5 } }, { team: 3, values: { fuel: 5 } }, { team: 7, values: { fuel: null } }, { team: 1, values: { fuel: null } }]
    expect(sortTeamRows(tied, { key: 'fuel', dir: 'desc' }).map(r => r.team)).toEqual([3, 9, 1, 7])
    expect(sortTeamRows(tied, { key: 'fuel', dir: 'asc' }).map(r => r.team)).toEqual([3, 9, 1, 7])
  })
  it('names sort as text', () => {
    expect(order({ key: 'name', dir: 'desc' })).toEqual([400, 300, 200, 100])
  })
  it('a header click flips its own column and starts another in its first direction', () => {
    expect(nextSort(DEFAULT_SORT, 'team')).toEqual({ key: 'team', dir: 'desc' })
    expect(nextSort(DEFAULT_SORT, 'fuel')).toEqual({ key: 'fuel', dir: 'desc' })
    expect(nextSort({ key: 'fuel', dir: 'desc' }, 'fuel')).toEqual({ key: 'fuel', dir: 'asc' })
    expect(nextSort({ key: 'fuel', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' })
    expect(nextSort(DEFAULT_SORT, 'nope')).toBe(DEFAULT_SORT)
  })
})

describe('the remembered sort', () => {
  const memory = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), m } }
  it('round-trips through storage', () => {
    const s = memory()
    writeSort(s, { key: 'tower', dir: 'asc' })
    expect(s.m.get(SORT_STORAGE_KEY)).toBe('{"key":"tower","dir":"asc"}')
    expect(readSort(s)).toEqual({ key: 'tower', dir: 'asc' })
  })
  it('falls back to the default for nothing, junk, an unknown column or a throwing storage', () => {
    const s = memory()
    expect(readSort(s)).toEqual(DEFAULT_SORT)
    s.setItem(SORT_STORAGE_KEY, '{oops'); expect(readSort(s)).toEqual(DEFAULT_SORT)
    s.setItem(SORT_STORAGE_KEY, '{"key":"epa","dir":"desc"}'); expect(readSort(s)).toEqual(DEFAULT_SORT)
    s.setItem(SORT_STORAGE_KEY, '{"key":"fuel","dir":"up"}'); expect(readSort(s)).toEqual(DEFAULT_SORT)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(readSort(broken)).toEqual(DEFAULT_SORT)
    expect(() => writeSort(broken, { key: 'fuel', dir: 'desc' })).not.toThrow()
    expect(readSort(null)).toEqual(DEFAULT_SORT)
  })
})
