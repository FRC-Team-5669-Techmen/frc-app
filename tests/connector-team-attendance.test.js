// The team attendance tools (ledger 0024, migration 0032) through the REAL
// tool runner over the in-memory backend: team_attendance reads every member
// in one call and filters and sorts what the database answered, without
// writing; set_member_status resolves every name first (one unknown or
// ambiguous name writes nothing for anyone), always previews, lists the
// names, and writes only on the confirm token. The database half (staff and
// admin gates, the hours being _member_hours, the log rows) is proved by
// 0032_connector_team_reads_rls_test.sql and tools/sql-harness/mutants-0032.mjs.
import { beforeEach, describe, expect, it } from 'vitest'
import { runTool, toolList } from '../api/_lib/connector/tools.js'
import { FUNCTIONS, TOOLS } from '../api/_lib/connector/registry.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
const row = (o) => ({
  roles: ['student'], status: 'active', approved: true, has_account: true, is_parent_only: false,
  created_at: '2026-08-20T17:00:00Z', hours_total: 0, hours_since: null, check_ins: 0, check_ins_since: null,
  first_check_in: null, last_check_in: null, logged_hours_verified: 0, has_season_application: false,
  trip_invites: 0, trip_answers: 0, last_sign_in: null, nickname: null, ...o,
})
const SUMMARY = [
  row({ member_id: 'm-riley', full_name: 'Riley Two', email: 'riley@x.test', hours_total: 42.5, check_ins: 14, first_check_in: '2026-08-25T23:00:00Z', last_check_in: '2026-10-21T23:00:00Z', has_season_application: true }),
  row({ member_id: 'm-sam', full_name: 'Sam One', email: 'sam@x.test', hours_total: 1.5, check_ins: 1, first_check_in: '2026-08-28T23:00:00Z', last_check_in: '2026-08-28T23:00:00Z' }),
  row({ member_id: 'm-jordan', full_name: 'Jordan Ghost', email: 'jordan@x.test' }),
  row({ member_id: 'm-casey', full_name: 'Casey Gone', email: 'casey@x.test', status: 'inactive', hours_total: 3 }),
  row({ member_id: 'm-max', full_name: 'Max Mentor', email: 'max@x.test', roles: ['mentor'], hours_total: 80, check_ins: 30, last_check_in: '2026-10-22T23:00:00Z' }),
  row({ member_id: 'm-pat', full_name: 'Pat Parent', email: 'pat@x.test', roles: ['parent'], is_parent_only: true }),
  row({ member_id: null, full_name: null, email: 'never@x.test', has_account: false, approved: true }),
]
const MEMBERS = [
  { id: 'm-riley', full_name: 'Riley Two', email: 'riley@x.test', status: 'active', roles: ['student'] },
  { id: 'm-sam', full_name: 'Sam One', email: 'sam@x.test', status: 'active', roles: ['student'] },
  { id: 'm-sam2', full_name: 'Sam Other', email: 'sam2@x.test', status: 'active', roles: ['student'] },
  { id: 'm-jordan', full_name: 'Jordan Ghost', email: 'jordan@x.test', status: 'active', roles: ['student'] },
]

let backend, ctx, rpcCalls
beforeEach(() => {
  backend = memoryBackend()
  rpcCalls = []
  const rpc = backend.rpc
  backend.rpc = async (s, fn, args) => {
    rpcCalls.push({ fn, args })
    if (fn === 'team_attendance_summary') return { data: SUMMARY, error: null }
    if (fn === 'admin_get_members') return { data: MEMBERS, error: null }
    return rpc(s, fn, args)
  }
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map() }
})

describe('team_attendance', () => {
  it('is a read tool and set_member_status asks first', () => {
    expect(TOOLS.team_attendance.kind).toBe('read')
    expect(TOOLS.set_member_status.function).toBe('admin_set_member_status_bulk')
    expect(FUNCTIONS.admin_set_member_status_bulk.level).toBe('confirm')
    const listed = toolList().find((t) => t.name === 'set_member_status')
    expect(listed.inputSchema.properties.members).toMatchObject({ type: 'array', items: { type: 'string' } })
    expect(toolList().find((t) => t.name === 'team_attendance').annotations.readOnlyHint).toBe(true)
  })

  it('lists active members lowest hours first; parents and accountless left out; nothing written', async () => {
    const out = await runTool(ctx, 'team_attendance', { said: 'who has not shown up' })
    expect(out.status).toBe('ok')
    expect(out.members.map((m) => m.name)).toEqual(['Jordan Ghost', 'Sam One', 'Riley Two', 'Max Mentor'])
    expect(out.never_checked_in).toBe(1)
    expect(out.members[0]).toMatchObject({ hours: 0, check_ins: 0, last_check_in: null, email: 'jordan@x.test' })
    expect(out.members.find((m) => m.name === 'Riley Two')).toMatchObject({ last_check_in: '2026-10-21', applied_this_season: true })
    expect(out.members.some((m) => m.parent_only || !m.has_account)).toBe(false)
    expect(backend.state.audit).toHaveLength(0)
    expect(backend.state.calls.filter((c) => !c.direct)).toHaveLength(0)
  })

  it('include all keeps the parent and the accountless email, marked (the positive control for the exclusion)', async () => {
    const out = await runTool(ctx, 'team_attendance', { said: 'everyone', include: 'all' })
    expect(out.count).toBe(6)
    expect(out.members.find((m) => m.email === 'never@x.test')).toMatchObject({ has_account: false, id: null, name: 'never@x.test' })
    expect(out.members.find((m) => m.name === 'Pat Parent').parent_only).toBe(true)
    const every = await runTool(ctx, 'team_attendance', { said: 'everyone', include: 'all', status: 'all' })
    expect(every.count).toBe(7)
  })

  it('filters by role, hours and no check-in since a date', async () => {
    const students = await runTool(ctx, 'team_attendance', { said: 'students under 5 hours', role: 'student', max_hours: 5 })
    expect(students.members.map((m) => m.name)).toEqual(['Jordan Ghost', 'Sam One'])
    const sept = await runTool(ctx, 'team_attendance', { said: "who hasn't checked in since September", no_checkin_since: '2026-09-01', role: 'student' })
    expect(sept.members.map((m) => m.name)).toEqual(['Jordan Ghost', 'Sam One'])
    expect(rpcCalls.find((c) => c.fn === 'team_attendance_summary' && c.args.p_since === '2026-09-01')).toBeTruthy()
    const busy = await runTool(ctx, 'team_attendance', { said: 'over 10', min_hours: 10, sort: 'hours_desc' })
    expect(busy.members.map((m) => m.name)).toEqual(['Max Mentor', 'Riley Two'])
    const gone = await runTool(ctx, 'team_attendance', { said: 'inactive', status: 'inactive' })
    expect(gone.members.map((m) => m.name)).toEqual(['Casey Gone'])
  })

  it('refuses a malformed date, and says not set up before 0032 is applied', async () => {
    expect((await runTool(ctx, 'team_attendance', { said: 'x', since: 'September' })).status).toBe('invalid')
    backend.rpc = async () => ({ data: null, error: { code: 'PGRST202', message: 'no function' } })
    expect((await runTool(ctx, 'team_attendance', { said: 'x' })).status).toBe('not_set_up')
    backend.rpc = async () => ({ data: null, error: { code: '42501', message: 'Only staff can read the whole team attendance.' } })
    expect(await runTool(ctx, 'team_attendance', { said: 'x' })).toMatchObject({ status: 'refused', message: 'Only staff can read the whole team attendance.' })
  })
})

describe('set_member_status', () => {
  const ask = { said: 'mark Jordan and Riley inactive, never came', members: ['Jordan', 'Riley'], status: 'inactive', reason: 'never came' }

  it('previews with every name, writes nothing, then writes on the token with the resolved ids', async () => {
    const p = await runTool(ctx, 'set_member_status', ask)
    expect(p.status).toBe('preview')
    expect(p.confirm_token).toBeTruthy()
    expect(p.members.map((m) => m.name)).toEqual(['Jordan Ghost', 'Riley Two'])
    expect(backend.state.audit).toHaveLength(0)
    const done = await runTool(ctx, 'set_member_status', { ...ask, confirm_token: p.confirm_token })
    expect(done.status).toBe('done')
    expect(backend.state.calls.at(-1)).toMatchObject({ fn: 'admin_set_member_status_bulk', uid: 'u-admin',
      args: { p_members: ['m-jordan', 'm-riley'], p_status: 'inactive', p_reason: 'never came' } })
  })

  it('takes one string with commas and "and"', async () => {
    const p = await runTool(ctx, 'set_member_status', { ...ask, members: 'Jordan, Riley and sam@x.test' })
    expect(p.status).toBe('preview')
    expect(p.members.map((m) => m.name)).toEqual(['Jordan Ghost', 'Riley Two', 'Sam One'])
  })

  it('an ambiguous or unknown name writes nothing for anyone and names the candidates', async () => {
    const two = await runTool(ctx, 'set_member_status', { ...ask, members: ['Jordan', 'Sam'] })
    expect(two.status).toBe('ambiguous')
    expect(two.candidates.map((c) => c.name).sort()).toEqual(['Sam One', 'Sam Other'])
    const none = await runTool(ctx, 'set_member_status', { ...ask, members: ['Jordan', 'Zed Nobody'] })
    expect(none.status).toBe('not_found')
    expect(none.message).toMatch(/nothing was changed for anyone/)
    expect(backend.state.audit).toHaveLength(0)
    expect(backend.state.calls.filter((c) => c.fn === 'admin_set_member_status_bulk')).toHaveLength(0)
  })
})
