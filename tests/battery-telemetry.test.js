// Robot battery telemetry's pure rules (ledger 0031, migration 0041):
// reading the "power" object of a match file, the robot-resistance and rested
// voltage levels, the verdict tags, the fleet line that tells a worn battery
// from robot wiring, the battery board's new Check reason, and the pit load
// tests from battery-history.csv. Every rule is driven both ways.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { POWER_COLUMN_PATHS, powerColumns, readPower, parseCsv, parseBatteryHistory, planLoadTests, loadTestRows, matchBattery, parseMatchFile } from '../src/robotMatches.js'
import { ROBOT_R, REST_V, CHECK_THRESHOLDS, robotLevel, restLevel, verdictItems, verdictText, fleetLine, batteryBoard, summarize, csvRows } from '../src/batteries.js'
import { robotFile, robotPower } from '../src/dev/fixture/features/robotmatches.js'

const SQL = readFileSync(new URL('../supabase/migrations/0041_battery_telemetry.sql', import.meta.url), 'utf8')
const SAMPLE = JSON.parse(readFileSync(new URL('./fixtures/robot-match-sample.json', import.meta.url), 'utf8'))

describe('the server reads the same power fields', () => {
  it('every POWER_COLUMN_PATHS entry appears in 0041 _rm_extract_power as r.<col> from that field', () => {
    const body = SQL.slice(SQL.indexOf('function public._rm_extract_power'), SQL.indexOf('function public._rm_extract('))
    expect(body.length).toBeGreaterThan(200)
    for (const [col, field] of POWER_COLUMN_PATHS) {
      expect(body, col).toContain(`r.${col} :=`)
      expect(body, `${col} field`).toContain(`p -> '${field}'`)
    }
    expect(body).toContain("r.verdict := public._rm_text(p -> 'verdict', 2000)")
  })
  it('the robot thresholds are the ones research gave (22, 28, median + 5, 1.3x) and rested 12.7 / 12.5', () => {
    expect([ROBOT_R.OK_UNDER, ROBOT_R.PULL_OVER, ROBOT_R.FLEET_MARGIN, ROBOT_R.FLEET_RATIO, ROBOT_R.WIRING_MEDIAN]).toEqual([22, 28, 5, 1.3, 28])
    expect([REST_V.OK, REST_V.PULL_UNDER]).toEqual([12.7, CHECK_THRESHOLDS.MIN_RESTING_VOLTS])
    expect(CHECK_THRESHOLDS.MAX_RESISTANCE_MOHM).toBe(20) // the Beak threshold is untouched
  })
})

describe('reading the power object', () => {
  const file = robotFile({ startedAt: '2026-10-28T10:00:00', brownouts: 1, extra: { power: { ...robotPower({ rest: 12.81, r: 17.4, min: 6.71, amps: 251, brownouts: 1, sticky: [{ device: 'shooter 16', faults: ['undervoltage'] }] }), futurePower: 1 } } })
  it('fills the typed columns from a file with power (positive control)', () => {
    expect(powerColumns(file)).toMatchObject({ rest_volts_before: 12.81, robot_resistance_mohm: 17.4, min_volts: 6.71, amps_at_min: 251, peak_amps: 290, dips_below_7v: 0, verdict: 'OK' })
    expect(powerColumns(file).power.futurePower).toBe(1)
  })
  it('a file with no power (the robot code before Oct 28) gives every column null, never 0', () => {
    expect(Object.values(powerColumns(SAMPLE)).every((v) => v === null)).toBe(true)
    expect(readPower(SAMPLE.power)).toBeNull()
    expect(parseMatchFile(JSON.stringify(SAMPLE), 'x.json').ok).toBe(true)
  })
  it('a number out of range or sent as text is not a reading; minVolts falls back to pdhMinVolts', () => {
    const c = powerColumns({ power: { resistanceMilliOhm: 900, restVoltsBefore: '12.8', pdhMinVolts: 9.1, ampsAtMin: 2e7 } })
    expect(c).toMatchObject({ robot_resistance_mohm: null, rest_volts_before: null, min_volts: 9.1, amps_at_min: null })
    expect(powerColumns({ power: { resistanceMilliOhm: 499 } }).robot_resistance_mohm).toBe(499)
  })
  it('readPower: top draw and branch drop largest first, snapshots and sticky faults kept, unknown shapes ignored', () => {
    const p = readPower(file.power)
    expect(p.topDraw.map((x) => x.mechanism)).toEqual(['drive', 'shooter', 'spindexer', 'uptake'])
    expect(p.branchDrop[0]).toEqual({ mechanism: 'shooter', volts: 0.4 })
    expect(p.snapshots).toEqual([expect.objectContaining({ lowestVolts: 6.71, amps: 251, matchTime: 72, topDraw: expect.arrayContaining([{ mechanism: 'drive', amps: 170 }]) })])
    expect(p.stickyFaults).toEqual([{ device: 'shooter 16', faults: ['undervoltage'] }])
    const odd = readPower({ topDrawAtMin: [1, 2], brownoutSnapshots: 'none', stickyFaults: [null, { faults: 'x' }] })
    expect([odd.topDraw, odd.snapshots, odd.stickyFaults]).toEqual([[], [], [{ device: 'device', faults: [] }]])
  })
})

describe('levels and the verdict', () => {
  it('robot R: under 22 OK, 22 to 28 watch, over 28 pull; over the fleet median + 5 is pull even under 28', () => {
    expect([21.9, 22, 28, 28.1].map((r) => robotLevel(r))).toEqual(['ok', 'watch', 'watch', 'pull'])
    expect(robotLevel(22, 16)).toBe('pull')
    expect(robotLevel(21, 16)).toBe('ok')
    expect(robotLevel(null)).toBeNull()
  })
  it('rested volts: 12.7 and up OK, 12.5 to 12.7 watch, under 12.5 pull', () => {
    expect([12.7, 12.69, 12.5, 12.49].map(restLevel)).toEqual(['ok', 'watch', 'watch', 'pull'])
    expect(restLevel(undefined)).toBeNull()
  })
  it('verdict items are tagged by how they start; load-test detail lines stay text', () => {
    const v = 'CHARGE: started at 12.31 V (fresh is 12.7+, 12.4 minimum) | HIGH RESISTANCE 31 mOhm (normal under 30): worn battery OR a loose main connection. | BROWNOUT at 6.5 V, 240 A: cause unclear, check the log'
    expect(verdictItems(v).map((x) => x.key)).toEqual(['charge', 'resistance', 'brownout'])
    expect(verdictItems('ROBOT DRAW: 236 A at the dip | BRANCH: only shooter 16 saw its supply sag').map((x) => x.label)).toEqual(['Robot draw', 'Branch'])
    expect(verdictItems('B07 R = 31.5 mOhm (battery + wiring) | 12.92 V idle -> 10.90 V at 120 A | HIGH: compare with another battery').map((x) => x.key)).toEqual(['detail', 'detail', 'resistance'])
    expect(verdictItems('OK')).toEqual([{ key: 'ok', label: 'OK', text: 'OK' }])
    expect([verdictItems(''), verdictItems(null)]).toEqual([[], []])
    expect(verdictText(verdictItems('ROBOT DRAW: 236 A at the dip')[0])).toBe('236 A at the dip')
  })
})

const B = (id, label, status = 'competition') => ({ id, label, status, charge_state: 'charged' })
const run = (battery_id, h, o = {}) => ({ id: `${battery_id}-${h}-${o.kind ?? 'match'}`, battery_id, kind: 'match', ran_at: new Date(Date.UTC(2026, 9, 28, 20) - h * 3600e3).toISOString(), brownout: 'no', voltage_before: 12.9, resistance_mohm: null, ...o })

describe('the battery board with robot readings', () => {
  it('a robot reading over 28 last time is a Check reason; 27.9 is not; the Beak column is never read for it', () => {
    const hi = summarize(B('b1', 'B01'), [run('b1', 1, { robot_resistance_mohm: 28.4 }), run('b1', 5, { robot_resistance_mohm: 20 })])
    expect(hi.check).toBe(true)
    expect(hi.reasons[0]).toMatch(/^Robot read 28.4 mΩ last time/)
    const ok = summarize(B('b1', 'B01'), [run('b1', 1, { robot_resistance_mohm: 27.9, resistance_mohm: 15 })])
    expect([ok.check, ok.robotR, ok.resistance]).toEqual([false, 27.9, 15])
    const beakOnly = summarize(B('b1', 'B01'), [run('b1', 1, { resistance_mohm: 19 })])
    expect([beakOnly.robotR, beakOnly.robotLevel, beakOnly.check]).toEqual([null, null, false])
  })
  it('the newest robot reading counts even when a later run had none; the trend is oldest first; latest verdict kept', () => {
    const s = summarize(B('b1', 'B01'), [run('b1', 1, { kind: 'bench_test' }), run('b1', 2, { robot_resistance_mohm: 31, verdict: 'HIGH: x' }), run('b1', 3, { robot_resistance_mohm: 25 }), run('b1', 4, { robot_resistance_mohm: 20, verdict: 'OK' })])
    expect([s.robotR, s.robotTrend, s.verdict]).toEqual([31, [20, 25, 31], 'HIGH: x'])
    expect(s.check).toBe(true)
  })
  it('the existing rules still flag: a brownout in the last 3 runs, rested under 12.5 before a match', () => {
    expect(summarize(B('b1', 'B01'), [run('b1', 1, { brownout: 'yes' })]).check).toBe(true)
    expect(summarize(B('b1', 'B01'), [run('b1', 1, { voltage_before: 12.45 })]).check).toBe(true)
    expect(summarize(B('b1', 'B01'), [run('b1', 1, { voltage_before: 12.55 })]).check).toBe(false)
  })
})

describe('the fleet line', () => {
  const board = (rs) => batteryBoard(rs.map((r, i) => B(`b${i}`, `B0${i + 1}`)), rs.flatMap((r, i) => (r === null ? [] : [run(`b${i}`, 1, { robot_resistance_mohm: r })])))
  it('one battery high while the rest read normal names that battery, marks it and makes it pull', () => {
    const rows = board([17, 18, 19, 31.5])
    const f = fleetLine(rows)
    expect([f.diagnosis, f.median, f.standOut.map((x) => x.label)]).toEqual(['battery', 18.5, ['B04']])
    expect(f.says).toMatch(/^B04 \(31.5\) stands out .*that battery/)
    expect(rows.find((r) => r.label === 'B04')).toMatchObject({ standsOut: true, robotLevel: 'pull' })
    expect(rows.filter((r) => r.standsOut)).toHaveLength(1)
  })
  it('1.3x the median stands out even within median + 5; just under both does not', () => {
    expect(fleetLine(board([10, 10, 10, 13])).standOut.map((x) => x.label)).toEqual(['B04'])
    expect(fleetLine(board([16, 17, 18, 21.9])).diagnosis).toBe('ok')
  })
  it('most batteries high (median over 28) blames the robot wiring and names the parts', () => {
    const f = fleetLine(board([29, 30, 31, 33]))
    expect(f.diagnosis).toBe('wiring')
    expect(f.says).toMatch(/robot's wiring.*main breaker, SB50 contacts and PDH terminals/)
    expect(f.standOut).toEqual([])
  })
  it('fewer than 3 readings do not compare; none says so; retired batteries are left out', () => {
    expect(fleetLine(board([17, 40])).diagnosis).toBe('few')
    expect(fleetLine(board([null, null])).diagnosis).toBe('none')
    const rows = batteryBoard([B('a', 'B01'), B('b', 'B02'), B('c', 'B03'), B('d', 'B04', 'retired')],
      [run('a', 1, { robot_resistance_mohm: 17 }), run('b', 1, { robot_resistance_mohm: 18 }), run('c', 1, { robot_resistance_mohm: 19 }), run('d', 1, { robot_resistance_mohm: 60 })])
    expect(fleetLine(rows)).toMatchObject({ readings: 3, diagnosis: 'ok' })
  })
  it('the CSV carries robot R, lowest V and the verdict in their own columns', () => {
    const rows = csvRows([B('b1', 'B01')], [run('b1', 1, { robot_resistance_mohm: 17.4, min_volts: 9.6, verdict: 'OK', resistance_mohm: 12 })])
    expect(rows[0]).toMatchObject({ resistance_mohm: 12, robot_resistance_mohm: 17.4, min_volts: 9.6, verdict: 'OK' })
  })
})

describe('the pit load tests in battery-history.csv', () => {
  const CSV = [
    'time,kind,battery,rest_v,resistance_mohm,min_v,amps_at_min,brownouts,verdict',
    '2026-10-28T13:10:02.123456,load_test,b7,12.92,31.5,10.90,120,0,"B7 R = 31.5 mOhm (battery + wiring) | 12.92 V idle -> 10.90 V at 120 A | HIGH: compare with another battery"',
    '2026-10-28T13:12:00,load_test,B 01,13.05,16.1,11.80,118,0,"B01 R = 16.1 mOhm, ""quoted"" | normal"',
    '2026-10-28T12:00:00,practice,B01,12.9,17.0,10.9,233,0,OK',
    '2026-10-28T13:14:00,load_test,B99,13.0,18.0,11.0,110,0,normal',
    '2026-10-28T13:15:00,load_test,B06,13.0,40.0,11.0,110,0,normal',
    '2026-10-28T13:16:00,load_test,B01,13.0,,,,0,no reading',
    '2026-06-01T13:16:00,load_test,B01,13.0,17,11,100,0,normal',
    '2026-10-28T13:18:00,load_test,,13.0,17,11,100,0,normal',
  ].join('\r\n')
  const batteries = [B('b1', 'B01'), B('b7', 'B07'), B('b6', 'B06', 'retired')]
  const NOW = Date.UTC(2026, 9, 28, 22)
  it('the CSV parser keeps quoted commas and doubled quotes', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']])
    const h = parseBatteryHistory(CSV)
    expect(h.rows).toHaveLength(8)
    expect(h.rows[1].verdict).toBe('B01 R = 16.1 mOhm, "quoted" | normal')
    expect(parseBatteryHistory('a,b\n1,2').error).toMatch(/not the robot battery history/)
  })
  it('plans each load test: new, or skipped with the reason; match rows are not load tests', () => {
    const plans = planLoadTests(parseBatteryHistory(CSV).rows, { batteries, runs: [], now: NOW })
    expect(plans.map((p) => [p.typed, p.status, p.reason ?? null])).toEqual([
      ['b7', 'new', null], ['B 01', 'new', null], ['B99', 'skip', 'not one battery in the log'], ['B06', 'skip', 'retired'],
      ['B01', 'skip', 'no resistance reading'], ['B01', 'skip', 'more than 60 days old'], ['', 'skip', 'no battery typed on the robot']])
    expect(plans[0]).toMatchObject({ battery: batteries[1], resistance: 31.5, restVolts: 12.92, minVolts: 10.9 })
    expect(loadTestRows(plans).map((r) => r.battery)).toEqual(['b7', 'B 01'])
  })
  it('a battery that already has a bench test at that second is already, never imported twice', () => {
    const at = planLoadTests(parseBatteryHistory(CSV).rows, { batteries, runs: [], now: NOW })[0].at
    const plans = planLoadTests(parseBatteryHistory(CSV).rows, { batteries, runs: [{ battery_id: 'b7', kind: 'bench_test', ran_at: at }], now: NOW })
    expect(plans[0].status).toBe('already')
    expect(loadTestRows(plans).map((r) => r.battery)).toEqual(['B 01'])
    const notBench = planLoadTests(parseBatteryHistory(CSV).rows, { batteries, runs: [{ battery_id: 'b7', kind: 'match', ran_at: at }], now: NOW })
    expect(notBench[0].status).toBe('new')
  })
  it('battery labels as the robot types them match the SQL rule (0041 _rm_battery_key, test check 19)', () => {
    const bs = [B('b7', 'B07'), B('b17', 'B17')]
    expect(['B7', 'b07', 'B 07', '7'].map((x) => matchBattery(x, bs).battery?.label)).toEqual(['B07', 'B07', 'B07', 'B07'])
    expect(matchBattery('B71', bs).battery).toBeNull()
  })
})
