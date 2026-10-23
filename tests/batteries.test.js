// The battery log's rules (src/batteries.js, migration 0026, ledger 0017):
// the Check flag, match-ready, worst first, not recorded is never zero, and
// the CSV. Every flag is asserted both ways on the same battery.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CHECK_THRESHOLDS, summarize, batteryBoard, applyFilter, readNumber, runProblem, runArgs, canEditRun, csvRows, CSV_COLUMNS } from '../src/batteries.js'
import { toCsv } from '../src/csv.js'

const B = (id, extra = {}) => ({ id, label: id.toUpperCase(), status: 'competition', charge_state: 'charged', ...extra })
let n = 0
const R = (battery_id, hoursAgo, extra = {}) => ({ id: `r${n++}`, battery_id, member_id: 'm1', ran_at: new Date(Date.UTC(2026, 9, 30, 12) - hoursAgo * 3600e3).toISOString(), kind: 'match', voltage_before: 12.9, voltage_after: 11.9, resistance_mohm: 12, brownout: 'no', ...extra })

describe('the Check flag', () => {
  it('thresholds are one named constant with the proposed defaults', () => {
    expect(CHECK_THRESHOLDS).toEqual({ BROWNOUT_LOOKBACK: 3, MIN_RESTING_VOLTS: 12.5, MAX_RESISTANCE_MOHM: 20 })
    expect(Object.isFrozen(CHECK_THRESHOLDS)).toBe(true)
    expect(readFileSync(new URL('../src/batteries.js', import.meta.url), 'utf8')).toMatch(/PROPOSED DEFAULTS/)
  })
  it('a healthy battery is not flagged and is match-ready (positive control)', () => {
    const s = summarize(B('b1'), [R('b1', 1), R('b1', 2)])
    expect(s.check).toBe(false)
    expect(s.matchReady).toBe(true)
  })
  it('a brownout in the last three runs flags; the same brownout as the fourth-newest does not', () => {
    const runs = [R('b1', 4, { brownout: 'yes' }), R('b1', 3), R('b1', 2), R('b1', 1)]
    expect(summarize(B('b1'), runs).check).toBe(false)
    expect(summarize(B('b1'), runs.slice(0, 3)).check).toBe(true)
    expect(summarize(B('b1'), runs).brownouts).toBe(1)
  })
  it('a resting voltage before a match under 12.5 flags; 12.5 exactly does not; a bench test reading does not count', () => {
    expect(summarize(B('b1'), [R('b1', 1, { voltage_before: 12.49 })]).check).toBe(true)
    expect(summarize(B('b1'), [R('b1', 1, { voltage_before: 12.5 })]).check).toBe(false)
    expect(summarize(B('b1'), [R('b1', 1, { kind: 'bench_test', voltage_before: 11.0 })]).check).toBe(false)
  })
  it('resistance over 20 milliohms flags; 20 exactly does not', () => {
    expect(summarize(B('b1'), [R('b1', 1, { resistance_mohm: 20.1 })]).check).toBe(true)
    expect(summarize(B('b1'), [R('b1', 1, { resistance_mohm: 20 })]).check).toBe(false)
  })
  it('a measurement not taken is null, never 0: no voltage means not flagged for voltage and shows as not measured', () => {
    const s = summarize(B('b1'), [R('b1', 1, { voltage_before: null, resistance_mohm: null })])
    expect(s.restingVolts).toBeNull()
    expect(s.resistance).toBeNull()
    expect(s.check).toBe(false)
    expect(readNumber('')).toBeNull()
    expect(readNumber('   ')).toBeNull()
    expect(readNumber('0')).toBe(0)
    expect(readNumber('12,6')).toBe(12.6)
    expect(Number.isNaN(readNumber('abc'))).toBe(true)
  })
  it('a retired battery is never flagged and never match-ready', () => {
    const s = summarize(B('b1', { status: 'retired' }), [R('b1', 1, { brownout: 'yes' })])
    expect(s.check).toBe(false)
    expect(s.matchReady).toBe(false)
  })
})

describe('match-ready and the board order', () => {
  const batteries = [B('a1'), B('a2'), B('a3', { charge_state: 'charging' }), B('a4', { status: 'practice' }), B('a5', { status: 'retired' }), B('a10')]
  const runs = [R('a2', 1, { brownout: 'yes' }), R('a10', 1, { voltage_before: 12.1, brownout: 'yes' }), R('a1', 1)]
  const board = batteryBoard(batteries, runs)
  it('worst first: the most reasons first, flagged before healthy, retired last, natural label order otherwise', () => {
    expect(board.map((b) => b.label)).toEqual(['A10', 'A2', 'A1', 'A3', 'A4', 'A5'])
  })
  it('Match-ready shows only competition batteries that are charged and unflagged (both counts)', () => {
    expect(applyFilter(board, 'ready').map((b) => b.label)).toEqual(['A1'])
    expect(applyFilter(board, 'check').map((b) => b.label)).toEqual(['A10', 'A2'])
    expect(applyFilter(board, 'all')).toHaveLength(5) // In service: every one but the retired A5
    expect(applyFilter(board, 'retired').map((b) => b.label)).toEqual(['A5'])
  })
})

describe('the run form', () => {
  it('a complete run passes; each bad value is caught', () => {
    const ok = { battery_id: 'b1', kind: 'match', voltage_before: 12.9, voltage_after: 11.8, resistance_mohm: 14, minutes: 3, performance: 4 }
    expect(runProblem(ok)).toBeNull()
    expect(runProblem({ ...ok, battery_id: '' })).toMatch(/battery/)
    expect(runProblem({ ...ok, kind: 'race' })).toMatch(/run was/)
    expect(runProblem({ ...ok, voltage_before: 17 })).toMatch(/between 0 and 16/)
    expect(runProblem({ ...ok, voltage_before: NaN })).toMatch(/number/)
    expect(runProblem({ ...ok, minutes: 2.5 })).toMatch(/whole/)
    expect(runProblem({ ...ok, performance: 6 })).toMatch(/1 to 5/)
    expect(runProblem({ battery_id: 'b1', kind: 'bench_test', voltage_before: null })).toBeNull()
  })
  it('the call carries the database argument names and blanks as null', () => {
    const a = runArgs({ battery_id: 'b1', kind: 'match', match_label: ' qm4 ', voltage_before: null, brownout: '', notes: '  ' })
    expect(a).toEqual({ p_battery: 'b1', p_kind: 'match', p_event: null, p_match: 'qm4', p_voltage_before: null, p_voltage_after: null, p_resistance: null, p_minutes: null, p_brownout: 'unknown', p_performance: null, p_notes: null })
  })
  it('the author corrects a run for 24 hours; another student never; staff always', () => {
    const now = Date.UTC(2026, 9, 30, 12)
    const run = { member_id: 'm1', created_at: new Date(now - 23 * 3600e3).toISOString() }
    expect(canEditRun(run, { uid: 'm1', isStaff: false, now })).toBe(true)
    expect(canEditRun(run, { uid: 'm2', isStaff: false, now })).toBe(false)
    expect(canEditRun({ ...run, created_at: new Date(now - 25 * 3600e3).toISOString() }, { uid: 'm1', isStaff: false, now })).toBe(false)
    expect(canEditRun({ ...run, created_at: new Date(now - 25 * 3600e3).toISOString() }, { uid: 'm2', isStaff: true, now })).toBe(true)
  })
})

describe('the CSV', () => {
  it('one row per run, newest first, with the label and name, and blanks for not measured', () => {
    const rows = csvRows([B('b1')], [R('b1', 5, { voltage_before: null }), R('b1', 1, { notes: '=cmd' })], { nameOf: () => 'Sam' })
    expect(rows.map((r) => r.battery)).toEqual(['B1', 'B1'])
    expect(rows[1].voltage_before).toBeNull()
    const csv = toCsv(CSV_COLUMNS, rows)
    expect(csv.split('\r\n')[0]).toContain('Resting V before')
    expect(csv).toContain("'=cmd") // the formula guard (decision 18)
    expect(csv.split('\r\n')[2]).toMatch(/^B1,Competition,[^,]+,Match,,,,11\.9,12,/)
  })
})

describe('the page and the connector use these rules, not a copy', () => {
  it('BatteriesPage and the connector both import src/batteries.js', () => {
    expect(readFileSync(new URL('../src/BatteriesPage.jsx', import.meta.url), 'utf8')).toMatch(/from '\.\/batteries'/)
    expect(readFileSync(new URL('../api/_lib/connector/tools.js', import.meta.url), 'utf8')).toMatch(/src\/batteries\.js/)
  })
})
