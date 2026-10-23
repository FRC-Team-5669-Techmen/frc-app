// The human player tool (ledger 0025, migration 0033) through the REAL tool
// runner over the in-memory backend: list_human_players ranks with the app's
// own rule (src/humanPlayerScore.js), scopes to the season, lists who still
// needs attempts, and writes nothing. The page's three write functions are
// generated call_app entries that ask first. The database half is proved by
// 0033_human_player_leaderboard_rls_test.sql.
import { beforeEach, describe, expect, it } from 'vitest'
import { runTool } from '../api/_lib/connector/tools.js'
import { FUNCTIONS, TOOLS } from '../api/_lib/connector/registry.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
const at = (member, drill, made, date = '2026-10-10', extra = {}) => ({ member_id: member, drill, made, attempt_date: date, created_at: `${date}T20:00:00Z`, voided_at: null,
  attempted: drill === 'accuracy' ? 20 : made + 5, made_inactive: 0, seconds: drill === 'accuracy' ? null : drill === 'rate' ? 30 : 163, ...extra })
const set = (m, acc, rate, match, date) => [0, 1, 2].flatMap(() => [at(m, 'accuracy', acc, date), at(m, 'rate', rate, date), at(m, 'match', match, date)])
const ATTEMPTS = [
  ...set('m-riley', 16, 24, 40),
  ...set('m-sam', 20, 12, 20),
  at('m-sam', 'match', 90, '2026-10-12', { voided_at: '2026-10-12T21:00:00Z' }),
  at('m-cy', 'match', 50),
  ...set('m-casey', 20, 30, 60, '2026-03-01'),
]
const SEASONS = [{ id: 's1', name: 'Offseason 2026', start_date: '2026-05-01', end_date: '2027-01-06' }]
const MEMBERS = [{ id: 'm-riley', full_name: 'Riley Two' }, { id: 'm-sam', full_name: 'Sam One' }, { id: 'm-casey', full_name: 'Casey Three' }, { id: 'm-cy', full_name: 'Cy Four' }]

let backend, ctx
beforeEach(() => {
  backend = memoryBackend()
  backend.select = async (_s, spec) => ({ data: spec.table === 'hp_attempts' ? ATTEMPTS : spec.table === 'seasons' ? SEASONS : [], error: null })
  const rpc = backend.rpc
  backend.rpc = async (s, fn, args) => fn === 'admin_get_members' ? { data: MEMBERS, error: null } : rpc(s, fn, args)
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map() }
})

describe('the human player tools', () => {
  it('list_human_players is a read tool; the page writes are generated and ask first', () => {
    expect(TOOLS.list_human_players.kind).toBe('read')
    for (const fn of ['hp_log_attempt', 'hp_edit_attempt', 'hp_void_attempt']) expect(FUNCTIONS[fn]?.level).toBe('confirm')
  })
  it('ranks this season: Riley over Sam (the voided 90 left out); Cy is listed as needing attempts; Casey last season is absent', async () => {
    const out = await runTool(ctx, 'list_human_players', { said: 'who is our best human player' })
    expect(out.status).toBe('ok')
    expect(out.season).toBe('Offseason 2026')
    expect(out.players.map((p) => p.name)).toEqual(['Riley Two', 'Sam One'])
    expect(out.players[0].human_player_score).toBe(96) // 0.5 + 0.3 + 0.2 x 16/20
    expect(out.players[1].match_fuel_active).toBe(20)
    expect(out.not_ranked_yet).toEqual([{ name: 'Cy Four', needs: 'needs 2 more match runs, 3 more rate, 3 more accuracy' }])
    expect(backend.state.audit).toHaveLength(0)
  })
  it('all time brings Casey back at the top (against absent this season)', async () => {
    const out = await runTool(ctx, 'list_human_players', { said: 'human player rankings for all time', season: 'all' })
    expect(out.season).toBe('All time')
    expect(out.players[0].name).toBe('Casey Three')
  })
  it('before 0033 is applied it says not set up', async () => {
    backend.select = async () => ({ data: null, error: { code: 'PGRST205', message: 'no table' } })
    expect((await runTool(ctx, 'list_human_players', { said: 'x' })).status).toBe('not_set_up')
  })
})
