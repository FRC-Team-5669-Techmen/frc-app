// Robot battery telemetry through the REAL connector tool runner (ledger
// 0031, migration 0041) over the in-memory backend: list_batteries carries the
// robot readings, the verdict and the fleet line; get_robot_match carries the
// power section (from the column, or from the stored file before 0041); and
// import_robot_matches_from_github lists the pit load tests and imports them
// only after the asks-first confirmation, through battery_import_load_tests.
// The database half is 0041_battery_telemetry_rls_test.sql.
import { beforeEach, describe, expect, it } from 'vitest'
import { runTool } from '../api/_lib/connector/tools.js'
import { FUNCTIONS, TOOLS } from '../api/_lib/connector/registry.js'
import { memoryBackend, testRandom } from './connector/memory-backend.js'
import { robotFile, robotPower } from '../src/dev/fixture/features/robotmatches.js'

const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
const BATT = [
  { id: 'b-1', label: 'B01', status: 'competition', charge_state: 'charged' },
  { id: 'b-2', label: 'B02', status: 'competition', charge_state: 'charged' },
  { id: 'b-3', label: 'B03', status: 'competition', charge_state: 'charged' },
  { id: 'b-7', label: 'B07', status: 'competition', charge_state: 'charged' },
]
const run = (id, battery_id, at, o = {}) => ({ id, battery_id, member_id: 'm', ran_at: at, kind: 'match', voltage_before: 12.9, voltage_after: 12, resistance_mohm: null, brownout: 'no', ...o })
const RUNS = [
  run('r1', 'b-1', '2026-10-28T18:00:00Z', { robot_resistance_mohm: 16.8, verdict: 'OK' }),
  run('r2', 'b-2', '2026-10-28T17:00:00Z', { robot_resistance_mohm: 18.2 }),
  run('r3', 'b-3', '2026-10-28T16:00:00Z', { robot_resistance_mohm: 19.5 }),
  run('r4', 'b-7', '2026-10-28T15:00:00Z', { kind: 'bench_test', robot_resistance_mohm: 31.5, verdict: 'B07 R = 31.5 mOhm (battery + wiring) | HIGH: compare with another battery' }),
  run('r5', 'b-7', '2026-10-27T15:00:00Z', { kind: 'bench_test', robot_resistance_mohm: 29.8 }),
]
const STARTED = '2026-10-28T10:36:05'
const POWER_FILE = robotFile({ startedAt: STARTED, brownouts: 1, extra: { power: robotPower({ rest: 12.74, r: 17.6, min: 6.71, amps: 251, brownouts: 1, verdict: 'ROBOT DRAW: 251 A at the dip with normal resistance: too much current at once' }) } })
const MATCHES = [{ id: 'rm-1', source: 'robot_file', file_name: 'rm-1.json', kind: 'practice', started_at: '2026-10-28T17:36:05Z', match_label: 'practice 1', battery_id: 'b-2', brownouts: 1 }]
const CSV = ['time,kind,battery,rest_v,resistance_mohm,min_v,amps_at_min,brownouts,verdict',
  '2026-10-28T08:10:02,load_test,B7,12.92,31.5,10.90,120,0,"B7 R = 31.5 mOhm (battery + wiring) | HIGH: compare with another battery"',
  '2026-10-28T08:12:00,load_test,b03,13.05,19.1,11.80,118,0,normal',
  '2026-10-28T08:20:00,practice,B01,12.9,17,10.9,233,0,OK'].join('\n')

let backend, ctx, matchRow
function fetchWith({ csv = CSV, files = {} } = {}) {
  return async (url) => {
    if (url.startsWith('https://api.github.com/')) return { ok: true, status: 200, json: async () => Object.keys(files).map((name) => ({ type: 'file', name, download_url: `https://raw.example/${name}` })) }
    if (url.endsWith('/battery-history.csv')) return csv === null ? { ok: false, status: 404, text: async () => '' } : { ok: true, status: 200, text: async () => csv }
    const name = decodeURIComponent(url.split('/').pop())
    return files[name] ? { ok: true, status: 200, text: async () => JSON.stringify(files[name]) } : { ok: false, status: 404, text: async () => '' }
  }
}
beforeEach(() => {
  matchRow = { ...MATCHES[0], raw: POWER_FILE }
  backend = memoryBackend({ rpcImpl: (s, fn, args, st, def) => (fn === 'admin_get_members' ? { data: [], error: null } : def(s, fn, args)) })
  backend.select = async (_s, spec) => {
    if (spec.table === 'batteries') return { data: BATT, error: null }
    if (spec.table === 'battery_runs') return { data: spec.eq?.kind ? RUNS.filter((r) => r.kind === spec.eq.kind) : RUNS, error: null }
    if (spec.table === 'robot_matches') return { data: spec.eq?.id ? [matchRow] : MATCHES, error: null }
    return { data: [], error: null }
  }
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: () => Date.parse('2026-10-28T20:00:00Z'), random: testRandom(), cache: new Map(), fetch: fetchWith() }
})

describe('battery telemetry in the connector', () => {
  it('the load-test import is a registered asks-first function behind the GitHub import tool', () => {
    expect(FUNCTIONS.battery_import_load_tests.level).toBe('confirm')
    expect(TOOLS.import_robot_matches_from_github.args.load_tests.type).toBe('boolean')
  })

  it('list_batteries: robot R per battery with its level, trend and verdict, and the fleet names B07, not the robot', async () => {
    const out = await runTool(ctx, 'list_batteries', { said: 'is it the battery or the robot wiring' })
    expect(out.fleet).toMatchObject({ diagnosis: 'battery', batteries_with_readings: 4, stands_out: [{ battery: 'B07', robot_resistance_mohm: 31.5 }] })
    const b7 = out.batteries.find((b) => b.label === 'B07')
    expect(b7).toMatchObject({ robot_resistance_mohm: 31.5, robot_resistance_level: 'pull', stands_out: true, check: true, robot_resistance_trend: [29.8, 31.5], resistance_mohm: null })
    expect(b7.latest_verdict_items).toEqual(['B07 R = 31.5 mOhm (battery + wiring)', 'High R'])
    const b1 = out.batteries.find((b) => b.label === 'B01')
    expect(b1).toMatchObject({ robot_resistance_mohm: 16.8, robot_resistance_level: 'ok', stands_out: false, check: false })
    expect(out.thresholds.robot_resistance_mohm).toMatchObject({ ok_under: 22, pull_over: 28 })
    expect(backend.state.audit).toHaveLength(0)
  })

  it('list_batteries before 0041: no robot columns, every robot reading null, the fleet says none (the board still works)', async () => {
    backend.select = async (_s, spec) => ({ data: spec.table === 'batteries' ? BATT : spec.table === 'battery_runs' ? RUNS.map(({ robot_resistance_mohm, verdict, ...r }) => r) : [], error: null })
    const out = await runTool(ctx, 'list_batteries', { said: 'how are the batteries' })
    expect(out.status).toBe('ok')
    expect(out.fleet.diagnosis).toBe('none')
    expect(out.batteries.every((b) => b.robot_resistance_mohm === null && b.latest_verdict === null)).toBe(true)
  })

  it('get_robot_match carries the power section, read from the stored file when the power column is not there yet', async () => {
    const out = await runTool(ctx, 'get_robot_match', { said: 'was the brownout the battery or the robot', match: 'practice 1' })
    expect(out.power).toMatchObject({ restVolts: 12.74, resistance: 17.6, minVolts: 6.71, ampsAtMin: 251, brownouts: 1 })
    expect(out.power.verdict_items).toEqual([{ tag: 'Robot draw', text: expect.stringMatching(/^ROBOT DRAW: 251 A/) }])
    matchRow = { ...MATCHES[0], raw: robotFile({ startedAt: STARTED }) }
    ctx.cache = new Map()
    expect((await runTool(ctx, 'get_robot_match', { said: 'x', match: 'practice 1' })).power).toBeNull()
  })

  it('the import listing shows the new load tests, skips match rows and writes nothing', async () => {
    const out = await runTool(ctx, 'import_robot_matches_from_github', { said: 'what is new on GitHub' })
    expect(out.status).toBe('ok')
    expect(out.load_tests.new.map((x) => [x.battery, x.robot_resistance_mohm])).toEqual([['B07', 31.5], ['B03', 19.1]])
    expect(backend.state.calls).toHaveLength(0)
    ctx.fetch = fetchWith({ csv: null })
    ctx.cache = new Map()
    expect((await runTool(ctx, 'import_robot_matches_from_github', { said: 'x' })).load_tests).toMatchObject({ new: [], note: expect.stringMatching(/not pushed a battery history/) })
  })

  it('load_tests asks first, then sends exactly the new rows to battery_import_load_tests', async () => {
    const a = { said: 'import the battery load tests', load_tests: true }
    const prev = await runTool(ctx, 'import_robot_matches_from_github', a)
    expect(prev.status).toBe('preview')
    expect(backend.state.calls).toHaveLength(0)
    ctx.cache = new Map()
    const done = await runTool(ctx, 'import_robot_matches_from_github', { ...a, confirm_token: prev.confirm_token })
    expect(done.status).toBe('done')
    const call = backend.state.calls.at(-1)
    expect(call.fn).toBe('battery_import_load_tests')
    expect(call.args.p_rows.map((r) => [r.battery, r.resistance_mohm, r.kind])).toEqual([['B7', '31.5', 'load_test'], ['b03', '19.1', 'load_test']])
    expect(done.file.load_tests).toHaveLength(2)
  })

  it('nothing new to import says so and writes nothing (an already-imported test is not sent again)', async () => {
    const at = (wall) => new Date(Date.parse(`${wall}Z`) + 7 * 3600e3).toISOString() // PDT
    RUNS.push(run('r6', 'b-7', at('2026-10-28T08:10:02'), { kind: 'bench_test', robot_resistance_mohm: 31.5 }), run('r7', 'b-3', at('2026-10-28T08:12:00'), { kind: 'bench_test', robot_resistance_mohm: 19.1 }))
    try {
      const out = await runTool(ctx, 'import_robot_matches_from_github', { said: 'import the load tests', load_tests: true })
      expect(out.status).toBe('already')
      expect(out.load_tests.map((x) => x.status)).toEqual(['already', 'already'])
      expect(backend.state.calls).toHaveLength(0)
    } finally { RUNS.splice(5) }
  })
})
