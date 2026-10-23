// Ledger 0017 part D: the role board cell states, the auto streak and the
// 2026 match clock, against hand values. Every rule asserted both ways.
import { describe, it, expect } from 'vitest'
import { cellState, boardView, ROLE_ORDER } from '../src/roleBoard.js'
import { routineStats, routineBoard, AUTO_READY_STREAK } from '../src/autos.js'
import { PHASES, MATCH_SECONDS, matchState, inactiveFirstFrom, cueTimes, fmtClock } from '../src/matchSim.js'
import { readFileSync } from 'node:fs'

describe('role board', () => {
  it('cell states', () => {
    expect([cellState(0, 2), cellState(2, 2), cellState(3, 2), cellState(1, 0)]).toEqual(['unfilled', 'covered', 'over', 'none'])
  })
  it('the view lists every unfilled cell per day and marks mine', () => {
    const board = { slots: [
      { id: 's1', day: '2026-10-31', label: 'Quals 1', needs: { scout: 2, driver: 1 }, requests: [{ member_id: 'me', role: 'scout' }, { member_id: 'x', role: 'driver' }] },
      { id: 's2', day: '2026-11-01', label: 'Quals 7', needs: { scout: 1 }, requests: [{ member_id: 'x', role: 'scout' }, { member_id: 'y', role: 'scout' }] },
    ] }
    const v = boardView(board, 'me')
    expect(v.roles).toEqual(['driver', 'scout'])
    expect(v.days.map((d) => d.unfilled)).toEqual([[{ slot: 'Quals 1', slotId: 's1', role: 'scout', short: 1 }], []])
    expect(v.days[1].slots[0].cells.find((c) => c.role === 'scout').state).toBe('over')
    expect(v.days[0].slots[0].cells.find((c) => c.role === 'scout').mine).toBe(true)
    expect(v.unfilledCells).toBe(1)
    expect(v.mine).toBe(1)
  })
  it('the role list matches 0028 (battery captain included) and the roster page', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0028_role_interest_board.sql', import.meta.url), 'utf8')
    const check = /_role_valid\(p_role text\)[\s\S]*?select p_role in \(([^)]*)\)/.exec(sql)[1]
    expect([...check.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()).toEqual([...ROLE_ORDER].sort())
    const page = readFileSync(new URL('../src/RostersPage.jsx', import.meta.url), 'utf8')
    expect(page).toMatch(/key: 'battery_captain'/)
  })
})

describe('auto streaks', () => {
  const R = (i, result) => ({ routine_id: 'a', result, ran_at: new Date(Date.UTC(2026, 9, 20, 12, i)).toISOString() })
  it('the streak counts successes from the newest run back to the first non-success', () => {
    const runs = [R(1, 'success'), R(2, 'fail'), R(3, 'success'), R(4, 'success'), R(5, 'success')]
    const s = routineStats({ id: 'a', active: true }, runs)
    expect([s.streak, s.best, s.runCount, s.successes]).toEqual([3, 3, 5, 4])
    expect(s.rate).toBeCloseTo(0.8)
    expect(s.ready).toBe(false)
  })
  it(`competition-ready at ${AUTO_READY_STREAK} in a row; a partial breaks it`, () => {
    const five = [1, 2, 3, 4, 5].map((i) => R(i, 'success'))
    expect(routineStats({ id: 'a' }, five).ready).toBe(true)
    expect(routineStats({ id: 'a' }, [...five, R(6, 'partial')]).ready).toBe(false)
    expect(routineStats({ id: 'a' }, [...five, R(6, 'partial')]).streak).toBe(0)
    expect(routineStats({ id: 'a', active: false }, five).ready).toBe(false)
    expect(AUTO_READY_STREAK).toBe(5)
  })
  it('the rate uses the last 10 runs; no runs is null, never 0%', () => {
    const many = [...Array(12)].map((_, i) => R(i, i < 2 ? 'fail' : 'success'))
    expect(routineStats({ id: 'a' }, many).rate).toBe(1)
    expect(routineStats({ id: 'a' }, []).rate).toBeNull()
  })
  it('the board puts ready routines first', () => {
    const five = [1, 2, 3, 4, 5].map((i) => R(i, 'success'))
    const b = routineBoard([{ id: 'z', name: 'Z' }, { id: 'a', name: 'A' }], five.map((r) => ({ ...r })))
    expect(b[0].id).toBe('a')
  })
})

describe('the 2026 REBUILT match clock (Game Manual Table 6-2)', () => {
  it('phases and lengths: 20 s AUTO, 10 s TRANSITION, four 25 s SHIFTS, 30 s END GAME', () => {
    const p = PHASES.filter((x) => x.period !== 'pause')
    expect(p.map((x) => [x.label, x.seconds])).toEqual([['AUTO', 20], ['TRANSITION SHIFT', 10], ['SHIFT 1', 25], ['SHIFT 2', 25], ['SHIFT 3', 25], ['SHIFT 4', 25], ['END GAME', 30]])
    expect(p.reduce((n, x) => n + x.seconds, 0)).toBe(160)
    expect(MATCH_SECONDS).toBe(163) // with the 3 s pause while AUTO is scored
  })
  it('the official timer: 0:20 at the start of AUTO, 2:20 at the start of TELEOP, 2:10 at SHIFT 1, 0:30 at END GAME', () => {
    expect(fmtClock(matchState(0).periodClock)).toBe('0:20')
    expect(fmtClock(matchState(23).periodClock)).toBe('2:20')
    expect(matchState(33).phase.label).toBe('SHIFT 1')
    expect(fmtClock(matchState(33).periodClock)).toBe('2:10')
    expect(fmtClock(matchState(58).periodClock)).toBe('1:45')
    expect(matchState(133).phase.label).toBe('END GAME')
    expect(fmtClock(matchState(133).periodClock)).toBe('0:30')
    expect(matchState(163).done).toBe(true)
  })
  it('HUBS: both in AUTO, TRANSITION and END GAME; the alliance inactive first is inactive in SHIFTS 1 and 3 only', () => {
    expect(matchState(5, 'red').active).toEqual({ red: true, blue: true })
    expect(matchState(25, 'red').active).toEqual({ red: true, blue: true })
    expect(matchState(40, 'red').active).toEqual({ red: false, blue: true })
    expect(matchState(65, 'red').active).toEqual({ red: true, blue: false })
    expect(matchState(90, 'red').active).toEqual({ red: false, blue: true })
    expect(matchState(115, 'red').active).toEqual({ red: true, blue: false })
    expect(matchState(140, 'red').active).toEqual({ red: true, blue: true })
    expect(matchState(40, 'blue').active).toEqual({ red: true, blue: false })
  })
  it('the alliance with more AUTO FUEL goes inactive first; a tie is random', () => {
    expect(inactiveFirstFrom(8, 3)).toBe('red')
    expect(inactiveFirstFrom(3, 8)).toBe('blue')
    expect(inactiveFirstFrom(4, 4, () => 0.1)).toBe('red')
    expect(inactiveFirstFrom(4, 4, () => 0.9)).toBe('blue')
  })
  it('cues: start, every phase change, a 10 second warning, the end', () => {
    const c = cueTimes()
    expect(c[0]).toEqual({ at: 0, kind: 'start' })
    expect(c.filter((x) => x.kind === 'phase').map((x) => x.at)).toEqual([20, 23, 33, 58, 83, 108, 133])
    expect(c.find((x) => x.kind === 'warning').at).toBe(153)
    expect(c.at(-1)).toEqual({ at: 163, kind: 'end' })
  })
})
