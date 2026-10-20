// The connector's write machinery and tools, driven through the REAL engine
// and tool runner over an in-memory backend: levels decided by the server,
// confirm tokens, repeats, undo, name resolution, and the gaps. The database
// half (connector_call, RLS, the inner function gates) is proved separately on
// PostgreSQL 16 by tools/connector/harness/proof.mjs.
import { beforeEach, describe, expect, it } from 'vitest'
import { write, undoLast, computeUndo, resolveTemplate } from '../api/_lib/connector/engine.js'
import { runTool, findTools, toolList } from '../api/_lib/connector/tools.js'
import { levelFor, FUNCTIONS, conditionHolds } from '../api/_lib/connector/registry.js'
import { matchScore } from '../api/_lib/connector/resolve.js'
import * as dates from '../api/_lib/connector/dates.js'
import * as hours from '../src/hoursUtils.js'
import { memoryBackend, testClock, testRandom } from './connector/memory-backend.js'

let backend, ctx
const ADMIN = { id: 'u-admin', email: 'admin@example.test' }
beforeEach(() => {
  backend = memoryBackend()
  ctx = { backend, session: { accessToken: 'minted', user: ADMIN }, token: { id: 't1' }, now: testClock(), random: testRandom(), cache: new Map() }
})

const adj = (hoursN) => ({ tool: 'correct_hours', fn: 'staff_add_hour_adjustment', args: { p_member: 'm1', p_category: 'build', p_hours: hoursN, p_reason: 'Saturday fix' } })
const commits = () => backend.state.audit.length

describe('levels come from the registry, never the caller', () => {
  it('adding hours runs at once and is undoable (positive control)', async () => {
    const out = await write(ctx, adj(2))
    expect(out.status).toBe('done')
    expect(out.level).toBe('undo')
    expect(out.undo_available).toBe(true)
    expect(commits()).toBe(1)
  })
  it('lowering hours always previews first and writes nothing', async () => {
    const out = await write(ctx, adj(-1))
    expect(out.status).toBe('preview')
    expect(out.level).toBe('confirm')
    expect(out.confirm_token).toBeTruthy()
    expect(commits()).toBe(0)
  })
  it('the confirm token writes once, only with identical arguments, only once', async () => {
    const p = await write(ctx, adj(-1))
    const other = await write(ctx, adj(-2), { confirmToken: p.confirm_token })
    expect(other.status).toBe('needs_confirmation')
    const p2 = await write(ctx, adj(-1))
    const ok = await write(ctx, adj(-1), { confirmToken: p2.confirm_token })
    expect(ok.status).toBe('done')
    const reuse = await write(ctx, adj(-1), { confirmToken: p2.confirm_token })
    expect(reuse.status).toBe('needs_confirmation')
    expect(commits()).toBe(1)
  })
  it('a made-up token, and a token older than ten minutes, write nothing', async () => {
    expect((await write(ctx, adj(-1), { confirmToken: 'made-up' })).status).toBe('needs_confirmation')
    const p = await write(ctx, adj(-1))
    ctx.now.advance(10 * 60_000 + 1)
    expect((await write(ctx, adj(-1), { confirmToken: p.confirm_token })).status).toBe('needs_confirmation')
    expect(commits()).toBe(0)
  })
  it('dry_run previews an undo-level write without writing', async () => {
    const out = await write(ctx, adj(2), { dryRun: true })
    expect(out.status).toBe('preview')
    expect(out.rows[0].table).toBe('hour_adjustments')
    expect(commits()).toBe(0)
  })
  it('a generated write entry is confirm, and a generated read is read', () => {
    expect(FUNCTIONS.staff_void_session.source).toBe('generated')
    expect(levelFor(FUNCTIONS.staff_void_session, {})).toBe('confirm')
    expect(FUNCTIONS.staff_standing_overview.level).toBe('read')
  })
  it('removing a role, deleting a member, deleting hours: every one asks first', () => {
    expect(levelFor(FUNCTIONS.admin_set_member_role, { p_grant: false })).toBe('confirm')
    expect(levelFor(FUNCTIONS.admin_set_member_role, { p_grant: true })).toBe('undo')
    expect(levelFor(FUNCTIONS.admin_delete_member, {})).toBe('confirm')
    expect(levelFor(FUNCTIONS.staff_delete_logged_hours, {})).toBe('confirm')
    expect(levelFor(FUNCTIONS.staff_add_hour_adjustment, { p_hours: 0 })).toBe('confirm')
    expect(levelFor(FUNCTIONS.staff_send_family_link, {})).toBe('confirm')
  })
  it('conditionHolds reads numbers and booleans, and a missing argument never satisfies', () => {
    expect(conditionHolds('p_hours > 0', { p_hours: '1.5' })).toBe(true)
    expect(conditionHolds('p_hours > 0', { p_hours: -1 })).toBe(false)
    expect(conditionHolds('p_hours > 0', {})).toBe(false)
    expect(conditionHolds('p_grant = true', { p_grant: true })).toBe(true)
    expect(conditionHolds('p_grant = true', { p_grant: 'false' })).toBe(false)
  })
})

describe('repeats never double', () => {
  it('the same request id twice writes once', async () => {
    const a = await write(ctx, adj(2), { requestId: 'r-1' })
    const b = await write(ctx, adj(2), { requestId: 'r-1' })
    expect(a.status).toBe('done')
    expect(b.status).toBe('repeated')
    expect(commits()).toBe(1)
  })
  it('with no request id the derived key repeats; again: true is the deliberate second (positive control)', async () => {
    await write(ctx, adj(2))
    expect((await write(ctx, adj(2))).status).toBe('repeated')
    expect((await write(ctx, adj(2), { again: true })).status).toBe('done')
    expect(commits()).toBe(2)
  })
})

describe('undo', () => {
  it('names the reverse of an hours credit and undo_last runs it once', async () => {
    await write(ctx, adj(2))
    expect(backend.state.audit[0].undo).toEqual({ function: 'staff_add_hour_adjustment', args: { p_member: 'm1', p_category: 'build', p_hours: -2, p_reason: 'Undo through Claude: Saturday fix' } })
    const u = await undoLast(ctx)
    expect(u.status).toBe('done')
    expect(backend.state.calls.at(-1)).toMatchObject({ fn: 'staff_add_hour_adjustment', args: { p_hours: -2 } })
    expect((await undoLast(ctx)).status).toBe('none')
  })
  it('feedback moves are put back from their own result', () => {
    const undo = computeUndo(FUNCTIONS.feedback_set_status.undo, {
      args: { p_ids: ['f1'], p_status: 'done' },
      result: [{ id: 'f1', previous_status: 'new', previous_reviewed_by: null, previous_reviewed_at: null }],
    })
    expect(undo).toEqual({ function: 'feedback_restore_status', args: { p_items: [{ id: 'f1', status: 'new', reviewed_by: null, reviewed_at: null }], p_from: 'done' } })
    expect(computeUndo(FUNCTIONS.feedback_set_status.undo, { args: { p_ids: ['f1'], p_status: 'done' }, result: [] })).toBeNull()
  })
  it('a role given is taken back only when it was not already held', () => {
    const alts = FUNCTIONS.admin_set_member_role.undo
    expect(computeUndo(alts, { args: { p_member: 'm', p_role: 'lead', p_grant: true }, before: { found: true, had: false } })).toMatchObject({ args: { p_grant: false } })
    expect(computeUndo(alts, { args: { p_member: 'm', p_role: 'lead', p_grant: true }, before: { found: true, had: true } })).toBeNull()
  })
  it('templates that resolve to nothing offer no reverse', () => {
    expect(resolveTemplate('$args.missing', { args: {} })).toBeUndefined()
    expect(resolveTemplate({ negate: '$args.p_hours' }, { args: { p_hours: '1.5' } })).toBe(-1.5)
  })
})

describe('the tools', () => {
  it('every tool takes said, and every change tool takes the write options', () => {
    const list = toolList()
    expect(list.length).toBeGreaterThan(15)
    for (const t of list) expect(t.inputSchema.required).toContain('said')
    const correct = list.find((t) => t.name === 'correct_hours')
    expect(Object.keys(correct.inputSchema.properties)).toEqual(expect.arrayContaining(['request_id', 'dry_run', 'confirm_token', 'again']))
    expect(list.find((t) => t.name === 'list_members').inputSchema.properties.confirm_token).toBeUndefined()
  })
  it('correct_hours resolves the name and writes as him; an unknown name writes nothing', async () => {
    const real = backend.rpc
    backend.rpc = async (s, fn, args) => (fn === 'admin_get_members'
      ? { data: [{ id: 'm-riley', full_name: 'Riley Student', nickname: null, email: 'riley@x', status: 'active', roles: ['student'] }], error: null }
      : real(s, fn, args))
    const out = await runTool(ctx, 'correct_hours', { said: 'give Riley two build hours', member: 'Riley', hours: 2, category: 'build', reason: 'fix' })
    expect(out.status).toBe('done')
    expect(backend.state.calls.at(-1)).toMatchObject({ fn: 'staff_add_hour_adjustment', uid: 'u-admin', args: { p_member: 'm-riley', p_hours: 2 } })
    const none = await runTool({ ...ctx, cache: new Map() }, 'correct_hours', { said: 'x', member: 'Nobody', hours: 2, category: 'build', reason: 'fix' })
    expect(none.status).toBe('not_found')
  })
  it('two members with one first name is ambiguous, and nothing is written', async () => {
    let wrote = 0
    backend.rpc = async (s, fn) => {
      if (fn === 'admin_get_members') return { data: [{ id: 'a', full_name: 'Daniel Ruiz', email: 'dr@x', status: 'active' }, { id: 'b', full_name: 'Daniel Ortega', email: 'do@x', status: 'active' }], error: null }
      wrote += 1
      return { data: null, error: null }
    }
    const out = await runTool(ctx, 'correct_hours', { said: 'x', member: 'Daniel', hours: 1, category: 'build', reason: 'r' })
    expect(out.status).toBe('ambiguous')
    expect(out.candidates).toHaveLength(2)
    expect(wrote).toBe(0)
    expect(matchScore('Daniel R', { full_name: 'Daniel Ruiz' })).toBeGreaterThan(matchScore('Daniel R', { full_name: 'Daniel Ortega' }))
  })
  it('create_event and feedback_reply say plainly they are not available and point at report_gap', async () => {
    for (const name of ['create_event', 'feedback_reply']) {
      const out = await runTool(ctx, name, { said: 'x' })
      expect(out.status).toBe('not_available')
      expect(out.message).toMatch(/report_gap/)
    }
  })
  it('find_tool finds a generated action and call_app refuses an unknown or excluded one', async () => {
    expect(findTools('void a session').map((h) => h.name)).toContain('staff_void_session')
    const unknown = await runTool(ctx, 'call_app', { said: 'x', name: 'drop_everything', args: {} })
    expect(unknown.status).toBe('not_found')
    const excluded = await runTool(ctx, 'call_app', { said: 'x', name: 'family_call', args: {} })
    expect(excluded.status).toBe('not_available')
  })
  it('call_app refuses arguments that fit no form, naming what it takes', async () => {
    const out = await runTool(ctx, 'call_app', { said: 'x', name: 'staff_void_session', args: { p_reason: 'r' } })
    expect(out.status).toBe('invalid')
    expect(out.message).toMatch(/p_member/)
  })
})

describe('the LA date copy in api/ matches src/hoursUtils.js', () => {
  it('every hour of 2026, both DST changes included', () => {
    const start = Date.UTC(2026, 0, 1)
    let checked = 0
    for (let t = start; t < Date.UTC(2027, 0, 1); t += 3600_000) {
      expect(dates.laDateKey(t)).toBe(hours.laDateKey(t))
      checked += 1
    }
    for (const d of ['2026-03-08', '2026-11-01', '2026-10-19', '2026-01-01']) expect(dates.laMidnightMs(d)).toBe(hours.laMidnightMs(d))
    expect(checked).toBe(8760)
  })
})
