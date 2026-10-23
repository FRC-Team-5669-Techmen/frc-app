// Fixture: member standing (supabase/migrations/0015_member_standing.sql,
// src/standing.js, src/StandingPage.jsx, src/StandingTeamPage.jsx).
// Contract: src/dev/fixture/README.md. Plain data, no imports, no side effects.
//
// The handlers are a TEST-ONLY port of the SQL that proves the PAGES, never
// the rules: the rules are proven on PostgreSQL by
// 0015_member_standing_rls_test.sql and tools/sql-harness/mutants-0015.mjs.
// standing_evaluate is NOT ported (it answers 0); the seed carries the records
// an evaluation would have made.
//
// Seed: Riley (student2) is on hours probation with two judged weeks, has a
// pending absence request for the meeting tomorrow, one safety violation and
// one notice; one FLL team with no mentors; the settings row.

const H = 3_600_000
const D = 24 * H
const ms = (now) => (now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.now())
const iso = (t) => new Date(t).toISOString()
const rows = (db, t) => db[t] ?? []
const refuse = (message, code = 'P0001') => ({ data: null, error: { code, message, details: null, hint: null } })
const ok = (data) => ({ data, error: null })
const isStaff = (p) => !!p?.isStaff
const isAdmin = (p) => !!p?.isAdmin
const laDate = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
const mondayOf = (t) => {
  const d = new Date(`${laDate(t)}T12:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  return new Date(d.getTime() - dow * D).toISOString().slice(0, 10)
}
const nameOf = (db, id) => {
  const p = rows(db, 'profiles').find((x) => x.id === id)
  return (p?.nickname || p?.full_name || 'Member').trim()
}
const seesMember = (db, user, persona, member) => user?.id === member || isStaff(persona)
  || rows(db, 'guardian_links').some((g) => g.parent_id === user?.id && g.student_id === member)
const notify = (engine, member, kind, title, body, by) =>
  engine.insertRow('member_notices', { member_id: member, kind, title, body: body ?? '', created_by: by ?? null })

const FLL_TEAM = '15000000-0000-4000-8000-000000000001'

function hoursBetween(db, member, from, to) {
  const ev = rows(db, 'attendance_events').filter((e) => e.user_id === member).sort((a, b) => a.event_time.localeCompare(b.event_time))
  let total = 0
  for (let i = 0; i < ev.length - 1; i++) {
    const a = ev[i], b = ev[i + 1]
    const t = Date.parse(a.event_time)
    if (a.type !== 'in' || b.type !== 'out' || t < from || t >= to || (a.category ?? 'build') === 'volunteer') continue
    if (rows(db, 'session_reviews').some((r) => r.checkout_id === b.id && ['pending', 'voided'].includes(r.status))) continue
    total += Math.min(Date.parse(b.event_time) - t, 12 * H)
  }
  return Math.round((total / H) * 100) / 100
}

function monthMeetings(db, member, now) {
  const t = ms(now)
  const monthStart = `${laDate(t).slice(0, 7)}-01`
  const list = rows(db, 'events').filter((e) => e.kind === 'meeting' && Date.parse(e.ends_at) < t && laDate(e.starts_at) >= monthStart)
  let counted = 0, attended = 0, lates = 0, misses = 0
  for (const e of list) {
    const scan = rows(db, 'meeting_checkins').find((m) => m.event_id === e.id && m.member_id === member)
    const excused = rows(db, 'absence_requests').some((a) => a.member_id === member && a.event_id === e.id
      && (a.status === 'approved' || (a.status === 'pending' && Date.parse(a.requested_at) <= Date.parse(e.starts_at))))
    if (scan) { counted++; attended++; if (scan.status === 'late') lates++ } else if (!excused) { counted++; misses++ }
  }
  return { counted, attended, lates, misses }
}

const isStudent = (db, id) => rows(db, 'member_roles').some((r) => r.member_id === id && r.role === 'student')
  && !rows(db, 'member_roles').some((r) => r.member_id === id && ['mentor', 'admin'].includes(r.role))
  && rows(db, 'profiles').some((p) => p.id === id && p.approved !== false && (p.status ?? 'active') === 'active')

export default {
  migration: '0015',
  creates: {
    tables: ['standing_settings', 'member_notices', 'notice_outbox', 'team_weeks', 'absence_requests', 'grade_checks',
      'discipline_records', 'safety_violations', 'incident_reports', 'fll_teams', 'fll_mentors',
      'standing_weeks', 'standing_months', 'standing_records'],
    rpcs: ['member_standing', 'staff_standing_overview', 'request_absence', 'withdraw_absence', 'decide_absence', 'staff_set_week',
      'staff_log_discipline', 'appeal_discipline', 'admin_decide_appeal', 'staff_log_safety', 'report_incident', 'staff_update_incident',
      'staff_void_session', 'staff_void_day', 'fll_join', 'fll_leave', 'standing_evaluate', 'admin_confirm_standing',
      'admin_record_grade_check', 'mark_notice_read'],
  },

  relations: {
    'absence_requests.events': { local: 'event_id', foreign: 'id', table: 'events', one: true },
  },

  seed: ({ ids, now }) => {
    const t = ms(now)
    const mon = mondayOf(t)
    const prev = (n) => new Date(Date.parse(`${mon}T12:00:00Z`) - n * 7 * D).toISOString().slice(0, 10)
    const tomorrowMeeting = ids.meetingTomorrow
    return {
      standing_settings: [{ id: true, starts_on: prev(4), build_season_start: '2027-01-09', build_season_end: '2027-04-04', weekly_hours: 2, build_weekly_hours: 10, meeting_pct: 80 }],
      standing_weeks: [
        { member_id: ids.student2, week_start: prev(2), hours: 0.5, required: 2, meetings: 2, misses: 0, excused: false, suspended: false, ok: false },
        { member_id: ids.student2, week_start: prev(1), hours: 2.5, required: 2, meetings: 2, misses: 0, excused: false, suspended: false, ok: true },
      ],
      standing_records: [
        { member_id: ids.student2, kind: 'hours', reason: 'Week of the 21st: 0.5 of 2 hours.', opened_on: prev(1), clean_weeks: 1, status: 'open' },
      ],
      absence_requests: [
        { member_id: ids.student2, event_id: tomorrowMeeting, reason: 'medical', emergency: false, note: 'Orthodontist', status: 'pending', requested_at: iso(t - 2 * D) },
      ],
      safety_violations: [{ member_id: ids.student2, rule: 'No safety glasses', logged_by: ids.mentor, logged_at: iso(t - 3 * D) }],
      member_notices: [{ member_id: ids.student2, kind: 'probation', title: 'Hours probation started', body: 'Week of the 21st: 0.5 of 2 hours.', created_at: iso(t - 6 * D) }],
      fll_teams: [{ id: FLL_TEAM, name: 'Glow Bots', active: true }],
    }
  },

  visible: {
    member_notices: ({ row, user, persona, db }) => seesMember(db, user, persona, row.member_id),
    notice_outbox: ({ persona }) => isAdmin(persona),
    absence_requests: ({ row, user, persona, db }) => seesMember(db, user, persona, row.member_id),
    grade_checks: ({ row, user, persona, db }) => seesMember(db, user, persona, row.member_id),
    discipline_records: ({ row, user, persona, db }) => seesMember(db, user, persona, row.member_id),
    safety_violations: ({ row, user, persona, db }) => seesMember(db, user, persona, row.member_id),
    incident_reports: ({ row, user, persona }) => row.reported_by === user?.id || isStaff(persona),
    standing_weeks: ({ row, user, persona, db }) => seesMember(db, user, persona, row.member_id),
    standing_months: ({ row, user, persona, db }) => seesMember(db, user, persona, row.member_id),
    standing_records: ({ row, user, persona, db }) => seesMember(db, user, persona, row.member_id),
  },

  rpcs: {
    member_standing: ({ args, db, user, persona, now }) => {
      const m = args.p_member
      if (!seesMember(db, user, persona, m)) return refuse('Not allowed', '42501')
      const t = ms(now)
      const s = rows(db, 'standing_settings')[0] ?? { weekly_hours: 2, build_weekly_hours: 10, meeting_pct: 80, starts_on: '2026-01-01' }
      const mon = mondayOf(t)
      const from = Date.parse(new Date(`${mon}T00:00:00-07:00`).toISOString())
      const recs = rows(db, 'standing_records').filter((r) => r.member_id === m)
      const mm = monthMeetings(db, m, now)
      const sy = `${new Date(t).getMonth() >= 7 ? new Date(t).getFullYear() : new Date(t).getFullYear() - 1}-08-01`
      return ok({
        member: m, name: nameOf(db, m), applies: isStudent(db, m), since: s.starts_on,
        standing: recs.some((r) => r.status === 'removed') ? 'removed' : recs.some((r) => ['open', 'proposed'].includes(r.status)) ? 'probation' : 'good',
        records: recs,
        week: { start: mon, hours: hoursBetween(db, m, from, from + 7 * D), required: s.weekly_hours },
        month: { ...mm, late_absences: Math.floor(mm.lates / 3), pct: s.meeting_pct },
        weeks: rows(db, 'standing_weeks').filter((w) => w.member_id === m).sort((a, b) => b.week_start.localeCompare(a.week_start)),
        months: rows(db, 'standing_months').filter((w) => w.member_id === m),
        grades: rows(db, 'grade_checks').filter((g) => g.member_id === m),
        safety: rows(db, 'safety_violations').filter((v) => v.member_id === m && laDate(v.logged_at) >= sy),
        discipline: rows(db, 'discipline_records').filter((d) => d.member_id === m),
        absences: rows(db, 'absence_requests').filter((a) => a.member_id === m).map((a) => {
          const e = rows(db, 'events').find((x) => x.id === a.event_id) ?? {}
          return { id: a.id, event_id: a.event_id, title: e.title, starts_at: e.starts_at, reason: a.reason, emergency: a.emergency, status: a.status, note: a.note, decision_note: a.decision_note }
        }),
        fll: rows(db, 'fll_mentors').filter((f) => f.member_id === m && !f.removed_at)
          .map((f) => ({ team_id: f.team_id, team: rows(db, 'fll_teams').find((x) => x.id === f.team_id)?.name })),
      })
    },

    staff_standing_overview: ({ db, persona, now }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      const t = ms(now)
      const mon = mondayOf(t)
      const from = Date.parse(new Date(`${mon}T00:00:00-07:00`).toISOString())
      return ok(rows(db, 'profiles').filter((p) => isStudent(db, p.id)).map((p) => {
        const open = rows(db, 'standing_records').filter((r) => r.member_id === p.id && ['open', 'proposed'].includes(r.status))
        const mm = monthMeetings(db, p.id, now)
        return {
          member_id: p.id, name: nameOf(db, p.id), standing: open.length ? 'probation' : 'good',
          open_kinds: open.map((r) => `${r.kind}:${r.status}`), week_hours: hoursBetween(db, p.id, from, from + 7 * D), week_required: 2,
          month_counted: mm.counted, month_attended: mm.attended, month_lates: mm.lates,
          safety_count: rows(db, 'safety_violations').filter((v) => v.member_id === p.id).length,
        }
      }).sort((a, b) => a.name.localeCompare(b.name)))
    },

    request_absence: ({ args, db, user, engine, now }) => {
      const ev = rows(db, 'events').find((e) => e.id === args.p_event)
      if (!ev) return refuse('Event not found', 'P0002')
      const t = ms(now)
      const starts = Date.parse(ev.starts_at)
      const mandatory = ev.mandatory || ev.kind === 'competition'
      if (ev.kind !== 'meeting' && !mandatory) return refuse('Only team meetings and mandatory events need an absence request', '22023')
      if (args.p_emergency) {
        // 0025: a medical visit is not an emergency (handbook Section 6).
        if (!['illness', 'family_emergency'].includes(args.p_reason)) return refuse('An emergency is your own illness or injury, or a death, hospital stay or serious illness in your close family', '22023')
      } else {
        if (mandatory && !(args.p_reason === 'religious' && starts - t >= 14 * D)) return refuse('Only an emergency excuses a mandatory event (a religious holiday is asked 14 days ahead)', '22023')
        if (starts - t < 24 * H) return refuse('Ask at least 24 hours ahead, or file it as an emergency', '22023')
      }
      const live = rows(db, 'absence_requests').find((a) => a.member_id === user.id && a.event_id === ev.id && ['pending', 'approved'].includes(a.status))
      if (live) return ok(live)
      return ok(engine.insertRow('absence_requests', { member_id: user.id, event_id: ev.id, reason: args.p_reason, emergency: !!args.p_emergency, note: args.p_note || null, status: 'pending', requested_at: iso(t) }))
    },
    withdraw_absence: ({ args, user, engine, now }) => ok(engine.updateRows('absence_requests',
      (a) => a.id === args.p_request && a.member_id === user.id && a.status === 'pending', { status: 'withdrawn', decided_at: iso(ms(now)) }).length),
    decide_absence: ({ args, db, user, persona, engine, now }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      // 0025: a request unanswered when the event started is approved (Section 6).
      const req = rows(db, 'absence_requests').find((a) => a.id === args.p_request && a.status === 'pending' && a.member_id !== user.id)
      const evStart = req && Date.parse(rows(db, 'events').find((e) => e.id === req.event_id)?.starts_at ?? '')
      if (req && !args.p_approve && Date.parse(req.requested_at) <= evStart && ms(now) >= evStart) {
        return refuse('This request was still unanswered when the event started, so it is approved (handbook Section 6)', '22023')
      }
      const [row] = engine.updateRows('absence_requests', (a) => a.id === args.p_request && a.status === 'pending' && a.member_id !== user.id,
        { status: args.p_approve ? 'approved' : 'denied', decided_by: user.id, decided_at: iso(ms(now)), decision_note: args.p_note || null })
      if (!row) return refuse('No pending request', 'P0002')
      notify(engine, row.member_id, 'absence', args.p_approve ? 'Absence approved' : 'Absence denied', args.p_note, user.id)
      return ok(row)
    },
    staff_set_week: ({ args, user, persona, engine, now }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      if (Date.parse(`${args.p_week}T12:00:00Z`) < ms(now) + 13 * D) return refuse('A school break week is posted at least 14 days ahead', '22023')
      engine.deleteRows('team_weeks', (w) => w.week_start === args.p_week)
      if (!args.p_kind) return ok(null)
      return ok(engine.insertRow('team_weeks', { week_start: args.p_week, kind: args.p_kind, note: args.p_note, posted_by: user.id }))
    },
    staff_log_discipline: ({ args, user, persona, engine }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      if (args.p_level === 'removal' && !isAdmin(persona)) return refuse('Only Mr. Pina removes a member', '42501')
      if (args.p_level === 'suspension') {
        const a = Date.parse(args.p_starts), b = Date.parse(args.p_ends)
        if (!(b - a >= 6 * D && b - a <= 27 * D)) return refuse('new row violates check constraint "discipline_suspension_dates_chk"', '23514')
      }
      const row = engine.insertRow('discipline_records', { member_id: args.p_member, level: args.p_level, rule: args.p_rule, note: args.p_note, starts_on: args.p_starts, ends_on: args.p_ends, created_by: user.id })
      notify(engine, args.p_member, 'discipline', args.p_level, `Rule: ${args.p_rule}`, user.id)
      return ok(row)
    },
    appeal_discipline: ({ args, user, engine, now }) => {
      const [row] = engine.updateRows('discipline_records', (d) => d.id === args.p_record && d.member_id === user.id && d.level === 'written' && !d.appeal_at,
        { appeal_note: args.p_note, appeal_at: iso(ms(now)) })
      return row ? ok(row) : refuse('Only a written warning, within 5 school days, once', 'P0002')
    },
    admin_decide_appeal: ({ args, user, persona, engine }) => {
      if (!isAdmin(persona)) return refuse('Admin only', '42501')
      const [row] = engine.updateRows('discipline_records', (d) => d.id === args.p_record && d.appeal_at && !d.appeal_decision, { appeal_decision: args.p_uphold ? 'upheld' : 'withdrawn', appeal_by: user.id })
      return row ? ok(row) : refuse('No open appeal', 'P0002')
    },
    staff_log_safety: ({ args, user, persona, engine }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      const row = engine.insertRow('safety_violations', { member_id: args.p_member, rule: args.p_rule, note: args.p_note, logged_by: user.id })
      notify(engine, args.p_member, 'safety', 'Safety violation logged', `Rule: ${args.p_rule}`, user.id)
      return ok(row)
    },
    report_incident: ({ args, user, engine }) => ok(engine.insertRow('incident_reports', {
      kind: args.p_kind, member_id: args.p_member, description: args.p_description, reported_by: user.id,
    })),
    staff_update_incident: ({ args, user, persona, engine, now }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      const [row] = engine.updateRows('incident_reports', (r) => r.id === args.p_incident, {
        parent_called: !!args.p_parent_called, office_told: !!args.p_office_told,
        closed_by: args.p_close ? user.id : null, closed_at: args.p_close ? iso(ms(now)) : null,
      })
      return row ? ok(row) : refuse('Not found', 'P0002')
    },
    staff_void_session: ({ args, db, user, persona, engine, now }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      const last = rows(db, 'attendance_events').filter((e) => e.user_id === args.p_member).sort((a, b) => b.event_time.localeCompare(a.event_time))[0]
      if (!last || last.type !== 'in') return refuse('Not signed in', 'P0002')
      const out = engine.insertRow('attendance_events', { user_id: args.p_member, type: 'out', location: 'voided', method: 'manual', note: `Voided: ${args.p_reason}`, event_time: iso(ms(now)) })
      engine.insertRow('session_reviews', { user_id: args.p_member, checkin_id: last.id, checkout_id: out.id, status: 'voided', reviewed_by: user.id })
      notify(engine, args.p_member, 'void', 'Session voided', args.p_reason, user.id)
      return ok(1)
    },
    staff_void_day: ({ args, db, user, persona, engine }) => {
      if (!isStaff(persona)) return refuse('Staff only', '42501')
      const ev = rows(db, 'attendance_events').filter((e) => e.user_id === args.p_member).sort((a, b) => a.event_time.localeCompare(b.event_time))
      let n = 0
      for (let i = 0; i < ev.length - 1; i++) {
        if (ev[i].type === 'in' && ev[i + 1].type === 'out' && laDate(ev[i].event_time) === args.p_day) {
          engine.deleteRows('session_reviews', (r) => r.checkin_id === ev[i].id)
          engine.insertRow('session_reviews', { user_id: args.p_member, checkin_id: ev[i].id, checkout_id: ev[i + 1].id, status: 'voided', reviewed_by: user.id })
          n++
        }
      }
      if (n) notify(engine, args.p_member, 'void', 'Hours voided', args.p_reason, user.id)
      return ok(n)
    },
    fll_join: ({ args, db, user, engine }) => {
      const live = rows(db, 'fll_mentors').filter((f) => f.team_id === args.p_team && !f.removed_at)
      const mine = live.find((f) => f.member_id === user.id)
      if (mine) return ok(mine)
      if (live.length >= 4) return refuse('That FLL team has its 4 mentors', '22023')
      return ok(engine.insertRow('fll_mentors', { team_id: args.p_team, member_id: user.id }))
    },
    fll_leave: ({ args, user, persona, engine, now }) => {
      const m = args.p_member || user.id
      if (m !== user.id && !isStaff(persona)) return refuse('Staff only', '42501')
      return ok(engine.updateRows('fll_mentors', (f) => f.team_id === args.p_team && f.member_id === m && !f.removed_at,
        { removed_at: iso(ms(now)), removed_reason: m === user.id ? 'left' : 'removed by a mentor' }).length)
    },
    standing_evaluate: ({ persona }) => (isAdmin(persona) ? ok(0) : refuse('Admin only', '42501')),
    admin_confirm_standing: ({ args, db, user, persona, engine, now }) => {
      if (!isAdmin(persona)) return refuse('Admin only', '42501')
      const r = rows(db, 'standing_records').find((x) => x.id === args.p_record)
      if (!r) return refuse('Not found', 'P0002')
      const stamp = { confirmed_by: user.id, confirmed_at: iso(ms(now)) }
      if (r.kind === 'removal' && r.status === 'proposed') {
        const [row] = engine.updateRows('standing_records', (x) => x.id === r.id, { ...stamp, status: args.p_confirm ? 'removed' : 'dismissed' })
        if (args.p_confirm) engine.updateRows('profiles', (p) => p.id === r.member_id, { status: 'inactive' })
        return ok(row)
      }
      const [row] = engine.updateRows('standing_records', (x) => x.id === r.id, args.p_confirm ? stamp : { ...stamp, status: 'dismissed' })
      return ok(row)
    },
    admin_record_grade_check: ({ args, db, user, persona, engine }) => {
      if (!isAdmin(persona)) return refuse('Admin only', '42501')
      engine.deleteRows('grade_checks', (g) => g.member_id === args.p_member && g.check_date === args.p_check)
      const row = engine.insertRow('grade_checks', { member_id: args.p_member, check_date: args.p_check, below: !!args.p_below, note: args.p_note, set_by: user.id })
      engine.updateRows('standing_records', (r) => r.member_id === args.p_member && r.kind === 'grades' && r.status === 'open', { status: 'closed', closed_on: args.p_check })
      if (args.p_below && !rows(db, 'standing_records').some((r) => r.member_id === args.p_member && r.kind === 'grades' && r.status === 'open')) {
        engine.insertRow('standing_records', { member_id: args.p_member, kind: 'grades', reason: 'GPA under 2.0 at the grade check.', opened_on: args.p_check, status: 'open', clean_weeks: 0 })
      }
      return ok(row)
    },
    mark_notice_read: ({ args, user, engine, now }) => {
      engine.updateRows('member_notices', (n) => n.id === args.p_notice && n.member_id === user.id && !n.read_at, { read_at: iso(ms(now)) })
      return ok(null)
    },
  },
}
