// The robot match tools (ledger 0028, migration 0038) through the REAL tool
// runner over the in-memory backend: the three reads use the app's own rules
// (src/robotMatches.js), the GitHub import lists without writing and asks
// first per file, a typed name that could be two members writes nothing, and
// notes go to one match through robot_match_update. The database half is
// 0038_robot_match_log_rls_test.sql and tools/sql-harness/mutants-0038.mjs.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { runTool } from '../api/_lib/connector/tools.js'
import { FUNCTIONS, TOOLS } from '../api/_lib/connector/registry.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'
import { robotFile } from '../src/dev/fixture/features/robotmatches.js'

const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
const MEMBERS = [
  { id: 'm-riley', full_name: 'Riley Student', nickname: 'Riley', status: 'active', roles: ['student'] },
  { id: 'm-sam', full_name: 'Sam Student', nickname: 'Sam', status: 'active', roles: ['student'] },
  { id: 'm-sam2', full_name: 'Samantha Ortiz', nickname: null, status: 'active', roles: ['student'] },
]
const BATT = [{ id: 'b-1', label: 'B01', status: 'competition' }, { id: 'b-2', label: 'B02', status: 'competition' }]
const row = (id, label, at, o = {}) => ({ id, source: 'robot_file', file_name: `${id}.json`, kind: 'practice', started_at: at, match_label: label, event_id: null, alliance: 'red',
  auto_balls: 2, open_balls: 10, closed_balls: 1, passes: 3, ready_pct: 80, battery_min: 11, brownouts: 0, hang_at_seconds: 12, driver_id: 'm-riley', battery_id: 'b-1', scorer_balls_in: null, ...o })
const MATCHES = [
  row('rm-3', 'practice 3', '2026-10-27T20:00:00Z', { open_balls: 20, closed_balls: 0, battery_id: 'b-2', brownouts: 1, battery_min: 9.8 }),
  row('rm-2', 'practice 2', '2026-10-27T19:00:00Z', { driver_id: 'm-sam', ready_pct: 60 }),
  row('rm-1', 'practice 1', '2026-10-26T19:00:00Z'),
  row('rm-1b', 'practice 1', '2026-10-20T19:00:00Z'),
]
const SAMPLE = JSON.parse(readFileSync(new URL('./fixtures/robot-match-sample.json', import.meta.url), 'utf8'))

let backend, ctx, gh
function fakeFetch(files) {
  gh = { calls: [] }
  return async (url) => {
    gh.calls.push(url)
    if (url.startsWith('https://api.github.com/')) {
      if (!files) return { ok: false, status: 404, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => Object.keys(files).map((name) => ({ type: 'file', name, download_url: `https://raw.example/${name}` })) }
    }
    const name = decodeURIComponent(url.split('/').pop())
    return files?.[name] ? { ok: true, status: 200, text: async () => JSON.stringify(files[name]) } : { ok: false, status: 404, text: async () => '' }
  }
}
beforeEach(() => {
  backend = memoryBackend({ rpcImpl: (s, fn, args, st, def) => (fn === 'admin_get_members' ? { data: MEMBERS, error: null } : def(s, fn, args)) })
  backend.select = async (_s, spec) => {
    if (spec.table === 'robot_matches') return { data: spec.eq?.id ? MATCHES.filter((m) => m.id === spec.eq.id).map((m) => ({ ...m, raw: SAMPLE })) : MATCHES, error: null }
    if (spec.table === 'batteries') return { data: BATT, error: null }
    return { data: [], error: null }
  }
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map(), fetch: fakeFetch({}) }
})

describe('the robot match tools', () => {
  it('are in the registry: three reads, two writes that always ask first', () => {
    expect(['list_robot_matches', 'get_robot_match', 'compare_robot_matches'].map((t) => TOOLS[t].kind)).toEqual(['read', 'read', 'read'])
    expect(TOOLS.import_robot_matches_from_github.function).toBe('robot_match_import')
    expect(TOOLS.set_robot_match_notes.function).toBe('robot_match_update')
    expect([FUNCTIONS.robot_match_import.level, FUNCTIONS.robot_match_update.level, FUNCTIONS.robot_match_fill_official.level]).toEqual(['confirm', 'confirm', 'confirm'])
  })

  it('list_robot_matches filters by driver and gives trends; balls in is auto + open hub; nothing written', async () => {
    const all = await runTool(ctx, 'list_robot_matches', { said: 'show the robot matches' })
    expect(all.count).toBe(4)
    expect(all.matches[0]).toMatchObject({ label: 'practice 3', balls_in: 22, closed_hub: 0, driver: 'Riley', battery: 'B02', brownouts: 1 })
    const sam = await runTool(ctx, 'list_robot_matches', { said: 'how did Sam drive', driver: 'Sam Student', trends: true })
    expect(sam.matches.map((m) => m.label)).toEqual(['practice 2'])
    expect(sam.drivers).toEqual([expect.objectContaining({ driver: 'Sam', matches: 1, avg_ready_pct: 60 })])
    expect(backend.state.audit).toHaveLength(0)
  })

  it('list_robot_matches before 0038 says not set up (positive control above)', async () => {
    backend.select = async () => ({ data: null, error: { code: 'PGRST205', message: 'no table' } })
    expect((await runTool(ctx, 'list_robot_matches', { said: 'x' })).status).toBe('not_set_up')
  })

  it('get_robot_match returns the whole stored file; a label played twice asks which', async () => {
    const one = await runTool(ctx, 'get_robot_match', { said: 'show practice 3', match: 'practice 3' })
    expect(one.status).toBe('ok')
    expect(one.robot_file).toEqual(SAMPLE)
    expect(one.not_ready_seconds).toEqual([{ reason: 'tag-only: turret not on hub tag', seconds: 4 }])
    const two = await runTool(ctx, 'get_robot_match', { said: 'show practice 1', match: 'practice 1' })
    expect(two.status).toBe('ambiguous')
    expect(two.candidates.map((c) => c.id)).toEqual(['rm-1', 'rm-1b'])
    expect((await runTool(ctx, 'get_robot_match', { said: 'last', match: 'last' })).match.label).toBe('practice 3')
  })

  it('compare_robot_matches marks the best per row', async () => {
    const out = await runTool(ctx, 'compare_robot_matches', { said: 'compare practice 2 and practice 3', matches: 'practice 2, practice 3' })
    expect(out.status).toBe('ok')
    expect(out.rows.find((r) => r.metric === 'Balls in')).toMatchObject({ values: [12, 22], best: 22 })
    expect(out.rows.find((r) => r.metric === 'Brownouts')).toMatchObject({ values: [0, 1], best: 0 })
    expect((await runTool(ctx, 'compare_robot_matches', { said: 'x', matches: 'practice 2' })).status).toBe('invalid')
  })

  it('import with no file lists what is new on GitHub and writes nothing; an empty folder says so', async () => {
    ctx.fetch = fakeFetch({ 'rm-1.json': SAMPLE, '20261028-103605_practice_9.json': { ...SAMPLE, driver: 'Riley', batteryLabel: 'b2' } })
    const out = await runTool(ctx, 'import_robot_matches_from_github', { said: 'pull the new match files' })
    expect(out.status).toBe('ok')
    expect(out.already_imported).toBe(1)
    expect(out.new_files).toEqual([expect.objectContaining({ file: '20261028-103605_practice_9.json', status: 'new', links: expect.objectContaining({ driver: 'Riley', battery: 'B02' }) })])
    expect(backend.state.audit).toHaveLength(0)
    ctx.fetch = fakeFetch(null)
    ctx.cache = new Map()
    expect((await runTool(ctx, 'import_robot_matches_from_github', { said: 'pull' })).new_files).toEqual([])
  })

  it('import of one file asks first, then sends the whole file with the exact links', async () => {
    const file = '20261028-103605_practice_9.json'
    const raw = { ...SAMPLE, driver: 'Riley', batteryLabel: 'B 2', futureField: 7 }
    ctx.fetch = fakeFetch({ [file]: raw })
    const a = { said: 'import practice 9', file }
    const prev = await runTool(ctx, 'import_robot_matches_from_github', a)
    expect(prev.status).toBe('preview')
    expect(backend.state.calls).toHaveLength(0)
    ctx.cache = new Map()
    const done = await runTool(ctx, 'import_robot_matches_from_github', { ...a, confirm_token: prev.confirm_token })
    expect(done.status).toBe('done')
    const call = backend.state.calls.at(-1)
    expect(call.fn).toBe('robot_match_import')
    expect(call.args.p_raw).toEqual(raw)
    expect(call.args.p_links).toMatchObject({ driver: 'm-riley', battery: 'b-2', operator: null })
  })

  it('a typed name that could be two members writes nothing until he names who; then it goes through', async () => {
    const file = '20261028-103605_practice_9.json'
    ctx.fetch = fakeFetch({ [file]: { ...SAMPLE, driver: 'Sam' } })
    expect((await runTool(ctx, 'import_robot_matches_from_github', { said: 'import', file })).status).toBe('preview') // "Sam" is exactly one nickname
    ctx.cache = new Map()
    ctx.fetch = fakeFetch({ [file]: { ...SAMPLE, driver: 'Sam S' } })
    const amb = await runTool(ctx, 'import_robot_matches_from_github', { said: 'import', file })
    expect(amb.status).toBe('ambiguous')
    expect(amb.message).toMatch(/Sam or Samantha Ortiz|Samantha Ortiz or Sam/)
    expect(backend.state.calls.filter((c) => c.fn === 'robot_match_import')).toHaveLength(0)
    ctx.cache = new Map()
    const ok = await runTool(ctx, 'import_robot_matches_from_github', { said: 'import, Sam drove', file, driver: 'Samantha Ortiz' })
    expect(ok.status).toBe('preview')
  })

  it('a file not on GitHub, or already imported, writes nothing', async () => {
    ctx.fetch = fakeFetch({ 'rm-1.json': SAMPLE })
    expect((await runTool(ctx, 'import_robot_matches_from_github', { said: 'x', file: 'nope.json' })).status).toBe('invalid')
    expect((await runTool(ctx, 'import_robot_matches_from_github', { said: 'x', file: 'rm-1.json' })).status).toBe('already')
    expect(backend.state.calls).toHaveLength(0)
  })

  it('set_robot_match_notes puts the note in the role column and asks first; nothing to add is refused', async () => {
    const a = { said: 'pit note on practice 3: check the breaker', match: 'practice 3', role: 'pit', notes: 'Check the breaker', score: 87 }
    const prev = await runTool(ctx, 'set_robot_match_notes', a)
    expect(prev.status).toBe('preview')
    const done = await runTool(ctx, 'set_robot_match_notes', { ...a, confirm_token: prev.confirm_token })
    expect(done.status).toBe('done')
    expect(backend.state.calls.at(-1)).toMatchObject({ fn: 'robot_match_update', args: { p_id: 'rm-3', p_fields: { notes_pit: 'Check the breaker', match_score: 87 } } })
    expect((await runTool(ctx, 'set_robot_match_notes', { said: 'x', match: 'practice 3' })).status).toBe('invalid')
  })
})
