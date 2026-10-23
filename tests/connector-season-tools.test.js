// The season and competition tools of ledger 0024 Part 2 through the REAL
// tool runner over the in-memory backend: sign_in_out (staff_add_event, undo,
// refusing a double IN, an OUT with nothing open, and a waiting sign-out),
// trip_signups (families not answered, FIRST registration ticks),
// auto_routines (the page rule in src/autos.js) and preview_announcement
// (the Discord dry run only; the action is fixed in backend.js).
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runTool } from '../api/_lib/connector/tools.js'
import { FUNCTIONS, TOOLS } from '../api/_lib/connector/registry.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
const MEMBERS = [
  { id: 'm-riley', full_name: 'Riley Two', email: 'riley@x.test', status: 'active', roles: ['student'] },
  { id: 'm-sam', full_name: 'Sam One', email: 'sam@x.test', status: 'active', roles: ['student'] },
  { id: 'm-jo', full_name: 'Jo Three', email: 'jo@x.test', status: 'active', roles: ['student'] },
]
const NOW = Date.parse('2026-10-19T19:00:00Z')
let tables, backend, ctx, previews
beforeEach(() => {
  tables = {
    attendance_events: { 'm-riley': [{ type: 'in', event_time: new Date(NOW - 2 * 3600_000).toISOString() }], 'm-sam': [{ type: 'out', event_time: new Date(NOW - 26 * 3600_000).toISOString() }], 'm-jo': [{ type: 'in', event_time: new Date(NOW - 3600_000).toISOString() }] },
    signout_requests: { 'm-jo': [{ id: 'sr-1' }] },
  }
  backend = memoryBackend()
  previews = []
  backend.select = async (_s, spec) => {
    if (spec.table === 'attendance_events') return { data: tables.attendance_events[spec.eq.user_id] ?? [], error: null }
    if (spec.table === 'signout_requests') return { data: tables.signout_requests[spec.eq.member_id] ?? [], error: null }
    if (spec.table === 'hub_invites') return { data: [{ id: 'i1', student_id: 'm-riley', emails: ['a@x'] }, { id: 'i2', student_id: 'm-sam', emails: [] }, { id: 'i3', student_id: 'm-jo', emails: ['b@x'] }], error: null }
    if (spec.table === 'hub_responses') return { data: [{ invite_id: 'i1', first_reg_done: true, school_form_done: true }, { invite_id: 'i3', first_reg_done: false, school_form_done: true }].filter((r) => spec.in.invite_id.includes(r.invite_id)), error: null }
    if (spec.table === 'auto_routines') return { data: [{ id: 'a1', name: 'Two piece', active: true }, { id: 'a2', name: 'Taxi', active: true }, { id: 'a3', name: 'Old', active: false }], error: null }
    if (spec.table === 'auto_runs') {
      const runs = [...Array(5)].map((_, k) => ({ id: `r${k}`, routine_id: 'a2', result: 'success', ran_at: `2026-10-1${k}T18:00:00Z` }))
      runs.push({ id: 'rx', routine_id: 'a1', result: 'fail', ran_at: '2026-10-18T18:00:00Z', problem: 'Hit the wall' })
      return { data: runs, error: null }
    }
    if (spec.table === 'batteries') return { data: [{ id: 'b-7', label: 'B07', status: 'competition', charge_state: 'charged' }], error: null }
    if (spec.table === 'discord_announce_roles') return { data: [{ name: 'Parents', role_id: '111111111111111111', active: true }, { name: 'Build', role_id: '222222222222222222', active: true }], error: null }
    return { data: [], error: null }
  }
  backend.announcePreview = async (_s, draft) => { previews.push(draft); return { data: { ok: true, payload: { content: draft.content } }, error: null } }
  const rpc = backend.rpc
  backend.rpc = async (s, fn, args) => fn === 'admin_get_members' ? { data: MEMBERS, error: null }
    : fn === 'hub_member_events' ? { data: [{ id: 'h1', title: 'Beach Blitz 2026', starts_on: '2026-10-30', over: false }], error: null }
    : rpc(s, fn, args)
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: testClock(NOW), random: testRandom(), cache: new Map() }
})

describe('sign_in_out', () => {
  it('is staff_add_event at undo, reversed by staff_void_event', () => {
    expect(TOOLS.sign_in_out.function).toBe('staff_add_event')
    expect(FUNCTIONS.staff_add_event.level).toBe('undo')
    expect(FUNCTIONS.staff_add_event.undo[0].function).toBe('staff_void_event')
  })
  it('signs Sam in now, as him, with build and a reason', async () => {
    const out = await runTool(ctx, 'sign_in_out', { said: 'sign Sam in', member: 'Sam', direction: 'in' })
    expect(out.status).toBe('done')
    expect(backend.state.calls.at(-1)).toMatchObject({ fn: 'staff_add_event', uid: 'u-admin',
      args: { p_member: 'm-sam', p_type: 'in', p_event_time: new Date(NOW).toISOString(), p_category: 'build' } })
    expect(backend.state.calls.at(-1).args.p_reason).toMatch(/Claude/)
  })
  it('signs Riley out at a time he said, read as Los Angeles time', async () => {
    const out = await runTool(ctx, 'sign_in_out', { said: 'Riley left at 11', member: 'Riley', direction: 'out', at: '2026-10-19 11:00' })
    expect(out.status).toBe('done')
    expect(backend.state.calls.at(-1).args.p_event_time).toBe('2026-10-19T18:00:00.000Z')
  })
  it('refuses a second IN, an OUT with nothing open, and sends a waiting sign-out to approve_signout; nothing written', async () => {
    expect((await runTool(ctx, 'sign_in_out', { said: 'x', member: 'Riley', direction: 'in' })).status).toBe('already')
    expect((await runTool(ctx, 'sign_in_out', { said: 'x', member: 'Sam', direction: 'out' })).status).toBe('already')
    expect((await runTool(ctx, 'sign_in_out', { said: 'x', member: 'Jo', direction: 'out' })).status).toBe('use_approve_signout')
    expect(backend.state.calls.filter((c) => c.fn === 'staff_add_event')).toHaveLength(0)
    expect(backend.state.audit).toHaveLength(0)
  })
})

describe('trip_signups', () => {
  it('lists the family that has not answered first and the one without FIRST registration', async () => {
    const out = await runTool(ctx, 'trip_signups', { said: 'who has not signed up for Beach Blitz', trip: 'beach' })
    expect(out).toMatchObject({ status: 'ok', invited: 3, answered: 2, not_answered: ['Sam One'], first_registration_not_done: ['Jo Three'] })
    expect(out.families[0].student).toBe('Sam One')
    expect(out.families.find((f) => f.student === 'Riley Two')).toMatchObject({ answered: true, first_registration: true })
    expect((await runTool(ctx, 'trip_signups', { said: 'x', trip: 'nationals' })).status).toBe('not_found')
  })
})

describe('auto_routines', () => {
  it('ranks with the page rule: five in a row is ready, retired hidden unless all', async () => {
    const out = await runTool(ctx, 'auto_routines', { said: 'which autos are ready' })
    expect(out.routines.map((r) => r.name)).toEqual(['Taxi', 'Two piece'])
    expect(out.routines[0]).toMatchObject({ ready: true, streak: 5, success_rate: 100 })
    expect(out.routines[1]).toMatchObject({ ready: false, streak: 0, last: { problem: 'Hit the wall' } })
    expect((await runTool(ctx, 'auto_routines', { said: 'x', show: 'ready' })).routines.map((r) => r.name)).toEqual(['Taxi'])
    expect((await runTool(ctx, 'auto_routines', { said: 'x', show: 'all' })).routines).toHaveLength(3)
  })
})

describe('log_auto_run', () => {
  it('asks first, then logs the routine and battery resolved by name', async () => {
    expect(FUNCTIONS.auto_log_run.level).toBe('confirm')
    const ask = { said: 'taxi auto failed on B07, hit the wall', routine: 'taxi', result: 'fail', problem: 'Hit the wall', battery: 'b7' }
    const p = await runTool(ctx, 'log_auto_run', ask)
    expect(p.status).toBe('preview')
    expect(backend.state.calls.filter((c) => c.fn === 'auto_log_run')).toHaveLength(0)
    const done = await runTool(ctx, 'log_auto_run', { ...ask, confirm_token: p.confirm_token })
    expect(done.status).toBe('done')
    expect(backend.state.calls.at(-1)).toMatchObject({ fn: 'auto_log_run', args: { p_routine: 'a2', p_result: 'fail', p_problem: 'Hit the wall', p_battery: 'b-7' } })
  })
  it('without a battery sends none; a retired routine loses a tie; an unknown one writes nothing', async () => {
    const p = await runTool(ctx, 'log_auto_run', { said: 'two piece success', routine: 'two piece', result: 'success' })
    expect(p.status).toBe('preview')
    const done = await runTool(ctx, 'log_auto_run', { said: 'two piece success', routine: 'two piece', result: 'success', confirm_token: p.confirm_token })
    expect(done.status).toBe('done')
    expect(backend.state.calls.at(-1).args).toEqual({ p_routine: 'a1', p_result: 'success' })
    expect((await runTool(ctx, 'log_auto_run', { said: 'x', routine: 'nope', result: 'success' })).status).toBe('not_found')
  })
})

describe('preview_announcement', () => {
  it('sends a dry run with the named roles resolved to ids, and says nothing was posted', async () => {
    const out = await runTool(ctx, 'preview_announcement', { said: 'tell parents build is canceled', message: 'Build is canceled', channel: 'parents', roles: ['parents'] })
    expect(out).toMatchObject({ status: 'ok', posted: false })
    expect(previews).toEqual([{ channel: 'parents', content: 'Build is canceled', roleIds: ['111111111111111111'] }])
    const bad = await runTool(ctx, 'preview_announcement', { said: 'x', message: 'Hi', roles: ['Everyone'] })
    expect(bad.status).toBe('not_found')
    expect(previews).toHaveLength(1)
    expect(backend.state.audit).toHaveLength(0)
  })
  it('the backend can only ask the Discord function for a preview', () => {
    const src = readFileSync(new URL('../api/_lib/connector/backend.js', import.meta.url), 'utf8')
    const calls = src.match(/functions\.invoke\('discord-announce'[^\n]*/g) ?? []
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain("action: 'preview'")
    expect(src).not.toMatch(/action: 'send'/)
  })
})
