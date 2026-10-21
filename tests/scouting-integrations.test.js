import { describe, it, expect, vi } from 'vitest'
import { dispatchScouting, scoutingDiscordPayload } from '../supabase/functions/scouting-dispatch/dispatch.js'
import { importScouting, normalizeMatches, normalizeTeamPreview } from '../supabase/functions/scouting-import/import.js'
import { write } from '../api/_lib/connector/engine.js'
import { runTool } from '../api/_lib/connector/tools.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

const id = '20000000-0000-4000-8000-000000000002'
const userId = '10000000-0000-4000-8000-000000000001'
const env = { DISCORD_BOT_TOKEN: 'private-bot-token', DISCORD_GUILD_ID: '123456789012345678', TBA_AUTH_KEY: 'private-tba-key', NEXUS_API_KEY: 'private-nexus-key' }
const record = { id, event_id: id, member_id: userId, kind: 'message', team_number: 4414, version: 1, payload: { text: 'Auto stopped. @everyone <@123456789012345678>', request_delivery: true } }
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

function fixture({ manager = false, user = userId, visible = true } = {}) {
  let state = { id: 'delivery', status: 'queued' }
  const userClient = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: visible ? record : null }) }) }) }),
    rpc: vi.fn(async () => ({ data: manager })),
  }
  const serviceClient = { rpc: vi.fn(async (fn, args) => {
    if (fn === 'scouting_claim_delivery') {
      const claimed = ['queued', 'failed', 'not_configured'].includes(state.status)
      if (claimed) state = { ...state, status: 'sending' }
      return { data: { record, delivery: state, claimed } }
    }
    state = { ...state, status: args.p_status, message_id: args.p_message_id, error: args.p_error }
    return { data: state }
  }) }
  const fetchImpl = vi.fn(async (_, opts) => opts.method === 'POST'
    ? response({ id: '987654321098765432' })
    : response([{ id: '222222222222222222', name: 'scouting', type: 0 }]))
  return { userClient, serviceClient, fetchImpl, env, body: { record_id: id, version: 1 }, state: () => state }
}

describe('scouting Discord delivery with mocked network', () => {
  it('reserves, sends once and distinguishes the stored receipt from the note', async () => {
    const f = fixture()
    expect((await dispatchScouting(f)).status).toBe('delivered')
    expect((await dispatchScouting(f)).status).toBe('delivered')
    expect(f.fetchImpl.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1)
    expect(f.serviceClient.rpc.mock.calls[0][0]).toBe('scouting_claim_delivery')
    expect(record.payload.text).toContain('Auto stopped')
  })
  it('two simultaneous requests share one atomic reservation', async () => {
    const f = fixture()
    const outcomes = await Promise.all([dispatchScouting(f), dispatchScouting(f)])
    expect(outcomes.some(out => out.status === 'delivered')).toBe(true)
    expect(f.fetchImpl.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1)
  })
  it('has no arbitrary mention capability even when the note contains one', () => {
    const payload = scoutingDiscordPayload(record)
    expect(payload.allowed_mentions).toEqual({ parse: [], users: [], roles: [], replied_user: false })
    expect(payload.content).not.toContain('@everyone')
    expect(payload.content).toContain('Auto stopped')
  })
  it('refuses inaccessible, anonymous and nonowner requests before any service call, while allowing a manager', async () => {
    for (const opts of [{ visible: false }, { user: null }, { user: 'someone-else' }]) {
      const f = fixture(opts)
      expect((await dispatchScouting(f)).http).toBeGreaterThanOrEqual(401)
      expect(f.serviceClient.rpc).not.toHaveBeenCalled()
      expect(f.fetchImpl).not.toHaveBeenCalled()
    }
    expect((await dispatchScouting(fixture({ user: 'someone-else', manager: true }))).status).toBe('delivered')
  })
  it('refuses a stale version and malformed record id before reserving', async () => {
    for (const body of [{ record_id: id, version: 2 }, { record_id: 'https://evil.test', version: 1 }]) {
      const f = fixture()
      expect((await dispatchScouting({ ...f, body })).http).toBeGreaterThanOrEqual(400)
      expect(f.serviceClient.rpc).not.toHaveBeenCalled()
    }
    expect((await dispatchScouting(fixture())).status).toBe('delivered')
  })
  it('reports configuration failure without losing the note or calling Discord', async () => {
    const f = fixture()
    expect((await dispatchScouting({ ...f, env: {} })).status).toBe('not_configured')
    expect(f.fetchImpl).not.toHaveBeenCalled()
    expect((await dispatchScouting(f)).status).toBe('delivered')
  })
  it.each([429, 403])('definitive HTTP %i refusal is visible and an explicit retry can recover', async status => {
    const f = fixture()
    const normal = f.fetchImpl
    f.fetchImpl = vi.fn(async (url, options) => options.method === 'POST' ? response({}, status) : normal(url, options))
    expect((await dispatchScouting(f)).status).toBe('failed')
    expect((await dispatchScouting({ ...f, fetchImpl: normal })).status).toBe('delivered')
  })
  it.each(['drop', '500', 'bad_receipt'])('ambiguous %s result never automatically resends', async kind => {
    const f = fixture()
    const normal = f.fetchImpl
    f.fetchImpl = vi.fn(async (url, options) => {
      if (options.method !== 'POST') return normal(url, options)
      if (kind === 'drop') throw new Error('private-bot-token')
      return kind === '500' ? response({}, 500) : response({})
    })
    const first = await dispatchScouting(f)
    expect(first.status).toBe('uncertain')
    expect(JSON.stringify(first)).not.toContain('private-bot-token')
    await dispatchScouting(f)
    expect(f.fetchImpl.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1)
    expect((await dispatchScouting(fixture())).status).toBe('delivered')
  })
  it('a failed receipt write keeps the reservation and reports uncertainty', async () => {
    const f = fixture()
    const rpc = f.serviceClient.rpc
    f.serviceClient.rpc = vi.fn((fn, args) => fn === 'scouting_finish_delivery' ? { error: { message: 'offline' } } : rpc(fn, args))
    expect((await dispatchScouting(f)).status).toBe('uncertain')
    expect(f.state().status).toBe('sending')
    await dispatchScouting(f)
    expect(f.fetchImpl.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1)
  })
})

const rawMatches = [{ key: '2026dal_qm1', alliances: { red: { team_keys: ['frc4414', 'frc1323', 'frc5669'], score: 320 }, blue: { team_keys: ['frc1'], score: -1 } }, score_breakdown: { red: { hubScore: 300 }, blue: null }, videos: [{ type: 'youtube', key: 'XM7l9Z1HiDs' }] }]
const imported = { event_id: id, event_key: '2026dal' }
describe('read-only provider import with mocked upstreams', () => {
  it('retains alliance totals and treats unavailable robot contribution and estimates as unknown', () => {
    const matches = normalizeMatches(rawMatches)
    expect(matches[0].alliances.blue.score).toBeNull()
    const teams = normalizeTeamPreview({ teams: [{ team_number: 4414, nickname: 'HighTide' }], matches, eventKey: '2026dal', fetchedAt: '2026-10-21T00:00:00Z' })
    expect(teams[0].payload.official_results[0]).toMatchObject({ alliance_score: 320, score_breakdown: { hubScore: 300 } })
    expect(teams[0].payload.epa).toBeNull()
    expect(teams[0].payload).not.toHaveProperty('robot_score')
    const positive = normalizeTeamPreview({ teams: [{ team_number: 4414 }], estimates: [{ team: 4414, event: '2026dal', epa: { total_points: 91.25 } }], eventKey: '2026dal', fetchedAt: '2026-10-21T00:00:00Z' })
    expect(positive[0].payload.epa).toBe(91.25)
  })
  it('bounds imported team numbers to the same 1..99999 contract as scouting SQL', () => {
    const teams = normalizeTeamPreview({ teams: [{ team_number: 0 }, { team_number: 99999 }, { team_number: 100000 }], eventKey: '2026dal' })
    expect(teams.map(t => t.team_number)).toEqual([99999])
    expect(() => normalizeMatches([{ ...rawMatches[0], alliances: { ...rawMatches[0].alliances, red: { team_keys: ['frc100000'], score: 0 } } }])).toThrow('Unexpected match schema')
    expect(normalizeMatches(rawMatches)[0].alliances.red.teams).toContain(4414)
  })
  it('fetches fixed endpoints with documented headers and returns a preview, never a write', async () => {
    const f = fixture({ manager: true })
    const fetchImpl = vi.fn(async url => response(url.endsWith('/teams/simple') ? [{ team_number: 4414, nickname: 'HighTide' }] : url.endsWith('/matches') ? rawMatches : url.endsWith('/pits') ? { '4414': 'A1' } : [{ team: 4414, event: '2026dal', epa: { total_points: 91.25 } }]))
    const result = await importScouting({ ...f, body: imported, fetchImpl })
    expect(result.teams[0].payload).toMatchObject({ name: 'HighTide', pit_location: 'A1', epa: 91.25 })
    expect(result.sources.filter(s => s.status === 'ok')).toHaveLength(4)
    expect(fetchImpl.mock.calls.find(([u]) => u.endsWith('/pits'))[1].headers).toEqual({ 'Nexus-Api-Key': env.NEXUS_API_KEY })
    expect(f.userClient.rpc.mock.calls.map(c => c[0])).toEqual(['scouting_can_manage'])
    expect(f.serviceClient.rpc).not.toHaveBeenCalled()
  })
  it('preserves valid data alongside provider failures without exposing credentials', async () => {
    const f = fixture({ manager: true })
    const fetchImpl = vi.fn(async url => {
      if (url.endsWith('/teams/simple')) return response([{ team_number: 4414, nickname: 'HighTide' }])
      throw new Error('private-tba-key private-nexus-key')
    })
    const result = await importScouting({ ...f, body: imported, fetchImpl })
    expect(result.teams).toHaveLength(1)
    expect(result.teams[0].payload).not.toHaveProperty('epa')
    expect(result.teams[0].payload).not.toHaveProperty('pit_location')
    expect(result.teams[0].payload).not.toHaveProperty('official_results')
    expect(result.sources.filter(s => s.status === 'unavailable')).toHaveLength(3)
    expect(JSON.stringify(result)).not.toContain('private-')
  })
  it('refuses nonmanagers and malicious event keys without a network request', async () => {
    const f = fixture()
    for (const body of [imported, { ...imported, event_key: '../../private' }, { ...imported, event_key: 'https://evil.test' }]) {
      expect((await importScouting({ ...f, body })).http).toBeGreaterThanOrEqual(400)
      expect(f.fetchImpl).not.toHaveBeenCalled()
    }
    expect((await importScouting({ ...fixture({ manager: true }), body: imported, env: {}, fetchImpl: async () => response([]) })).http).toBe(200)
  })
  it('rejects malformed provider schema and preserves usable source data', async () => {
    const f = fixture({ manager: true })
    const fetchImpl = vi.fn(async url => response(url.endsWith('/teams/simple') ? [{ team_number: 4414 }]
      : url.endsWith('/matches') ? [{ key: '2026dal_qm1', alliances: {} }]
        : url.endsWith('/pits') ? [] : [{ team: 4414, event: '2026dal', epa: { total_points: { mean: 91.25 } } }]))
    const result = await importScouting({ ...f, body: imported, fetchImpl })
    expect(result.teams).toHaveLength(1)
    expect(result.sources.filter(s => s.status === 'invalid')).toHaveLength(3)
    expect(result.teams[0].payload).not.toHaveProperty('official_results')
    expect(result.teams[0].payload).not.toHaveProperty('epa')
    expect(result.teams[0].payload).not.toHaveProperty('pit_location')
    expect(result.teams[0].payload.name).toBe('Team 4414')
  })
})

describe('connector delivery follows confirmed commits only', () => {
  it('binds scouting authorship to the connector session, even if the request supplies another actor', async () => {
    const backend = memoryBackend()
    const ctx = { backend, session: { accessToken: 'minted-user', user: { id: 'u-admin' } }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map() }
    const args = { p_id: id, p_event: id, p_kind: 'message', p_team: 4414, p_match: null, p_payload: record.payload, p_expected_version: 0, p_operation: id, p_actor: 'another-account' }
    const preview = await runTool(ctx, 'call_app', { name: 'scouting_save', args })
    expect(preview.status).toBe('preview')
    expect(preview.rows[0].row.p_actor).toBe('u-admin')
    const done = await runTool(ctx, 'call_app', { name: 'scouting_save', args, confirm_token: preview.confirm_token })
    expect(done.status).toBe('done')
    expect(backend.state.calls.at(-1).args.p_actor).toBe('u-admin')
  })
  it('does not send from a preview, sends as the same session after commit, and preserves saved data on delivery failure', async () => {
    const backend = memoryBackend()
    const ctx = { backend, session: { accessToken: 'minted-user', user: { id: 'u-admin' } }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map() }
    backend.scoutingDispatch = vi.fn(async () => ({ error: { message: 'unavailable' } }))
    const rpc = backend.rpc
    backend.rpc = async (session, fn, args) => {
      const result = await rpc(session, fn, args)
      if (fn === 'connector_call' && args.p_mode === 'commit' && result.data) result.data.result = record
      return result
    }
    const plan = { tool: 'call_app', fn: 'scouting_save', args: { p_id: id, p_event: id, p_kind: 'message', p_team: 4414, p_match: null, p_payload: record.payload, p_expected_version: 0, p_operation: id, p_actor: 'u-admin' } }
    const preview = await write(ctx, plan)
    expect(preview.status).toBe('preview')
    expect(backend.scoutingDispatch).not.toHaveBeenCalled()
    const saved = await write(ctx, plan, { confirmToken: preview.confirm_token })
    expect(saved.status).toBe('done')
    expect(saved.delivery.status).toBe('queued')
    expect(backend.scoutingDispatch).toHaveBeenCalledWith(ctx.session, { record_id: id, version: 1 })
    expect(backend.state.audit).toHaveLength(1)
  })
})
