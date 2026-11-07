import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { sessionsFromEvents, computeHoursMs } from '../src/hoursUtils.js'
import * as weekly from '../src/weeklyHours.js'
import { batteryBoard } from '../src/batteries.js'
import * as table from '../src/scouting/teamTable.js'

const H = 3600000
const ev = (id, type, time, more = {}) => ({ id, type, event_time: time, category: 'build', ...more })

describe('feedback: hours pause', () => {
  it('subtracts only pause overlap inside the capped session, without breaking presence', () => {
    const rows = [ev('in', 'in', '2026-11-03T20:00:00Z', { pauses: [
      { start: '2026-11-03T21:00:00Z', end: '2026-11-03T21:30:00Z' },
      { start: '2026-11-03T22:00:00Z', end: '2026-11-03T22:30:00Z' },
    ] }), ev('out', 'out', '2026-11-03T23:00:00Z')]
    expect(computeHoursMs(rows)).toBe(2 * H)
    expect(sessionsFromEvents(rows)[0]).toMatchObject({ ms: 2 * H, pausedMs: H, open: false })
    expect(computeHoursMs(rows.map(r => ({ ...r, pauses: [] })))).toBe(3 * H)
  })
  it('open pauses end at the actual checkout or cap; overlaps never subtract twice', () => {
    const rows = [ev('in', 'in', '2026-11-03T20:00:00Z', { pauses: [
      { start: '2026-11-03T21:00:00Z', end: '2026-11-03T23:00:00Z' },
      { start: '2026-11-03T22:00:00Z', end: null },
    ] }), ev('out', 'out', '2026-11-04T10:00:00Z')]
    expect(sessionsFromEvents(rows)[0]).toMatchObject({ ms: H, pausedMs: 11 * H, wasCapped: true })
  })
  it('a live paused session resumes without a second IN', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-04T00:00:00Z'))
    try {
      const rows = [ev('in', 'in', '2026-11-03T20:00:00Z', { pauses: [{ start: '2026-11-03T21:00:00Z', end: null }] })]
      expect(sessionsFromEvents(rows)[0]).toMatchObject({ ms: H, pausedMs: 3 * H, paused: true, open: true })
    } finally { vi.useRealTimers() }
  })
})

describe('feedback: verified weekly hours in Los Angeles', () => {
  it('counts verified logs by worked date through pending/verified/rejected transitions', () => {
    const now = Date.parse('2026-11-06T22:00:00Z')
    const logged = [{ date: '2026-11-02', hours: 2, status: 'pending' }, { date: '2026-11-01', hours: 50, status: 'verified' }]
    expect(weekly.weeklyHours({ events: [], logged, now }).hours).toBe(0)
    logged[0].status = 'verified'
    expect(weekly.weeklyHours({ events: [], logged, now }).hours).toBe(2)
    logged[0].status = 'rejected'
    expect(weekly.weeklyHours({ events: [], logged, now }).hours).toBe(0)
  })
  it('uses LA Monday through Sunday across DST and foreign device zones', () => {
    expect(weekly.weekRange(Date.parse('2026-11-02T07:30:00Z'))).toEqual({ from: '2026-10-26', to: '2026-11-02' })
    expect(weekly.weekRange(Date.parse('2026-11-02T08:00:00Z'))).toEqual({ from: '2026-11-02', to: '2026-11-09' })
    const events = [ev('a', 'in', '2026-11-02T07:30:00Z'), ev('b', 'out', '2026-11-02T09:30:00Z')]
    expect(weekly.weeklyHours({ events, logged: [], now: Date.parse('2026-11-06T22:00:00Z') }).hours).toBe(0)
    events[0].event_time = '2026-11-02T08:30:00Z'
    expect(weekly.weeklyHours({ events, logged: [], now: Date.parse('2026-11-06T22:00:00Z') }).hours).toBe(1)
  })
})

describe('feedback: good batteries', () => {
  it('puts measured good batteries first; unknown performance is never good', () => {
    const bats = ['unknown', 'bad', 'good'].map(id => ({ id, label: id, status: 'competition', charge_state: 'charged' }))
    const run = (id, i, performance, brownout = 'no') => ({ battery_id: id, ran_at: `2026-11-0${i + 1}T20:00:00Z`, kind: 'match', performance, brownout, voltage_before: 12.9, resistance_mohm: 15 })
    const runs = [run('bad', 1, 1, 'yes'), ...[1, 2, 3].map(i => run('good', i, 5))]
    const board = batteryBoard(bats, runs)
    expect(board[0]).toMatchObject({ id: 'good', good: true })
    expect(board.find(b => b.id === 'unknown').good).toBe(false)
    expect(board.find(b => b.id === 'bad').good).toBe(false)
    expect(batteryBoard(bats, [...runs, run('good', 5, 1, 'yes')]).find(b => b.id === 'good').good).toBe(false)
  })
})

describe('feedback: scouting filters', () => {
  it('filters confirmed table values without treating unknowns as zero', () => {
    const rows = [
      { team: 1, values: { matches: 0, fuel: null, trouble: null, tower: null } },
      { team: 2, values: { matches: 3, fuel: 25, trouble: 0, tower: 2 } },
      { team: 3, values: { matches: 1, fuel: 0, trouble: 1, tower: 0 } },
    ]
    expect(table.filterTeamRows(rows, { minFuel: '0' }).map(r => r.team)).toEqual([2, 3])
    expect(table.filterTeamRows(rows, { minMatches: '2', maxTrouble: '0', minTower: '1' }).map(r => r.team)).toEqual([2])
    expect(table.filterTeamRows(rows, {}).length).toBe(3)
  })
})

describe('pause-schema rollout', () => {
  it('retries only a missing-column response, preserving narrow projections and other errors', async () => {
    const { withSessionPauses } = await import('../src/attendanceRead.js')
    const fields = []
    const oldSchema = await withSessionPauses(async extra => { fields.push(extra); return extra ? { data: null, error: { code: '42703' } } : { data: [{ id: 'invented' }], error: null } })
    expect(fields).toEqual([',pauses', ''])
    expect(oldSchema.data).toEqual([{ id: 'invented' }])
    let attempts = 0
    const outage = await withSessionPauses(async () => { attempts++; return { data: null, error: { code: '503' } } })
    expect(attempts).toBe(1)
    expect(outage.error.code).toBe('503')
    const newSchema = await withSessionPauses(async extra => ({ data: [{ id: 'invented', pauses: extra ? [] : null }], error: null }))
    expect(newSchema.data[0].pauses).toEqual([])
  })
})

describe('permissive exclusion controls', () => {
  it('detects unknown batteries being marked Good', () => {
    const source = readFileSync(new URL('../src/batteries.js', import.meta.url), 'utf8')
    const modified = source.replace('r.good = r.status', 'r.good = true || r.status').replace(/^export /gm, '')
    expect(modified).not.toBe(source.replace(/^export /gm, ''))
    const mutant = new Function(`${modified}\nreturn batteryBoard`)()
    const fixture = [{ id: 'unknown', label: 'Unknown test battery', status: 'competition', charge_state: 'charged' }]
    const oracle = board => expect(board(fixture, [])[0].good).toBe(false)
    oracle(batteryBoard)
    expect(() => oracle(mutant)).toThrow()
  })
  it('detects unknown FUEL being treated as observed zero', () => {
    const source = table.filterTeamRows.toString()
    const changed = source.replace('v !== null && v !== undefined &&', 'true &&')
    expect(changed).not.toBe(source)
    const mutant = new Function(`return (${changed})`)()
    const fixture = [{ team: 1, values: { fuel: null } }, { team: 2, values: { fuel: 0 } }]
    const oracle = filter => expect(filter(fixture, { minFuel: '0' }).map(r => r.team)).toEqual([2])
    oracle(table.filterTeamRows)
    expect(() => oracle(mutant)).toThrow()
  })
})
