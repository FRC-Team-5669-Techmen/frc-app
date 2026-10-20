// Fixture: event rosters (supabase/migrations/0016_event_rosters.sql,
// src/RostersPage.jsx). Contract: src/dev/fixture/README.md. Plain data.
//
// A TEST-ONLY port of 0016's checks that proves the page, never the rules
// (those are proven by 0016_event_rosters_rls_test.sql). The carpool lock
// trigger is not modelled (fixture mode has no triggers).
//
// Seed: "Fixture Regional", a two-day competition 12 days out, not posted,
// with Sam as a scout. Riley's hours probation (features/standing.js) makes
// her ineligible for the drive team.

const H = 3_600_000
const D = 24 * H
const EV = '16000000-0000-4000-8000-000000000001'
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const iso = (t) => new Date(t).toISOString()
const rows = (db, t) => db[t] ?? []
const refuse = (message, code = 'P0001') => ({ data: null, error: { code, message, details: null, hint: null } })
const ok = (data) => ({ data, error: null })
const laDate = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const FIELD = ['driver', 'operator', 'human_player', 'drive_coach', 'pit_crew']
const SPEAK = ['impact_presenter', 'pit_speaker']

function blocker(db, member, eventId, role) {
  const ev = rows(db, 'events').find((e) => e.id === eventId)
  if (!ev) return 'Event not found'
  if (rows(db, 'discipline_records').some((d) => d.member_id === member && d.level === 'suspension'
    && laDate(ev.starts_at) <= d.ends_on && laDate(ev.ends_at) >= d.starts_on)) return 'Suspended: does not attend'
  const open = rows(db, 'standing_records').filter((r) => r.member_id === member && ['open', 'proposed'].includes(r.status))
  if ((FIELD.includes(role) || SPEAK.includes(role)) && open.some((r) => r.kind === 'meetings' || r.kind === 'hours')) return 'On meetings or hours probation'
  if (FIELD.includes(role) && open.some((r) => r.kind === 'grades')) return 'On grades probation'
  return null
}

export default {
  migration: '0016',
  creates: {
    tables: ['event_roles', 'event_rosters', 'event_attendance', 'member_conflicts', 'event_signup_reminders'],
    rpcs: ['event_role_blocker', 'staff_assign_role', 'staff_unassign_role', 'staff_post_roster', 'staff_mark_event_day',
      'declare_conflict', 'withdraw_conflict', 'conflict_deadline', 'event_eligibility_check', 'staff_remind_signups', 'event_signup_check'],
    columns: { standing_settings: ['kickoff_event_id'], hub_events: ['event_id', 'mandatory'] },
  },

  seed: ({ ids, now }) => {
    const t = ms(now)
    return {
      events: [{ id: EV, title: 'Fixture Regional', kind: 'competition', starts_at: iso(t + 12 * D), ends_at: iso(t + 13 * D + 8 * H), location: 'Fixture Arena', mandatory: true }],
      event_roles: [{ event_id: EV, member_id: ids.student, role: 'scout', reason: 'Steady scouting all season', assigned_by: ids.mentor }],
    }
  },

  visible: {
    event_roles: ({ row, persona, db }) => !!persona?.isStaff || rows(db, 'event_rosters').some((r) => r.event_id === row.event_id),
    event_attendance: ({ row, user, persona }) => row.member_id === user?.id || !!persona?.isStaff,
    member_conflicts: ({ row, user, persona }) => row.member_id === user?.id || !!persona?.isStaff,
    event_signup_reminders: ({ persona }) => !!persona?.isStaff,
  },

  rpcs: {
    event_role_blocker: ({ args, db }) => ok(blocker(db, args.p_member, args.p_event, args.p_role)),
    staff_assign_role: ({ args, db, user, persona, engine }) => {
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      if (!args.p_reason || String(args.p_reason).trim().length < 3) return refuse('Record why', '22023')
      const b = blocker(db, args.p_member, args.p_event, args.p_role)
      if (b) return refuse(`Not eligible: ${b}`, '22023')
      engine.deleteRows('event_roles', (r) => r.event_id === args.p_event && r.member_id === args.p_member && r.role === args.p_role)
      return ok(engine.insertRow('event_roles', { event_id: args.p_event, member_id: args.p_member, role: args.p_role, reason: args.p_reason, assigned_by: user.id }))
    },
    staff_unassign_role: ({ args, persona, engine }) => (persona?.isStaff ? ok(engine.deleteRows('event_roles', (r) => r.id === args.p_role).length) : refuse('Staff only', '42501')),
    staff_post_roster: ({ args, db, user, persona, engine, now }) => {
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      if (!ev) return refuse('Event not found', 'P0002')
      engine.deleteRows('event_rosters', (r) => r.event_id === ev.id)
      engine.insertRow('event_rosters', { event_id: ev.id, posted_by: user.id, note: args.p_note })
      for (const m of new Set(rows(db, 'event_roles').filter((r) => r.event_id === ev.id).map((r) => r.member_id))) {
        engine.insertRow('member_notices', { member_id: m, kind: 'roster', title: `Your role at ${ev.title}`, body: '', created_by: user.id })
      }
      return ok(Math.max(0, Math.floor((Date.parse(ev.starts_at) - ms(now)) / D)))
    },
    staff_mark_event_day: ({ args, db, user, persona, engine }) => {
      if (!persona?.isStaff) return refuse('Staff only', '42501')
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      if (!ev) return refuse('Event not found', 'P0002')
      if (args.p_day < laDate(ev.starts_at) || args.p_day > laDate(ev.ends_at)) return refuse('That day is not part of the event', '22023')
      engine.deleteRows('event_attendance', (a) => a.event_id === ev.id && a.day === args.p_day && a.member_id === args.p_member)
      const row = engine.insertRow('event_attendance', { event_id: ev.id, day: args.p_day, member_id: args.p_member, status: args.p_status, note: args.p_note, marked_by: user.id })
      if (args.p_status === 'absent' && !rows(db, 'absence_requests').some((a) => a.member_id === args.p_member && a.event_id === ev.id && a.status === 'approved')
        && !rows(db, 'standing_records').some((r) => r.member_id === args.p_member && r.kind === 'meetings' && r.status === 'open')) {
        engine.insertRow('standing_records', { member_id: args.p_member, kind: 'meetings', reason: `Missed ${ev.title} without an emergency.`, opened_on: args.p_day, status: 'open', clean_weeks: 0 })
      }
      return ok(row)
    },
    declare_conflict: ({ args, db, user, engine, now }) => {
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      if (!ev || Date.parse(ev.starts_at) <= ms(now)) return refuse('Only an upcoming event', '22023')
      const live = rows(db, 'member_conflicts').find((c) => c.member_id === user.id && c.event_id === ev.id && !c.withdrawn_at)
      if (live) return ok(engine.updateRows('member_conflicts', (c) => c.id === live.id, { note: args.p_note })[0])
      return ok(engine.insertRow('member_conflicts', { member_id: user.id, event_id: ev.id, note: args.p_note }))
    },
    withdraw_conflict: ({ args, user, engine, now }) => ok(engine.updateRows('member_conflicts', (c) => c.id === args.p_conflict && c.member_id === user.id && !c.withdrawn_at, { withdrawn_at: iso(ms(now)) }).length),
    conflict_deadline: () => ok(null),
    event_eligibility_check: () => ok(0),
    staff_remind_signups: ({ persona }) => (persona?.isStaff ? ok(0) : refuse('Staff only', '42501')),
    event_signup_check: () => ok(0),
  },
}
