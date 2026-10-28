// The robot match log's pure rules (src/robotMatches.js, migration 0038,
// ledger 0028). The sample is the robot repo's own
// match-data/sample/sim-example_practice.json (tests/fixtures/robot-match-sample.json,
// copied byte for byte). Every rule is driven both ways.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { COLUMN_PATHS, KINDS, parseMatchFile, matchLabel, startedAtMs, matchMember, matchBattery, matchRoutine, simCandidate, eventFor, planImport, importLinks,
  driverTrends, batteryTrends, compareMatches, notReadyReasons, filterMatches, ballsIn, wasted } from '../src/robotMatches.js'

const SAMPLE = readFileSync(new URL('./fixtures/robot-match-sample.json', import.meta.url), 'utf8')
const SQL = readFileSync(new URL('../supabase/migrations/0038_robot_match_log.sql', import.meta.url), 'utf8')

describe('the server copies the same columns from the same paths', () => {
  it('every COLUMN_PATHS entry appears in 0038 _rm_extract as r.<col> from that path', () => {
    for (const [col, path] of COLUMN_PATHS) {
      const p = path.length === 1 ? `j -> '${path[0]}'` : `j #> '{${path.join(',')}}'`
      expect(SQL, col).toContain(`r.${col} :=`)
      expect(SQL, `${col} path`).toContain(p)
    }
  })
  it('the kinds are the SQL check list', () => {
    expect(SQL).toContain(`kind in (${KINDS.map((k) => `'${k}'`).join(', ')})`)
  })
  it('the label rule matches _rm_label', () => {
    expect(SQL).toContain("when p_kind = 'qual' and coalesce(p_fms_number, 0) > 0 then 'qm' || p_fms_number")
    expect([matchLabel('qual', 12, 3), matchLabel('practice_fms', 2, 1), matchLabel('playoff', 4, 9), matchLabel('practice', 0, 7), matchLabel('auto_test', 0, null)])
      .toEqual(['qm12', 'pm2', 'playoff 4', 'practice 7', 'auto test'])
  })
})

describe('parsing a robot file', () => {
  it('the sample parses: kind, crew blanks, battery, auto, label, and every field is kept', () => {
    const p = parseMatchFile(SAMPLE, 'sim-example_practice.json')
    expect(p.ok).toBe(true)
    expect(p.cols).toMatchObject({ kind: 'practice', alliance: 'red', auto_name: 'Shoot Preload (stay put)', battery_start: 13.5, battery_min: 13.5, brownouts: 0,
      duration_s: 17.1, ready_pct: 0, auto_balls: 0, schema_version: 1, robot_match: 1, match_label: 'practice 1', auto_winner: 'blue', auto_winner_random: true })
    expect(p.cols.crew_typed).toEqual({})
    expect(p.cols.hang_at_seconds).toBe(null)
    expect(p.raw.events.length).toBe(13)
    expect(p.raw.logDir).toBe('/home/lvuser/logs')
  })
  it('unknown fields are kept, never rejected (schema 2 with a new section still parses)', () => {
    const j = JSON.parse(SAMPLE); j.schema = 2; j.newSection = { x: 1 }
    const p = parseMatchFile(j, 'x.json')
    expect(p.ok).toBe(true)
    expect(p.raw.newSection).toEqual({ x: 1 })
  })
  it('refuses what 0038 refuses: no schema, a bad kind, no startedAt, a bad name, not JSON', () => {
    const j = JSON.parse(SAMPLE)
    expect(parseMatchFile({ ...j, schema: undefined }, 'a.json').error).toMatch(/schema/)
    expect(parseMatchFile({ ...j, kind: 'scrimmage' }, 'a.json').error).toMatch(/Unknown match kind/)
    expect(parseMatchFile({ ...j, startedAt: 'soon' }, 'a.json').error).toMatch(/startedAt/)
    expect(parseMatchFile(j, 'a b.json').error).toMatch(/file name/)
    expect(parseMatchFile('{nope', 'a.json').error).toMatch(/JSON/)
  })
  it('startedAt is Los Angeles wall time, on both sides of daylight saving', () => {
    expect(new Date(startedAtMs('2026-10-28T10:36:05.893')).toISOString()).toBe('2026-10-28T17:36:05.000Z')
    expect(new Date(startedAtMs('2026-11-01T09:00:00')).toISOString()).toBe('2026-11-01T17:00:00.000Z')
    expect(startedAtMs('')).toBe(null)
  })
  it('a voltage outside 0 to 16 is not a reading (null), a real one is kept', () => {
    const j = JSON.parse(SAMPLE); j.battery.min = -1; j.battery.end = 12.2
    const c = parseMatchFile(j, 'a.json').cols
    expect(c.battery_min).toBe(null)
    expect(c.battery_end).toBe(12.2)
  })
})

describe('matching typed names', () => {
  const members = [{ id: 'm1', name: 'Mathias Garcia', full_name: 'Mathias Garcia' }, { id: 'm2', name: 'Matthew', full_name: 'Matthew Perez' }, { id: 'm3', name: 'Matthew Posada', full_name: 'Matthew Posada' }, { id: 'm4', name: 'DJ', full_name: 'Devin Johnson', nickname: 'DJ' }]
  it('exact on full name, nickname or display name, ignoring case and punctuation', () => {
    expect(matchMember('mathias garcia', members)).toMatchObject({ status: 'exact', member: { id: 'm1' } })
    expect(matchMember('D.J.', members)).toMatchObject({ status: 'confirm' })
    expect(matchMember('dj', members)).toMatchObject({ status: 'exact', member: { id: 'm4' } })
    expect(matchMember('Devin Johnson', members)).toMatchObject({ status: 'exact', member: { id: 'm4' } })
  })
  it('a first name alone is offered for confirmation, and an ambiguous one lists everyone', () => {
    expect(matchMember('Mathias', members)).toMatchObject({ status: 'confirm', member: { id: 'm1' } })
    const m = matchMember('Matt', members)
    expect(m.status).toBe('confirm')
    expect(m.member).toBe(null)
    expect(m.candidates.map((x) => x.id).sort()).toEqual(['m2', 'm3'])
  })
  it('blank and unknown names link nobody (negative control)', () => {
    expect(matchMember('', members)).toMatchObject({ status: 'blank', member: null })
    expect(matchMember('Zed', members)).toMatchObject({ status: 'none', member: null })
  })
  it('batteries: B7, b07 and "B 07" are B07; a different number is not', () => {
    const bats = [{ id: 'b7', label: 'B07' }, { id: 'b17', label: 'B17' }]
    for (const l of ['B7', 'b07', 'B 07']) expect(matchBattery(l, bats)).toMatchObject({ status: 'exact', battery: { id: 'b7' } })
    expect(matchBattery('B71', bats).status).toBe('none')
  })
  it('routines: case and spacing ignored; a missing one is flagged to add', () => {
    expect(matchRoutine('shoot preload  (stay put)', [{ id: 'r1', name: 'Shoot Preload (stay put)' }])).toMatchObject({ status: 'exact' })
    expect(matchRoutine('Left 3-Piece Auto', [{ id: 'r1', name: 'Shoot Preload (stay put)' }]).status).toBe('missing')
  })
})

describe('one record per match, and the event', () => {
  const cols = parseMatchFile(SAMPLE, 'a.json').cols
  const t = Date.parse(cols.started_at)
  const sim = (min, extra = {}) => ({ id: `s${min}`, source: 'sim_page', file_name: null, alliance: 'red', started_at: new Date(t + min * 60e3).toISOString(), ...extra })
  it('the one Match Sim row within 5 minutes on the same alliance is the merge target', () => {
    expect(simCandidate(cols, [sim(2)])?.id).toBe('s2')
    expect(simCandidate(cols, [sim(6)])).toBe(null)
    expect(simCandidate(cols, [sim(1, { alliance: 'blue' })])).toBe(null)
    expect(simCandidate(cols, [sim(1, { file_name: 'x.json' })])).toBe(null)
    expect(simCandidate(cols, [sim(1), sim(2)])).toBe(null)
  })
  it('a real match links to the one competition running; a practice match never does', () => {
    const ev = { id: 'e', kind: 'competition', starts_at: new Date(t - 3600e3).toISOString(), ends_at: new Date(t + 864e5).toISOString() }
    expect(eventFor({ ...cols, kind: 'qual' }, [ev])?.id).toBe('e')
    expect(eventFor(cols, [ev])).toBe(null)
    expect(eventFor({ ...cols, kind: 'qual' }, [ev, { ...ev, id: 'f' }])).toBe(null)
  })
})

describe('the import plan', () => {
  const j = JSON.parse(SAMPLE); j.driver = 'Mathias'; j.operator = 'Julian Romo'; j.batteryLabel = 'B7'
  const parsed = parseMatchFile(j, 'p.json')
  const ctx = { members: [{ id: 'm1', name: 'Mathias Garcia' }, { id: 'j', name: 'Julian', full_name: 'Julian Romo' }], batteries: [{ id: 'b7', label: 'B07' }], routines: [] }
  it('exact names link, loose ones ask, a missing routine is offered, and the rows it will write are shown', () => {
    const plan = planImport(parsed, ctx)
    expect(plan.status).toBe('new')
    expect(plan.crew.operator.status).toBe('exact')
    expect(plan.crew.driver.status).toBe('confirm')
    expect(plan.confirm.join(' ')).toMatch(/driver "Mathias" could be Mathias Garcia/)
    expect(plan.confirm.join(' ')).toMatch(/not an auto routine yet/)
    expect(plan.writes).toEqual({ batteryRun: true, driveSession: true })
    const links = importLinks(plan, { addRoutine: true })
    expect(links).toMatchObject({ operator: 'j', battery: 'b7', driver: null, new_routine: 'Shoot Preload (stay put)' })
    expect(importLinks(plan, { driver: 'm1' }).driver).toBe('m1')
  })
  it('an imported file is "already", and nothing is planned (idempotent)', () => {
    expect(planImport(parsed, { ...ctx, existing: new Set(['p.json']) }).status).toBe('already')
  })
  it('merging with a Match Sim row that already logged its battery run writes no second one', () => {
    const t = Date.parse(parsed.cols.started_at)
    const plan = planImport(parsed, { ...ctx, simRows: [{ id: 's', source: 'sim_page', file_name: null, alliance: 'red', started_at: new Date(t).toISOString(), battery_run_id: 'br' }] })
    expect(plan.sim.id).toBe('s')
    expect(plan.writes.batteryRun).toBe(false)
  })
})

describe('trends and comparison', () => {
  const ms = [
    { id: 'a', started_at: '2026-10-28T17:00:00Z', driver_id: 'd1', battery_id: 'b1', auto_balls: 3, open_balls: 10, closed_balls: 2, ready_pct: 60, hang_at_seconds: 120, battery_min: 10.9, brownouts: 0, match_label: 'practice 1' },
    { id: 'b', started_at: '2026-10-28T18:00:00Z', driver_id: 'd1', battery_id: 'b1', auto_balls: 5, open_balls: 14, closed_balls: 0, ready_pct: 80, hang_at_seconds: null, battery_min: 9.8, brownouts: 1, match_label: 'practice 2', scorer_balls_in: 17 },
    { id: 'c', started_at: '2026-10-28T19:00:00Z', driver_id: 'd2', battery_id: 'b2', auto_balls: null, open_balls: null, closed_balls: null, ready_pct: null, battery_min: null, brownouts: null, kind: 'qual' },
  ]
  it('balls in prefers the scorer count, else auto + open hub; closed-hub balls are wasted; missing is null, never 0', () => {
    expect([ballsIn(ms[0]), ballsIn(ms[1]), ballsIn(ms[2])]).toEqual([13, 17, null])
    expect([wasted(ms[0]), wasted(ms[2])]).toEqual([2, null])
  })
  it('per driver: oldest first, averages over recorded values only', () => {
    const [d1, d2] = driverTrends(ms, (id) => id.toUpperCase())
    expect(d1).toMatchObject({ id: 'd1', name: 'D1', matches: 2, avg: { ballsIn: 15, wasted: 1, ready: 70, hang: 120 } })
    expect(d1.points.map((p) => p.id)).toEqual(['a', 'b'])
    expect(d2.avg).toEqual({ ballsIn: null, wasted: null, ready: null, hang: null })
  })
  it('per battery: lowest minimum and total brownouts; a battery with no readings shows null', () => {
    const [b1, b2] = batteryTrends(ms, (id) => id)
    expect(b1).toMatchObject({ runs: 2, lowest: 9.8, brownouts: 1 })
    expect(b1.avgMin).toBeCloseTo(10.35)
    expect(b2).toMatchObject({ lowest: null, brownouts: null })
  })
  it('compare marks the best value per row; equal or single values mark none', () => {
    const rows = compareMatches([ms[0], ms[1]])
    expect(rows.find((r) => r.key === 'ballsIn')).toMatchObject({ values: [13, 17], best: 17 })
    expect(rows.find((r) => r.key === 'brownouts')).toMatchObject({ best: 0 })
    expect(rows.find((r) => r.key === 'distance').best).toBe(null)
    expect(compareMatches([ms[0], ms[2]]).find((r) => r.key === 'ready').best).toBe(null)
  })
  it('not-ready reasons: longest first, the "-" placeholder dropped', () => {
    expect(notReadyReasons(JSON.parse(SAMPLE))).toEqual([{ reason: 'tag-only: turret not on hub tag', seconds: 4 }])
    expect(notReadyReasons({})).toEqual([])
  })
  it('filters: real matches, driver, battery and LA dates', () => {
    expect(filterMatches(ms, { kind: 'real' }).map((m) => m.id)).toEqual(['c'])
    expect(filterMatches(ms, { driver: 'd1', battery: 'b1' }).length).toBe(2)
    expect(filterMatches(ms, { from: '2026-10-29' }).length).toBe(0)
    expect(filterMatches(ms, { from: '2026-10-28', to: '2026-10-28' }).length).toBe(3)
  })
})
