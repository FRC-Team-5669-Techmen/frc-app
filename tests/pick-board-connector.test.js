// The pick_board connector tool (ledger 0032) through the REAL tool runner:
// the same order as the page (src/scouting/board.js), marks applied, the live
// clock and our next pick, one team explained, and before 0042 still a ranking.
import { beforeEach, describe, expect, it } from 'vitest'
import { runTool } from '../api/_lib/connector/tools.js'
import { TOOLS } from '../api/_lib/connector/registry.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'
import { fixtureResults } from '../src/dev/fixture/features/pickboard.js'
import { compactMatches } from '../src/scouting/pickRank.js'
import { boardView } from '../src/scouting/board.js'
import { PRIORS } from '../src/scouting/priors/index.js'

const EVENT = { id: '16000000-0000-4000-8000-000000000001', title: 'Beach Blitz 2026', kind: 'competition', starts_at: '2026-10-30T22:00:00Z', ends_at: '2026-11-02T01:00:00Z' }
const results = fixtureResults({ now: Date.parse('2026-10-31T23:00:00Z') })
const MATCHES = compactMatches(results.matches)
let backend, ctx, state, boardError

beforeEach(() => {
  state = { settings: { event_key: '2026cabl', our_team: 5669, rounds: 3 }, matches: { fetched_at: '2026-10-31T23:00:00Z', teams: results.teams.map(t => ({ n: t.team_number, name: t.payload.name })), matches: MATCHES }, overrides: {} }
  boardError = null
  backend = memoryBackend({ rpcImpl: (s, fn, args, st, def) => (fn === 'scouting_pick_board_get' ? (boardError ? { data: null, error: boardError } : { data: { event_id: EVENT.id, state, version: 3 }, error: null }) : def(s, fn, args)) })
  backend.select = async (_s, spec) => {
    if (spec.table === 'events') return { data: [EVENT], error: null }
    if (spec.table === 'scouting_records') return { data: [], error: null }
    return { data: [], error: null }
  }
  ctx = { backend, session: { accessToken: 'minted', user: { id: 'u-admin' } }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map() }
})

describe('pick_board', () => {
  it('is a read tool', () => { expect(TOOLS.pick_board.kind).toBe('read') })

  it('lists the same order as the page, from TBA results and the shipped prior', async () => {
    const out = await runTool(ctx, 'pick_board', { said: 'who should we pick', event: EVENT.id, limit: 10 })
    expect(out.status).toBe('ok')
    expect(out.data.tba_matches_played).toBe(60)
    const page = boardView({ state, records: [], prior: PRIORS['2026cabl'] })
    expect(out.list.map(r => r.team)).toEqual(page.ordered.filter(r => r.id !== 5669).slice(0, 10).map(r => r.id))
    expect(out.list[0].why.length).toBeGreaterThan(0)
    expect(out.best_for_us).toBe(out.list[0].team)
    expect(out.selection).toBeNull()
    expect(backend.state.audit).toHaveLength(0)
  })

  it('Must pick puts a team first and Avoid takes it out of best for us (against the unmarked order above)', async () => {
    const before = await runTool(ctx, 'pick_board', { said: 'x', event: EVENT.id })
    const [first, , third] = before.list.map(r => r.team)
    state.overrides = { [third]: { flag: 'must' }, [first]: { flag: 'avoid' } }
    ctx.cache = new Map()
    const out = await runTool(ctx, 'pick_board', { said: 'x', event: EVENT.id })
    expect(out.list[0]).toMatchObject({ team: third, mark: 'must' })
    expect(out.avoid).toEqual([first])
    expect(out.best_for_us).toBe(third)
    expect(out.list.find(r => r.team === third).auto_rank).toBe(3)
  })

  it('during selection: who is on the clock, our next pick, odds, and picked teams gone', async () => {
    const before = await runTool(ctx, 'pick_board', { said: 'x', event: EVENT.id })
    const seeds = [before.list[0].team, before.list[1].team, 5669, ...before.list.slice(2, 40).map(r => r.team)]
    state.selection = { seeds, log: [{ type: 'pick', team: before.list[2].team }], rounds: 3, alliances: 8, version: 1 }
    ctx.cache = new Map()
    const out = await runTool(ctx, 'pick_board', { said: 'who is on the clock', event: EVENT.id })
    expect(out.selection.on_the_clock).toMatch(/^Alliance 2 /)
    expect(out.selection.our_next_pick_in).toBe(1)
    expect(out.list.map(r => r.team)).not.toContain(before.list[2].team)
    expect(out.list.every(r => typeof r.still_there_at_our_pick === 'number')).toBe(true)
    expect(out.selection.alliances[0].teams).toEqual([before.list[0].team, before.list[2].team])
  })

  it('explains one team; an unknown team is not_found', async () => {
    const out = await runTool(ctx, 'pick_board', { said: 'why is it first', event: EVENT.id, team: 5669 })
    expect(out.team).toMatchObject({ team: 5669, matches: expect.any(Number) })
    expect(out.team.season_2026).toBeGreaterThan(0)
    expect((await runTool(ctx, 'pick_board', { said: 'x', event: EVENT.id, team: 99999 })).status).toBe('not_found')
  })

  it('before 0042 it still ranks from the scouting records and says the shared board is not set up', async () => {
    boardError = { code: 'PGRST202', message: 'no function' }
    backend.select = async (_s, spec) => (spec.table === 'events' ? { data: [EVENT], error: null }
      : spec.table === 'scouting_records' ? { data: [{ id: 'r1', event_id: EVENT.id, kind: 'team', team_number: 254, payload: { name: 'Cheesy Poofs' } }, { id: 'r2', event_id: EVENT.id, kind: 'team', team_number: 5669, payload: { name: 'Techmen' } }], error: null } : { data: [], error: null })
    const out = await runTool(ctx, 'pick_board', { said: 'x', event: EVENT.id })
    expect(out.shared_board).toBe('not_set_up')
    expect(out.list.map(r => r.team)).toEqual([254])
  })
})
