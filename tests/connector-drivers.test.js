// The driver leaderboard tool (ledger 0020, migration 0029) through the REAL
// tool runner over the in-memory backend: list_drivers ranks with the app's
// own rule (src/driverScore.js), scopes to the season, and writes nothing.
// The page's four write functions are generated call_app entries that ask
// first. The database half is proved by 0029_driver_leaderboard_rls_test.sql.
import { beforeEach, describe, expect, it } from 'vitest'
import { runTool } from '../api/_lib/connector/tools.js'
import { FUNCTIONS, TOOLS } from '../api/_lib/connector/registry.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
const SESSIONS = [
  { member_id: 'm-riley', session_date: '2026-10-10', minutes: 600, kind: 'practice_field', voided_at: null },
  { member_id: 'm-sam', session_date: '2026-10-11', minutes: 120, kind: 'match', voided_at: null },
  { member_id: 'm-sam', session_date: '2026-10-12', minutes: 900, kind: 'match', voided_at: '2026-10-12T20:00:00Z' },
  { member_id: 'm-casey', session_date: '2026-03-01', minutes: 900, kind: 'match', voided_at: null },
]
const SCORES = [{ id: 'r1', driver_id: 'm-riley', coach_id: 'u-admin', control: 4, awareness: 4, scoring: 4, defense: 4, consistency: 4, rated_at: '2026-10-15T18:00:00Z' }]
const SEASONS = [{ id: 's1', name: 'Offseason 2026', start_date: '2026-05-01', end_date: '2027-01-06' }]
const MEMBERS = [{ id: 'm-riley', full_name: 'Riley Two' }, { id: 'm-sam', full_name: 'Sam One' }, { id: 'm-casey', full_name: 'Casey Three' }]

let backend, ctx
beforeEach(() => {
  backend = memoryBackend()
  backend.select = async (_s, spec) => ({ data: spec.table === 'drive_sessions' ? SESSIONS : spec.table === 'seasons' ? SEASONS : [], error: null })
  const rpc = backend.rpc
  backend.rpc = async (s, fn, args) => fn === 'driver_rating_scores' ? { data: SCORES, error: null } : fn === 'admin_get_members' ? { data: MEMBERS, error: null } : rpc(s, fn, args)
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map() }
})

describe('the driver tools', () => {
  it('list_drivers is a read tool; the page writes are generated and ask first', () => {
    expect(TOOLS.list_drivers.kind).toBe('read')
    for (const fn of ['driver_log_session', 'driver_edit_session', 'driver_void_drive', 'driver_rate']) expect(FUNCTIONS[fn]?.level).toBe('confirm')
  })
  it('ranks this season: Riley (10 h and a rating) over Sam (2 h, the voided match left out); Casey last season is absent', async () => {
    const out = await runTool(ctx, 'list_drivers', { said: 'who are our best drivers' })
    expect(out.status).toBe('ok')
    expect(out.season).toBe('Offseason 2026')
    expect(out.drivers.map((d) => d.name)).toEqual(['Riley Two', 'Sam One'])
    expect(out.drivers[1].robot_hours).toBe(2)
    expect(out.drivers[0].coach_average).toBe(4)
    expect(out.drivers[1].coach_average).toBe('unrated')
    expect(backend.state.audit).toHaveLength(0)
  })
  it('all time brings Casey back (against absent this season)', async () => {
    const out = await runTool(ctx, 'list_drivers', { said: 'driver rankings for all time', season: 'all' })
    expect(out.season).toBe('All time')
    expect(out.drivers.map((d) => d.name)).toContain('Casey Three')
  })
  it('before 0029 is pasted it says not set up', async () => {
    backend.select = async () => ({ data: null, error: { code: 'PGRST205', message: 'no table' } })
    expect((await runTool(ctx, 'list_drivers', { said: 'x' })).status).toBe('not_set_up')
  })
})
