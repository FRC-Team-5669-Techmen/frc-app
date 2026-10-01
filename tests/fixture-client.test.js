// The fixture-mode query engine (src/dev/fixture/engine.js) against its
// in-memory store, under node: no window, no localStorage, no Vite.
//
// Every assertion that something is refused, missing, empty or zero is paired
// with the same fixture driven the other way, so an engine that had stopped
// answering at all could not pass this file.

import { describe, it, expect, beforeEach } from 'vitest'
import { createEngine, uuid, parseSelect, parseLogic, migrationApplied } from '../src/dev/fixture/engine.js'
import { SCHEMA } from '../src/dev/fixture/schema.js'
import core from '../src/dev/fixture/core.js'
import { IDS, PERSONAS, resolvePersona } from '../src/dev/fixture/personas.js'
import { CORE_IDS } from '../src/dev/fixture/seed.js'
import { isSchemaMissing, isMissingColumn, isMissingTable, isMissingFunction } from '../src/schemaMissing.js'
import { detectAnomalies } from '../src/accountability.js'

const NOW = new Date('2026-10-01T16:00:00-07:00') // a Thursday afternoon in LA

// A feature plugin shaped exactly like the README contract, behind a
// migration number no real lane uses.
const widgets = {
  name: 'test-widgets',
  migration: '0099',
  creates: {
    tables: ['fx_widgets'],
    rpcs: ['fx_widget_count'],
    columns: { feedback: ['tried'] },
  },
  seed: ({ ids }) => ({
    fx_widgets: [{ id: 'w1', owner: ids.student, label: 'left' }, { id: 'w2', owner: ids.admin, label: 'right' }],
    feedback: [{ member_id: ids.student, category: 'bug', message: 'with tried', tried: 'reloaded' }],
  }),
  rpcs: { fx_widget_count: ({ db }) => ({ data: (db.fx_widgets ?? []).length, error: null }) },
  relations: { 'fx_widgets.owner_profile': { local: 'owner', foreign: 'id', table: 'profiles', one: true } },
  visible: { fx_widgets: ({ row, persona }) => persona?.isStaff || row.owner === persona?.id },
}

function setup({ persona = 'student', migrations = 'all', plugins = [core, widgets] } = {}) {
  const store = { db: {} }
  const ctx = { persona, migrations }
  const engine = createEngine({
    schema: SCHEMA,
    plugins,
    store,
    now: () => NOW,
    context: () => ({
      user: PERSONAS[ctx.persona] ? { id: PERSONAS[ctx.persona].id, email: PERSONAS[ctx.persona].email } : null,
      persona: resolvePersona(ctx.persona, store.db),
      migrations: ctx.migrations,
    }),
  })
  const problems = engine.seedAll({ ids: IDS, now: NOW, uuid })
  return { engine, store, ctx, problems, db: () => store.db }
}

let f
beforeEach(() => { f = setup() })

describe('seed', () => {
  it('seeds every core table with no constraint problem', () => {
    expect(f.problems).toEqual([])
    for (const t of ['profiles', 'attendance_events', 'events', 'tasks', 'member_applications', 'surveys']) {
      expect(f.db()[t].length).toBeGreaterThan(0)
    }
  })
  it('reports a bad seed row rather than hiding it (positive control for the clean seed)', () => {
    const bad = { name: 'bad', migration: null, seed: () => ({ attendance_events: [{ user_id: IDS.student, type: 'sideways' }] }) }
    const g = setup({ plugins: [core, bad] })
    expect(g.problems.some((p) => /attendance_events_type_check/.test(p.problem))).toBe(true)
  })
  it('opens the shop now and leaves the check-in personas a clean day', () => {
    const build = f.db().events.find((e) => e.id === CORE_IDS.buildNow)
    expect(build.kind).toBe('build')
    expect(Date.parse(build.starts_at)).toBeLessThanOrEqual(NOW.getTime())
    expect(Date.parse(build.ends_at)).toBeGreaterThan(NOW.getTime())
    const todayStart = new Date('2026-10-01T00:00:00-07:00').toISOString()
    const today = (id) => f.db().attendance_events.filter((e) => e.user_id === id && e.event_time >= todayStart)
    expect(today(IDS.student)).toEqual([])
    expect(today(IDS.exempt)).toEqual([])
    // ...while somebody else IS in, so "nobody today" is not just an empty table.
    expect(f.db().attendance_events.filter((e) => e.event_time >= todayStart && e.type === 'in').length).toBeGreaterThan(0)
  })
  it('seeds exactly the deliberate attendance anomalies, as the app detects them', () => {
    // Per member, as VerifyHoursPage.fetchAnomalies runs it. The detector is
    // the app's own (src/accountability.js); a stray generator overlap would
    // show up here as an extra double_in.
    const byMember = {}
    for (const e of f.db().attendance_events) (byMember[e.user_id] ??= []).push(e)
    const exempt = new Set(f.db().profiles.filter((p) => p.geofence_exempt).map((p) => p.id))
    const found = Object.entries(byMember).flatMap(([uid, evs]) =>
      detectAnomalies(evs, { exempt: exempt.has(uid) }).map((a) => `${a.kind} ${uid.slice(-2)}`))
    expect(found.sort()).toEqual(['capped c6', 'double_in c9'])
    // Positive control: the same detector flags the exempt member's fence skip
    // once the exemption is taken away.
    const casey = byMember[IDS.exempt]
    expect(detectAnomalies(casey, { exempt: false }).map((a) => a.kind)).toContain('geofence')
  })
  it('gives every student persona an application for the season spanning today', () => {
    const season = f.db().seasons.find((s) => s.start_date <= '2026-10-01' && s.end_date >= '2026-10-01')
    for (const key of ['student', 'student2', 'exempt']) {
      expect(f.db().member_applications.some((a) => a.member_id === PERSONAS[key].id && a.season_id === season.id)).toBe(true)
    }
    expect(f.db().member_applications.some((a) => a.member_id === IDS.parent)).toBe(false)
  })
})

describe('select', () => {
  it('projects named columns only, and * as every schema column', async () => {
    const named = await f.engine.from('profiles').select('id, nickname').eq('id', IDS.student).single()
    expect(Object.keys(named.data)).toEqual(['id', 'nickname'])
    const star = await f.engine.from('profiles').select('*').eq('id', IDS.student).single()
    expect(Object.keys(star.data)).toEqual(Object.keys(SCHEMA.tables.profiles.columns))
  })
  it('refuses a column the table does not have with 42703 (positive: an existing one works)', async () => {
    const bad = await f.engine.from('profiles').select('id, email')
    expect(bad.error.code).toBe('42703')
    expect(bad.data).toBeNull()
    expect(isMissingColumn(bad.error)).toBe(true)
    const good = await f.engine.from('profiles').select('id, full_name')
    expect(good.error).toBeNull()
    expect(good.data.length).toBeGreaterThan(0)
  })
  it("refuses select('*') on member_applications (parent_token is not readable) but serves a column list", async () => {
    const star = await f.engine.from('member_applications').select('*')
    expect(star.error.code).toBe('42501')
    const listed = await f.engine.from('member_applications').select('id, member_id')
    expect(listed.error).toBeNull()
    expect(listed.data.length).toBe(1) // the student reads only their own row
  })
  it('counts with head: true and returns no rows', async () => {
    const r = await f.engine.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active')
    expect(r.data).toBeNull()
    expect(r.count).toBe(f.db().profiles.filter((p) => p.status === 'active').length)
    expect(r.count).toBeGreaterThan(0)
  })
})

describe('filters', () => {
  const ids = (r) => r.data.map((x) => x.id).sort()
  it('eq / neq partition the rows', async () => {
    const all = await f.engine.from('tasks').select('id')
    const open = await f.engine.from('tasks').select('id').eq('status', 'open')
    const notOpen = await f.engine.from('tasks').select('id').neq('status', 'open')
    expect(open.data.length).toBeGreaterThan(0)
    expect(notOpen.data.length).toBeGreaterThan(0)
    expect([...ids(open), ...ids(notOpen)].sort()).toEqual(ids(all))
  })
  it('gt / gte / lt / lte compare timestamps as instants, not strings', async () => {
    const cut = new Date('2026-09-30T00:00:00-07:00').toISOString()
    const after = await f.engine.from('attendance_events').select('id').gte('event_time', cut)
    const before = await f.engine.from('attendance_events').select('id').lt('event_time', cut)
    expect(after.data.length).toBeGreaterThan(0)
    expect(before.data.length).toBeGreaterThan(0)
    expect(after.data.length + before.data.length).toBe(f.db().attendance_events.length)
    // An offset form of the same instant selects the same rows.
    const offset = await f.engine.from('attendance_events').select('id').gte('event_time', '2026-09-30T00:00:00-07:00')
    expect(offset.data.length).toBe(after.data.length)
  })
  it('in / is / not / like / ilike', async () => {
    const roles = await f.engine.from('member_roles').select('member_id').in('role', ['mentor', 'admin'])
    expect(roles.data.map((r) => r.member_id).sort()).toEqual([IDS.admin, IDS.mentor].sort())
    const noRoles = await f.engine.from('member_roles').select('member_id').in('role', ['nobody'])
    expect(noRoles.data).toEqual([])
    const dueNull = await f.engine.from('tasks').select('id').is('due_date', null)
    const dueSet = await f.engine.from('tasks').select('id').not('due_date', 'is', null)
    expect(dueNull.data.length).toBeGreaterThan(0)
    expect(dueNull.data.length + dueSet.data.length).toBe(f.db().tasks.length)
    const like = await f.engine.from('profiles').select('full_name').like('full_name', '%Student')
    expect(like.data.map((p) => p.full_name).sort()).toEqual(['Riley Student', 'Sam Student'])
    const ilike = await f.engine.from('profiles').select('full_name').ilike('full_name', '%student')
    expect(ilike.data.length).toBe(2)
    const likeCase = await f.engine.from('profiles').select('full_name').like('full_name', '%student')
    expect(likeCase.data.length).toBe(0)
  })
  it('or() and match() and contains()', async () => {
    const either = await f.engine.from('profiles').select('id').or(`id.eq.${IDS.student},id.eq.${IDS.admin}`)
    expect(ids(either)).toEqual([IDS.admin, IDS.student].sort())
    const matched = await f.engine.from('member_roles').select('role').match({ member_id: IDS.admin, role: 'admin' })
    expect(matched.data).toEqual([{ role: 'admin' }])
    const mech = await f.engine.from('profiles').select('id').contains('subteams', ['Mechanical'])
    expect(mech.data.map((p) => p.id)).toContain(IDS.student)
    expect(mech.data.map((p) => p.id)).not.toContain(IDS.student2)
  })
  it('filters by an embedded column through !inner, dropping parents with no match', async () => {
    f.ctx.persona = 'admin'
    const r = await f.engine.from('survey_answers')
      .select('id, response:survey_responses!inner(member_id, survey_id)')
      .eq('response.survey_id', CORE_IDS.surveyOpen)
    expect(r.error).toBeNull()
    expect(r.data.length).toBeGreaterThan(0)
    expect(r.data.every((a) => a.response.survey_id === CORE_IDS.surveyOpen)).toBe(true)
    expect(r.data.length).toBeLessThan(f.db().survey_answers.length)
  })
})

describe('order, limit, range, single', () => {
  it('orders ascending, descending and with nulls first', async () => {
    const asc = await f.engine.from('events').select('starts_at').order('starts_at')
    const desc = await f.engine.from('events').select('starts_at').order('starts_at', { ascending: false })
    expect(asc.data.map((e) => e.starts_at)).toEqual(desc.data.map((e) => e.starts_at).reverse())
    expect(Date.parse(asc.data[0].starts_at)).toBeLessThan(Date.parse(asc.data.at(-1).starts_at))
    const nullsFirst = await f.engine.from('tasks').select('due_date').order('due_date', { ascending: true, nullsFirst: true })
    expect(nullsFirst.data[0].due_date).toBeNull()
    const nullsLast = await f.engine.from('tasks').select('due_date').order('due_date', { ascending: true })
    expect(nullsLast.data.at(-1).due_date).toBeNull()
    expect(nullsLast.data[0].due_date).not.toBeNull()
  })
  it('limit and range cut after ordering', async () => {
    const all = await f.engine.from('skills').select('name').order('sort_order')
    const lim = await f.engine.from('skills').select('name').order('sort_order').limit(3)
    const rng = await f.engine.from('skills').select('name').order('sort_order').range(2, 4)
    expect(lim.data).toEqual(all.data.slice(0, 3))
    expect(rng.data).toEqual(all.data.slice(2, 5))
  })
  it('single answers PGRST116 for zero or many rows, and an object for one', async () => {
    const one = await f.engine.from('profiles').select('id').eq('id', IDS.student).single()
    expect(one.error).toBeNull()
    expect(one.data).toEqual({ id: IDS.student })
    const none = await f.engine.from('profiles').select('id').eq('id', uuid()).single()
    expect(none.error.code).toBe('PGRST116')
    const many = await f.engine.from('profiles').select('id').single()
    expect(many.error.code).toBe('PGRST116')
  })
  it('maybeSingle answers null for zero rows and PGRST116 for many', async () => {
    const none = await f.engine.from('profiles').select('id').eq('id', uuid()).maybeSingle()
    expect(none).toMatchObject({ data: null, error: null })
    const one = await f.engine.from('profiles').select('id').eq('id', IDS.student).maybeSingle()
    expect(one.data).toEqual({ id: IDS.student })
    const many = await f.engine.from('profiles').select('id').maybeSingle()
    expect(many.error.code).toBe('PGRST116')
  })
})

describe('writes', () => {
  it('insert applies schema defaults and returns the row only when .select() asks', async () => {
    const quiet = await f.engine.from('attendance_events').insert({ user_id: IDS.student, type: 'out', location: 'button', method: null })
    expect(quiet).toMatchObject({ data: null, error: null, status: 201 })
    const loud = await f.engine.from('attendance_events').insert({ user_id: IDS.student, type: 'in', location: 'shop-main', method: 'nfc' }).select().single()
    expect(loud.error).toBeNull()
    expect(loud.data.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(loud.data.category).toBe('build')
    expect(loud.data.event_time).toBe(NOW.toISOString())
    expect(loud.data.manual_entry).toBe(false)
  })
  it('refuses a value outside an enum CHECK with 23514 (positive: an allowed one lands)', async () => {
    const bad = await f.engine.from('attendance_events').insert({ user_id: IDS.student, type: 'out', method: 'button' })
    expect(bad.error.code).toBe('23514')
    const good = await f.engine.from('attendance_events').insert({ user_id: IDS.student, type: 'out', method: 'nfc' })
    expect(good.error).toBeNull()
  })
  it('refuses a NOT NULL hole with 23502 and an unknown payload column with PGRST204', async () => {
    const noType = await f.engine.from('attendance_events').insert({ user_id: IDS.student })
    expect(noType.error.code).toBe('23502')
    const extra = await f.engine.from('attendance_events').insert({ user_id: IDS.student, type: 'in', mood: 'great' })
    expect(extra.error.code).toBe('PGRST204')
    expect(isMissingColumn(extra.error)).toBe(true)
    const before = f.db().attendance_events.length
    expect((await f.engine.from('attendance_events').insert({ user_id: IDS.student, type: 'in' })).error).toBeNull()
    expect(f.db().attendance_events.length).toBe(before + 1)
  })
  it('enforces unique keys (23505), including a partial one, and foreign keys (23503)', async () => {
    // survey_responses_once: one response per member per survey.
    const dup = await f.engine.from('survey_responses').insert({ survey_id: CORE_IDS.surveyOpen, member_id: IDS.student2 })
    expect(dup.error.code).toBe('23505')
    const fresh = await f.engine.from('survey_responses').insert({ survey_id: CORE_IDS.surveyOpen, member_id: IDS.student })
    expect(fresh.error).toBeNull()
    // surveys_one_open_idx: unique ((true)) where is_open.
    f.ctx.persona = 'admin'
    const secondOpen = await f.engine.from('surveys').insert({ title: 'Another', is_open: true })
    expect(secondOpen.error.code).toBe('23505')
    const closed = await f.engine.from('surveys').insert({ title: 'Another', is_open: false })
    expect(closed.error).toBeNull()
    const orphan = await f.engine.from('event_signups').insert({ event_id: uuid(), member_id: IDS.student, response: 'going' })
    expect(orphan.error.code).toBe('23503')
  })
  it('upsert merges on the conflict target, or skips with ignoreDuplicates', async () => {
    const key = { event_id: CORE_IDS.meetingTomorrow, member_id: IDS.student }
    const first = await f.engine.from('event_signups').upsert({ ...key, response: 'maybe' }, { onConflict: 'event_id,member_id' })
    expect(first.error).toBeNull()
    await f.engine.from('event_signups').upsert({ ...key, response: 'going' }, { onConflict: 'event_id,member_id' })
    const rows = f.db().event_signups.filter((s) => s.event_id === key.event_id && s.member_id === key.member_id)
    expect(rows.map((r) => r.response)).toEqual(['going'])
    await f.engine.from('event_signups').upsert({ ...key, response: 'declined' }, { onConflict: 'event_id,member_id', ignoreDuplicates: true })
    expect(f.db().event_signups.find((s) => s.event_id === key.event_id && s.member_id === key.member_id).response).toBe('going')
    const noKey = await f.engine.from('event_signups').upsert({ ...key, response: 'going' }, { onConflict: 'response' })
    expect(noKey.error.code).toBe('42P10')
  })
  it('update and delete find their rows through the read filter, as Postgres does', async () => {
    // A student cannot SELECT feedback (admin-only policy), so cannot update it.
    const studentUpd = await f.engine.from('feedback').update({ status: 'dismissed' }).eq('category', 'bug').select()
    expect(studentUpd.error).toBeNull()
    expect(studentUpd.data).toEqual([])
    f.ctx.persona = 'admin'
    const adminUpd = await f.engine.from('feedback').update({ status: 'dismissed' }).eq('category', 'bug').select('id, status')
    expect(adminUpd.data.length).toBeGreaterThan(0)
    expect(adminUpd.data.every((r) => r.status === 'dismissed')).toBe(true)
  })
  it('a write with .select() that would return a row the caller cannot read raises 42501 and writes nothing', async () => {
    // feedback is admin-read only. Postgres 16, measured: the plain insert
    // succeeds, the same insert with RETURNING raises and is undone.
    const before = f.db().feedback.length
    const hidden = await f.engine.from('feedback').insert({ member_id: IDS.student, category: 'bug', message: 'm' }).select('id')
    expect(hidden.error.code).toBe('42501')
    expect(f.db().feedback.length).toBe(before)
    const plain = await f.engine.from('feedback').insert({ member_id: IDS.student, category: 'bug', message: 'm' })
    expect(plain.error).toBeNull()
    expect(f.db().feedback.length).toBe(before + 1)
    // Update: the team-default goal is readable, but re-pointed at another
    // member it no longer is.
    const repoint = () => f.engine.from('hour_goals').update({ member_id: IDS.parent }).is('member_id', null)
    expect((await repoint().select('id')).error.code).toBe('42501')
    expect(f.db().hour_goals.some((g) => g.member_id === IDS.parent)).toBe(false)
    expect((await repoint()).error).toBeNull()
    expect(f.db().hour_goals.some((g) => g.member_id === IDS.parent)).toBe(true)
    // Positive control: a caller who CAN read the new row gets it back.
    f.ctx.persona = 'admin'
    const back = await f.engine.from('feedback').insert({ member_id: IDS.admin, category: 'idea', message: 'm' }).select('id').single()
    expect(back.error).toBeNull()
    expect(back.data.id).toMatch(/^[0-9a-f-]{36}$/)
  })
  it('delete cascades along ON DELETE CASCADE foreign keys', async () => {
    f.ctx.persona = 'admin'
    const qs = () => f.db().survey_questions.filter((q) => q.survey_id === CORE_IDS.surveyPast).length
    const keep = () => f.db().survey_questions.filter((q) => q.survey_id === CORE_IDS.surveyOpen).length
    expect(qs()).toBeGreaterThan(0)
    const keepBefore = keep()
    const del = await f.engine.from('surveys').delete().eq('id', CORE_IDS.surveyPast)
    expect(del.error).toBeNull()
    expect(qs()).toBe(0)
    expect(keep()).toBe(keepBefore)
  })
})

describe('embeds', () => {
  it('resolves an FK-hinted embed, a column-aliased embed and a one-to-many embed', async () => {
    const hinted = await f.engine.from('attendance_events')
      .select('id, profiles!attendance_events_user_fkey(full_name)').eq('user_id', IDS.student).limit(1).single()
    expect(hinted.data.profiles).toEqual({ full_name: 'Sam Student' })
    const aliased = await f.engine.from('task_updates').select('id, author:member_id(full_name)').limit(1).single()
    expect(typeof aliased.data.author.full_name).toBe('string')
    const many = await f.engine.from('surveys').select('id, survey_questions(prompt)').eq('id', CORE_IDS.surveyOpen).single()
    expect(Array.isArray(many.data.survey_questions)).toBe(true)
    expect(many.data.survey_questions.length).toBe(5)
  })
  it('refuses an ambiguous embed with PGRST201 (two FKs to profiles) and an unrelated one with PGRST200', async () => {
    const amb = await f.engine.from('attendance_events').select('id, profiles(full_name)')
    expect(amb.error.code).toBe('PGRST201')
    const none = await f.engine.from('seasons').select('id, skills(name)')
    expect(none.error.code).toBe('PGRST200')
  })
  it('resolves a feature relation from the registry', async () => {
    f.ctx.persona = 'admin'
    const r = await f.engine.from('fx_widgets').select('id, owner_profile(full_name)').eq('id', 'w1').single()
    expect(r.data.owner_profile).toEqual({ full_name: 'Sam Student' })
  })
})

describe('migrations not applied', () => {
  it('answers a missing table, RPC, column and relation with the PostgREST codes, and serves them once applied', async () => {
    const off = setup({ migrations: 'none' })
    const on = setup({ migrations: ['0099'] })
    for (const [fx, applied] of [[off, false], [on, true]]) {
      fx.ctx.persona = 'admin'
      const table = await fx.engine.from('fx_widgets').select('id')
      const rpc = await fx.engine.rpc('fx_widget_count')
      const colSel = await fx.engine.from('feedback').select('id, tried')
      const colIns = await fx.engine.from('feedback').insert({ member_id: IDS.admin, category: 'idea', message: 'x', tried: 'y' })
      const star = await fx.engine.from('feedback').select('*').limit(1).single()
      const rel = await fx.engine.from('fx_widgets').select('id, owner_profile(full_name)')
      if (applied) {
        expect(table.data.length).toBe(2)
        expect(rpc.data).toBe(2)
        expect(colSel.error).toBeNull()
        expect(colIns.error).toBeNull()
        expect('tried' in star.data).toBe(true)
        expect(rel.error).toBeNull()
      } else {
        expect(table.error.code).toBe('PGRST205')
        expect(isMissingTable(table.error)).toBe(true)
        expect(rpc.error.code).toBe('PGRST202')
        expect(isMissingFunction(rpc.error)).toBe(true)
        expect(colSel.error.code).toBe('42703')
        expect(colIns.error.code).toBe('PGRST204')
        expect('tried' in star.data).toBe(false)
        expect(isSchemaMissing(rel.error)).toBe(true)
      }
    }
  })
  it('reads the migration switch: all, none, or a list', () => {
    expect(migrationApplied('0001', 'all')).toBe(true)
    expect(migrationApplied('0001', 'none')).toBe(false)
    expect(migrationApplied('1', ['0001'])).toBe(true)
    expect(migrationApplied('0002', ['0001'])).toBe(false)
    expect(migrationApplied(null, 'none')).toBe(true)
  })
  it('answers an unknown table that no fixture declares with PGRST205', async () => {
    const r = await f.engine.from('no_such_table').select('*')
    expect(r.error.code).toBe('PGRST205')
    const ok = await f.engine.from('seasons').select('id')
    expect(ok.data.length).toBe(3)
  })
})

describe('alters: a migration that relaxes a column that already exists', () => {
  // The frozen feedback.sql makes feedback.category NOT NULL and CHECKs status
  // to three values. This plugin relaxes both behind a migration no real lane
  // uses, the shape of a migration that drops a NOT NULL or widens a CHECK.
  const relax = {
    name: 'test-relax',
    migration: '0098',
    alters: { feedback: { category: { nullable: true }, status: { values: ['open', 'reviewed', 'dismissed', 'done'] } } },
    seed: ({ ids }) => ({ feedback: [{ member_id: ids.student, category: null, message: 'untyped', status: 'done' }] }),
  }
  const untyped = { member_id: IDS.student, category: null, message: 'untyped report' }

  it('refuses the relaxed shapes while the migration is not applied, as the live table does', async () => {
    const g = setup({ migrations: 'none', plugins: [core, relax] })
    expect((await g.engine.from('feedback').insert(untyped)).error.code).toBe('23502')
    expect((await g.engine.from('feedback').insert({ ...untyped, category: 'bug', status: 'done' })).error.code).toBe('23514')
    // Positive control: the old shape, which a client falls back to, lands.
    expect((await g.engine.from('feedback').insert({ ...untyped, category: 'bug' })).error).toBeNull()
  })
  it('accepts them once the migration is applied, and still refuses a value outside the new list', async () => {
    const g = setup({ migrations: ['0098'], plugins: [core, relax] })
    expect((await g.engine.from('feedback').insert(untyped)).error).toBeNull()
    expect((await g.engine.from('feedback').insert({ ...untyped, status: 'done' })).error).toBeNull()
    expect((await g.engine.from('feedback').insert({ ...untyped, status: 'spam' })).error.code).toBe('23514')
    // A row stored under the new list can still take an unrelated update.
    g.ctx.persona = 'admin'
    const upd = await g.engine.from('feedback').update({ message: 'edited' }).eq('status', 'done').select('id')
    expect(upd.error).toBeNull()
    expect(upd.data.length).toBeGreaterThan(0)
  })
  it('judges seed rows with every migration applied, and never edits the shared schema', () => {
    const g = setup({ migrations: 'none', plugins: [core, relax] })
    expect(g.problems).toEqual([])
    expect(SCHEMA.tables.feedback.columns.category.notnull).toBe(true)
    expect(SCHEMA.tables.feedback.enums.status.values).not.toContain('done')
    // Control: the same seed row without the alteration IS a problem.
    const h = setup({ plugins: [core, { ...relax, alters: undefined }] })
    expect(h.problems.some((p) => /23502/.test(p.problem))).toBe(true)
  })
})

describe('rpc', () => {
  it('refuses arguments the deployed signature does not have (PGRST202), and runs it with the right ones', async () => {
    const bad = await f.engine.rpc('request_cert', { p_skill: f.db().skills[0].id, p_extra: true })
    expect(bad.error.code).toBe('PGRST202')
    const good = await f.engine.rpc('request_cert', { p_skill: f.db().skills[4].id, p_note: 'please' })
    expect(good.error).toBeNull()
    expect(f.db().cert_requests.some((r) => r.id === good.data && r.member_id === IDS.student)).toBe(true)
  })
  it('claim_profile answers false for the unapproved persona and true for a member', async () => {
    expect((await f.engine.rpc('claim_profile')).data).toBe(true)
    f.ctx.persona = 'pending'
    expect((await f.engine.rpc('claim_profile')).data).toBe(false)
  })
  it('a staff-only RPC refuses a student with the SQL message and serves staff', async () => {
    const student = await f.engine.rpc('readiness_summary')
    expect(student.error.message).toBe('Permission denied: staff role required')
    f.ctx.persona = 'mentor'
    const mentor = await f.engine.rpc('readiness_summary')
    expect(mentor.error).toBeNull()
    expect(mentor.data.live_presence.length).toBeGreaterThan(0)
  })
  it('a migration that re-creates a core function with no handler of its own still answers through core', async () => {
    // A new signature (p_new_arg) listed in creates.rpcs, no handler supplied.
    const resig = { name: 'test-resig', migration: '0097', creates: { rpcs: ['readiness_summary', 'fx_new_fn'] } }
    const on = setup({ persona: 'mentor', migrations: ['0097'], plugins: [core, resig] })
    const r = await on.engine.rpc('readiness_summary', { p_new_arg: 1 })
    expect(r.error).toBeNull()
    expect(r.data.live_presence.length).toBeGreaterThan(0)
    // A brand-new function with no handler exists (answers null), it is not missing.
    expect(await on.engine.rpc('fx_new_fn')).toMatchObject({ data: null, error: null })
    // Control: not applied, the deployed signature refuses the new argument,
    // and the new function is missing.
    const off = setup({ persona: 'mentor', migrations: 'none', plugins: [core, resig] })
    expect((await off.engine.rpc('readiness_summary', { p_new_arg: 1 })).error.code).toBe('PGRST202')
    expect((await off.engine.rpc('fx_new_fn')).error.code).toBe('PGRST202')
    expect((await off.engine.rpc('readiness_summary')).data.live_presence.length).toBeGreaterThan(0)
  })
  it('a call that fails part-way leaves nothing behind, as a raising plpgsql function does', async () => {
    // staff_add_manual_session writes the IN, then the unparseable OUT fails.
    f.ctx.persona = 'mentor'
    const mine = () => f.db().attendance_events.filter((e) => e.user_id === IDS.student).length
    const before = mine()
    const args = { p_member: IDS.student, p_in: '2026-09-30T15:00:00Z', p_category: 'build', p_reason: 'forgot to tap' }
    const bad = await f.engine.rpc('staff_add_manual_session', { ...args, p_out: 'not-a-time' })
    expect(bad.error.code).toBe('22007')
    expect(mine()).toBe(before)
    // Positive control: the same call with a real check-out writes the pair.
    const good = await f.engine.rpc('staff_add_manual_session', { ...args, p_out: '2026-09-30T17:00:00Z' })
    expect(good.error).toBeNull()
    expect(mine()).toBe(before + 2)
  })
  it('signed-out callers read nothing (every policy is to authenticated)', async () => {
    f.ctx.persona = 'signedout'
    expect((await f.engine.from('events').select('id')).data).toEqual([])
    f.ctx.persona = 'student'
    expect((await f.engine.from('events').select('id')).data.length).toBeGreaterThan(0)
  })
})

describe('grammar', () => {
  it('parses aliases, hints, inner joins and nested selects', () => {
    const nodes = parseSelect('id, author:profiles!fk_x!inner(id, full_name), skills(name)')
    expect(nodes[1]).toMatchObject({ type: 'embed', name: 'profiles', alias: 'author', hint: 'fk_x', inner: true })
    expect(nodes[1].nodes.map((n) => n.name)).toEqual(['id', 'full_name'])
    expect(nodes[2]).toMatchObject({ type: 'embed', name: 'skills', inner: false })
  })
  it('parses logic trees', () => {
    const t = parseLogic('a.eq.1,and(b.is.null,c.in.(x,y))')
    expect(t[0]).toMatchObject({ kind: 'cond', column: 'a', op: 'eq', value: '1' })
    expect(t[1].kind).toBe('and')
    expect(t[1].terms[1].value).toEqual(['x', 'y'])
  })
})

// A function persists the store only when it changed it. Every RPC used to
// persist the whole store, so a tab holding an older copy that merely READ
// (claim_profile on boot) wrote that copy back over another tab's newer write.
describe('rpc persistence', () => {
  const writer = {
    name: 'test-writer',
    migration: null,
    rpcs: {
      fx_touch_nothing: () => ({ data: 1, error: null }),
      fx_add_event: ({ engine, user }) => ({ data: engine.insertRow('attendance_events', { user_id: user.id, type: 'in' }).id, error: null }),
      fx_add_then_fail: ({ engine, user, error }) => { engine.insertRow('attendance_events', { user_id: user.id, type: 'in' }); return error('P0001', 'no') },
    },
  }
  function counted() {
    const store = { db: {} }
    let writes = 0
    const engine = createEngine({
      schema: SCHEMA,
      plugins: [core, writer],
      store,
      now: () => NOW,
      onWrite: () => { writes += 1 },
      context: () => ({ user: { id: PERSONAS.student.id }, persona: resolvePersona('student', store.db), migrations: 'all' }),
    })
    engine.seedAll({ ids: IDS, now: NOW, uuid })
    return { engine, store, writes: () => writes }
  }
  // The three are not in the generated catalog, so they are claimed as new.
  writer.creates = { rpcs: Object.keys(writer.rpcs) }

  it('a read-only function persists nothing; claim_profile included', async () => {
    const c = counted()
    expect((await c.engine.rpc('claim_profile', {})).data).toBe(true)
    expect((await c.engine.rpc('fx_touch_nothing', {})).data).toBe(1)
    expect(c.writes()).toBe(0)
  })
  it('a function that writes persists once (positive control)', async () => {
    const c = counted()
    const before = c.store.db.attendance_events.length
    const { data, error } = await c.engine.rpc('fx_add_event', {})
    expect(error).toBe(null)
    expect(c.store.db.attendance_events.length).toBe(before + 1)
    expect(c.store.db.attendance_events.some((e) => e.id === data)).toBe(true)
    expect(c.writes()).toBe(1)
  })
  it('a function that writes then raises is rolled back and persists nothing', async () => {
    const c = counted()
    const before = c.store.db.attendance_events.length
    const { error } = await c.engine.rpc('fx_add_then_fail', {})
    expect(error?.code).toBe('P0001')
    expect(c.store.db.attendance_events.length).toBe(before)
    expect(c.writes()).toBe(0)
  })
})
