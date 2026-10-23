// Fixture: ledger 0026, Meet a team (supabase/migrations/0035_meet_a_team.sql).
// A test-only PORT so /meet and Home's Do this now can be driven in a browser;
// the rules are the SQL, proven by 0035_meet_a_team_rls_test.sql and
// tools/sql-harness/mutants-0035.mjs. Contract: src/dev/fixture/README.md.
//
// Seed: "Fixture Blitz", a competition that started two hours ago, with two
// Meet a team slots later today (3 boxes each; the second also needs scouts).
// Sam is assigned Meet a team in the first. Riley already logged team 254
// with a contact, so the shared list and the parent's hidden contact have
// something to show.
import { planMeetTeam, ORG_TAGS, RESOURCE_TAGS } from '../../../meetTeam'

const EV = '35000000-0000-4000-8000-000000000001'
const SLOT = (n) => `35100000-0000-4000-8000-${String(n).padStart(12, '0')}`
const CONN = '35200000-0000-4000-8000-000000000001'
const rows = (db, t) => (Array.isArray(db[t]) ? db[t] : (db[t] = []))
const iso = (t) => new Date(t).toISOString()
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const refuse = (message, code) => ({ data: null, error: { code, message, details: null, hint: null } })
const ok = (data) => ({ data, error: null })
const laDay = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const nameOf = (db, id) => { const p = rows(db, 'profiles').find((x) => x.id === id); return (p?.nickname || '').trim() || (p?.full_name || '').trim() || 'Member' }
const rolesOf = (db, id) => rows(db, 'member_roles').filter((r) => r.member_id === id).map((r) => r.role)
const profileOk = (db, id, active) => rows(db, 'profiles').some((p) => p.id === id && p.approved && (!active || (p.status ?? 'active') === 'active'))
// _role_board_member_ok (0028): approved active student or staff, never a parent-only account.
const writer = ({ user, persona, db }) => !!user?.id && !persona?.isParent && profileOk(db, user.id, true)
  && (persona?.isStaff || rolesOf(db, user.id).includes('student'))
// _meet_team_reader (0035): any approved account with a team role, parents included.
const reader = ({ user, db }) => !!user?.id && profileOk(db, user.id, false)
  && rolesOf(db, user.id).some((r) => ['student', 'mentor', 'lead', 'admin', 'parent'].includes(r))
const mtSlots = (db, ev) => rows(db, 'role_slots').filter((s) => s.event_id === ev && Number(s.needs?.meet_team) > 0)
const students = (db) => rows(db, 'profiles').filter((p) => p.approved && (p.status ?? 'active') === 'active' && rolesOf(db, p.id).includes('student'))
  .map((p) => ({ member_id: p.id, name: nameOf(db, p.id) }))
const assignedMeet = (db, ev, member) => rows(db, 'role_requests').some((r) => r.member_id === member && r.role === 'meet_team' && (r.status ?? 'asked') === 'assigned' && mtSlots(db, ev).some((s) => s.id === r.slot_id))
const blank = (s) => !String(s ?? '').trim()
const trimOrNull = (s) => (blank(s) ? null : String(s).trim())
const slotJson = (s, extra = {}) => ({ slot_id: s.id, label: s.label, day: s.day, starts_at: s.starts_at, ends_at: s.ends_at, ...extra })

function eventJson(ctx, ev) {
  const { db, user, persona } = ctx
  const contacts = writer(ctx)
  const teams = rows(db, 'scouting_records').filter((r) => r.event_id === ev.id && r.kind === 'team' && r.team_number)
  const byTeam = new Map(teams.map((r) => [r.team_number, r.payload?.name ?? null]))
  return {
    event: { id: ev.id, title: ev.title, starts_at: ev.starts_at, ends_at: ev.ends_at, kind: ev.kind },
    me: user.id, can_manage: !!persona?.isStaff, can_write: writer(ctx), contacts_visible: contacts,
    teams: [...byTeam].sort((a, b) => a[0] - b[0]).map(([team_number, name]) => ({ team_number, name })),
    has_slots: rows(db, 'role_slots').some((s) => s.event_id === ev.id && s.needs && 'meet_team' in s.needs),
    my_slots: rows(db, 'role_requests').filter((r) => r.member_id === user.id && r.role === 'meet_team')
      .map((r) => [r, rows(db, 'role_slots').find((s) => s.id === r.slot_id && s.event_id === ev.id)]).filter(([, s]) => s)
      .sort((a, b) => String(a[1].starts_at).localeCompare(String(b[1].starts_at))).map(([r, s]) => slotJson(s, { status: r.status ?? 'asked' })),
    connections: rows(db, 'team_connections').filter((c) => c.event_id === ev.id)
      .sort((a, b) => a.team_number - b.team_number || String(a.created_at).localeCompare(String(b.created_at)))
      .map((c) => {
        const k = rows(db, 'team_connection_contacts').find((x) => x.connection_id === c.id)
        return { id: c.id, team_number: c.team_number, team_name: c.team_name, member_id: c.member_id, logged_by: nameOf(db, c.member_id), mine: c.member_id === user.id,
          does_well: c.does_well, org_tags: c.org_tags ?? [], org_note: c.org_note, resource_tags: c.resource_tags ?? [], resource_note: c.resource_note, copy_this: c.copy_this,
          follow_up: !!c.follow_up, follow_up_note: c.follow_up_note, created_at: c.created_at, updated_at: c.updated_at,
          contact: contacts && k ? { name: k.name, role: k.role, email: k.email, discord: k.discord, social: k.social } : null }
      }),
  }
}

export default {
  migration: '0035',
  creates: {
    tables: ['team_connections', 'team_connection_contacts'],
    rpcs: ['team_connection_save', 'team_connection_delete', 'meet_team_event', 'meet_team_progress', 'staff_meet_team_fill', 'meet_team_todo'],
  },
  seed: ({ ids, now }) => {
    const t = ms(now)
    const slot = (n, label, h, needs) => ({ id: SLOT(n), event_id: EV, day: laDay(t + h * 3600e3), label, starts_at: iso(t + h * 3600e3), ends_at: iso(t + (h + 1) * 3600e3), needs, position: n, created_by: ids.mentor, created_at: iso(t), updated_at: iso(t) })
    return {
      events: [{ id: EV, title: 'Fixture Blitz', kind: 'competition', starts_at: iso(t - 2 * 3600e3), ends_at: iso(t + 2 * 864e5), location: 'Fixture Valley HS', created_by: ids.mentor }],
      role_slots: [slot(1, 'Qualifications 1', 1, { meet_team: 3 }), slot(2, 'Qualifications 2', 2, { scout: 2, meet_team: 3 })],
      role_requests: [{ id: '35300000-0000-4000-8000-000000000001', slot_id: SLOT(1), member_id: ids.student, role: 'meet_team', status: 'assigned', status_by: ids.mentor, status_at: iso(t), created_at: iso(t) }],
      team_connections: [{ id: CONN, event_id: EV, member_id: ids.student2, team_number: 254, team_name: 'The Cheesy Poofs', does_well: 'Every part has a spare on the cart',
        org_tags: ['student_led', 'subteams'], org_note: 'A captain per subteam', resource_tags: ['shared_cad_code'], resource_note: 'Their CAD is public',
        copy_this: 'A labeled spares cart', follow_up: true, follow_up_note: 'Ask about their scouting app', updated_by: ids.student2, created_at: iso(t - 3600e3), updated_at: iso(t - 3600e3) }],
      team_connection_contacts: [{ connection_id: CONN, name: 'Jordan', role: 'mentor', email: 'jordan@example.org', discord: 'jordan254', social: null, updated_at: iso(t - 3600e3) }],
    }
  },
  visible: {
    team_connections: (ctx) => reader(ctx),
    team_connection_contacts: (ctx) => writer(ctx),
  },
  rpcs: {
    meet_team_event: (ctx) => {
      if (!reader(ctx)) return refuse('Meet a team is for team members.', '42501')
      const ev = rows(ctx.db, 'events').find((e) => e.id === ctx.args.p_event)
      if (!ev) return refuse('Event not found', 'P0002')
      return ok(eventJson(ctx, ev))
    },
    team_connection_save: (ctx) => {
      const { args: a, db, user, persona, engine, now } = ctx
      if (!writer(ctx)) return refuse('Meet a team notes are for approved students and staff.', '42501')
      const team = Number(a.p_team)
      if (!Number.isInteger(team) || team < 1 || team > 99999) return refuse('Pick the team number.', '22023')
      if (blank(a.p_does_well)) return refuse('Say what they do well.', '22023')
      if (blank(a.p_copy)) return refuse('Name one thing we should copy.', '22023')
      const org = a.p_org_tags ?? [], res = a.p_resource_tags ?? []
      if (org.some((x) => !ORG_TAGS.some(([k]) => k === x)) || res.some((x) => !RESOURCE_TAGS.some(([k]) => k === x))) return refuse('new row for relation "team_connections" violates check constraint', '23514')
      const c = a.p_contact ?? {}
      if (c.role && !['student', 'mentor', 'lead'].includes(c.role)) return refuse('Their role is student, mentor or lead.', '22023')
      const fields = { team_number: team, team_name: trimOrNull(a.p_team_name), does_well: String(a.p_does_well).trim(), org_tags: org, org_note: trimOrNull(a.p_org_note),
        resource_tags: res, resource_note: trimOrNull(a.p_resource_note), copy_this: String(a.p_copy).trim(), follow_up: !!a.p_follow_up, follow_up_note: trimOrNull(a.p_follow_up_note),
        updated_by: user.id, updated_at: iso(ms(now)) }
      let id = a.p_id
      if (!id) {
        if (!rows(db, 'events').some((e) => e.id === a.p_event)) return refuse('Event not found', 'P0002')
        id = engine.insertRow('team_connections', { event_id: a.p_event, member_id: user.id, ...fields, created_at: iso(ms(now)) }).id
      } else {
        const row = rows(db, 'team_connections').find((x) => x.id === id)
        if (!row || !(row.member_id === user.id || persona?.isStaff)) return refuse('You can change only your own notes.', '42501')
        engine.updateRows('team_connections', (x) => x.id === id, fields)
      }
      const k = { name: trimOrNull(c.name), role: trimOrNull(c.role), email: trimOrNull(c.email), discord: trimOrNull(c.discord), social: trimOrNull(c.social) }
      const has = rows(db, 'team_connection_contacts').some((x) => x.connection_id === id)
      if (Object.values(k).every((v) => v == null)) { if (has) engine.deleteRows('team_connection_contacts', (x) => x.connection_id === id) }
      else if (has) engine.updateRows('team_connection_contacts', (x) => x.connection_id === id, { ...k, updated_at: iso(ms(now)) })
      else engine.insertRow('team_connection_contacts', { connection_id: id, ...k, updated_at: iso(ms(now)) })
      return ok({ id, event_id: a.p_event, team_number: team })
    },
    team_connection_delete: (ctx) => {
      const { args, db, user, persona, engine } = ctx
      const row = rows(db, 'team_connections').find((x) => x.id === args.p_id)
      if (!row || !writer(ctx) || !(row.member_id === user.id || persona?.isStaff)) return refuse('You can delete only your own notes.', '42501')
      engine.deleteRows('team_connection_contacts', (x) => x.connection_id === row.id)
      engine.deleteRows('team_connections', (x) => x.id === row.id)
      return ok({ id: row.id, event_id: row.event_id, team_number: row.team_number })
    },
    meet_team_progress: ({ args, db, persona }) => {
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      if (!ev) return refuse('Event not found', 'P0002')
      const people = students(db).map((st) => {
        const mine = rows(db, 'team_connections').filter((c) => c.event_id === ev.id && c.member_id === st.member_id)
        const slots = rows(db, 'role_requests').filter((r) => r.member_id === st.member_id && r.role === 'meet_team' && (r.status ?? 'asked') === 'assigned')
          .map((r) => mtSlots(db, ev.id).find((s) => s.id === r.slot_id)).filter(Boolean).map((s) => slotJson(s))
        return { ...st, logged: mine.length, teams: [...new Set(mine.map((c) => c.team_number))], slots, state: mine.length ? 'done' : slots.length ? 'slotted' : 'no_slot' }
      }).sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name))
      const n = (s) => people.filter((x) => x.state === s).length
      return ok({ event: { id: ev.id, title: ev.title }, done: n('done'), slotted: n('slotted'), no_slot: n('no_slot'), people })
    },
    staff_meet_team_fill: ({ args, db, user, persona, engine, now }) => {
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      if (!ev) return refuse('Event not found', 'P0002')
      const t = ms(now)
      const slots = mtSlots(db, ev.id).filter((s) => (s.ends_at ? Date.parse(s.ends_at) : Date.parse(s.starts_at) + 3600e3) > t)
        .map((s) => ({ ...s, needed: Number(s.needs.meet_team), assigned: rows(db, 'role_requests').filter((r) => r.slot_id === s.id && r.role === 'meet_team' && (r.status ?? 'asked') === 'assigned').length }))
      const all = students(db)
      const todo = all.filter((m) => !assignedMeet(db, ev.id, m.member_id))
      const busy = rows(db, 'role_requests').filter((r) => (r.status ?? 'asked') === 'assigned' && r.role !== 'meet_team')
        .map((r) => [r, rows(db, 'role_slots').find((s) => s.id === r.slot_id && s.event_id === ev.id)]).filter(([, s]) => s)
        .map(([r, s]) => ({ member_id: r.member_id, starts_at: s.starts_at, ends_at: s.ends_at }))
      const plan = planMeetTeam({ slots, students: todo, busy })
      if (args.p_apply) {
        for (const p of plan.placed) {
          const have = rows(db, 'role_requests').find((r) => r.slot_id === p.slot_id && r.member_id === p.member_id && r.role === 'meet_team')
          if (have) engine.updateRows('role_requests', (x) => x.id === have.id, { status: 'assigned', status_by: user.id, status_at: iso(t) })
          else engine.insertRow('role_requests', { slot_id: p.slot_id, member_id: p.member_id, role: 'meet_team', status: 'assigned', status_by: user.id, status_at: iso(t), created_at: iso(t) })
        }
      }
      return ok({ event: { id: ev.id, title: ev.title }, applied: !!args.p_apply, slots: slots.length, boxes: slots.reduce((n, s) => n + s.needed, 0),
        already: all.length - todo.length, placed: plan.placed, unplaced: plan.unplaced })
    },
    meet_team_todo: (ctx) => {
      const { db, user, now } = ctx
      if (!writer(ctx)) return ok([])
      const t = ms(now)
      return ok(rows(db, 'events').filter((e) => {
        const dayStart = Date.parse(`${laDay(e.starts_at)}T00:00:00-07:00`)
        return t >= dayStart && t <= Date.parse(e.ends_at ?? e.starts_at) && rows(db, 'role_slots').some((s) => s.event_id === e.id && s.needs && 'meet_team' in s.needs)
          && !rows(db, 'team_connections').some((c) => c.event_id === e.id && c.member_id === user.id)
      }).map((e) => {
        const mine = rows(db, 'role_requests').filter((r) => r.member_id === user.id && r.role === 'meet_team' && ['assigned', 'backup'].includes(r.status ?? 'asked'))
          .map((r) => [r, rows(db, 'role_slots').find((s) => s.id === r.slot_id && s.event_id === e.id)]).filter(([, s]) => s)
          .sort((a, b) => (a[0].status === 'assigned' ? 0 : 1) - (b[0].status === 'assigned' ? 0 : 1) || String(a[1].starts_at).localeCompare(String(b[1].starts_at)))[0]
        return { event_id: e.id, title: e.title, slot: mine ? { label: mine[1].label, day: mine[1].day, starts_at: mine[1].starts_at, ends_at: mine[1].ends_at, status: mine[0].status } : null }
      }))
    },
  },
}
