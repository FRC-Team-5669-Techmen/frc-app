// Core RPC handlers: one per function the app calls, each modelled on the
// body of that function in supabase/*.sql -- the same permission check, the
// same raised message (the UI matches on some of them, e.g. RosterPage's
// "Permission denied"), the same writes, the same return shape.
//
// A handler runs as SECURITY DEFINER does: it reads the raw store (no read
// filter) and writes through engine.insertRow/updateRows/deleteRows, which
// skip RLS but still enforce constraints. Handler signature:
//   ({ args, db, user, persona, now, engine, uuid }) -> { data, error }

import { STAFF_ROLES } from './personas.js'
import { laDate, laAddDays } from './time.js'

const CATEGORIES = ['build', 'outreach', 'volunteer', 'competition']

const ok = (data = null) => ({ data, error: null })
// plpgsql `raise exception` -> PostgREST 400 with code P0001.
const raise = (message) => ({ data: null, error: { code: 'P0001', message, details: null, hint: null } })

const rolesOf = (db, id) => (db.member_roles ?? []).filter((r) => r.member_id === id).map((r) => r.role)
const isStaff = (db, user) => !!user && rolesOf(db, user.id).some((r) => STAFF_ROLES.includes(r))
const isAdmin = (db, user) => !!user && rolesOf(db, user.id).includes('admin')
const profileOf = (db, id) => (db.profiles ?? []).find((p) => p.id === id) ?? null
const nameOf = (db, id) => profileOf(db, id)?.full_name ?? null
const staffOnly = (db, user) => (isStaff(db, user) ? null : raise('Permission denied: staff role required'))
const adminOnly = (db, user) => (isAdmin(db, user) ? null : raise('Permission denied: admin role required'))

function audit(engine, { event, member, actor, action, reason, oldValue = null, newValue = null }) {
  engine.insertRow('attendance_audit', { event_id: action === 'delete' ? null : event, member_id: member, actor_id: actor, action, reason, old_value: oldValue, new_value: newValue })
}

const snapshot = (e) => ({ type: e.type, event_time: e.event_time, category: e.category, location: e.location, method: e.method })

// Sum study minutes for one member on one LA date.
function studyMinutes(db, member, ymd) {
  return (db.study_sessions ?? []).filter((s) => s.member_id === member && s.date === ymd).reduce((a, s) => a + Number(s.minutes || 0), 0)
}
function studyGoal(db) {
  const v = (db.app_settings ?? []).find((s) => s.key === 'study_daily_goal_minutes')?.value
  return Number.parseInt(v ?? '60', 10) || 60
}
function studyStreak(db, member, goal, now) {
  let streak = 0
  let cons = 0
  for (let i = 0; i <= 400; i += 1) {
    if (studyMinutes(db, member, laAddDays(now, -i)) >= goal) { streak += 1; cons = 0 } else { cons += 1; if (cons >= 2) break }
  }
  return streak
}
function studyStrip(db, member, goal, now) {
  const out = []
  for (let i = 13; i >= 0; i -= 1) {
    const date = laAddDays(now, -i)
    const minutes = studyMinutes(db, member, date)
    out.push({ date, minutes, status: minutes >= goal ? 'met' : minutes > 0 ? 'partial' : 'none' })
  }
  return out
}

export const CORE_RPCS = {
  // ── Identity and access ───────────────────────────────────────────────────
  claim_profile: ({ db, user }) => {
    if (!user) return ok(false)
    return ok(profileOf(db, user.id)?.approved === true)
  },

  my_access_request_status: ({ db, user }) => {
    const email = (db.__users ?? []).find((u) => u.id === user?.id)?.email ?? user?.email
    const rows = (db.access_requests ?? []).filter((r) => r.email === email).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    return ok(rows[0]?.status ?? null)
  },

  approve_access_request: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!['student', 'mentor', 'parent'].includes(args.p_role)) return raise('Invalid role: must be student, mentor, or parent')
    const req = (db.access_requests ?? []).find((r) => r.id === args.p_request)
    if (!req) return raise('Request not found')
    engine.updateRows('access_requests', (r) => r.id === req.id, { status: 'approved', reviewed_by: user.id, reviewed_at: now.toISOString() })
    engine.deleteRows('approved_emails', (r) => r.email === req.email)
    engine.insertRow('approved_emails', { email: req.email, granted_role: args.p_role, added_by: user.id })
    return ok()
  },

  deny_access_request: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!(db.access_requests ?? []).some((r) => r.id === args.p_request)) return raise('Request not found')
    engine.updateRows('access_requests', (r) => r.id === args.p_request, { status: 'denied', reviewed_by: user.id, reviewed_at: now.toISOString() })
    return ok()
  },

  admin_get_members: ({ db, user }) => {
    const denied = adminOnly(db, user); if (denied) return denied
    const emails = Object.fromEntries((db.__users ?? []).map((u) => [u.id, u.email]))
    return ok((db.profiles ?? []).slice().sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))).map((p) => ({
      id: p.id, full_name: p.full_name, nickname: p.nickname, email: emails[p.id] ?? null, status: p.status,
      approved: p.approved, roles: rolesOf(db, p.id), subteams: p.subteams ?? [],
    })))
  },

  admin_set_member_role: ({ args, db, user, engine }) => {
    const denied = adminOnly(db, user); if (denied) return denied
    if (!['student', 'mentor', 'lead', 'admin', 'parent'].includes(args.p_role)) return raise(`Invalid role: ${args.p_role}`)
    if (args.p_grant) {
      if (!rolesOf(db, args.p_member).includes(args.p_role)) engine.insertRow('member_roles', { member_id: args.p_member, role: args.p_role })
    } else {
      engine.deleteRows('member_roles', (r) => r.member_id === args.p_member && r.role === args.p_role)
    }
    return ok()
  },

  admin_delete_member: ({ args, db, user, engine }) => {
    const denied = adminOnly(db, user); if (denied) return denied
    if (args.p_member === user.id) return raise('You cannot delete your own account')
    // Null every actor reference that would otherwise block the delete, as the
    // SQL does, then let the cascades take the rest.
    for (const [table, rows] of Object.entries(db)) {
      if (!Array.isArray(rows) || table.startsWith('__')) continue
      for (const col of ['reviewed_by', 'created_by', 'certified_by', 'added_by', 'assigned_by', 'overridden_by', 'verified_by', 'claimed_by', 'updated_by', 'actor_id']) {
        for (const r of rows) if (r[col] === args.p_member) r[col] = null
      }
    }
    engine.deleteRows('session_reviews', (r) => r.user_id === args.p_member)
    engine.deleteRows('profiles', (p) => p.id === args.p_member)
    db.__users = (db.__users ?? []).filter((u) => u.id !== args.p_member)
    return ok()
  },

  get_calendar_token: ({ db, user }) => {
    if (!user) return raise('not authenticated')
    return ok(profileOf(db, user.id)?.calendar_token ?? null)
  },

  rotate_calendar_token: ({ db, user, engine, uuid }) => {
    if (!user) return raise('not authenticated')
    const token = uuid()
    engine.updateRows('profiles', (p) => p.id === user.id, { calendar_token: token })
    return ok(token)
  },

  // ── Guardians and parent links ────────────────────────────────────────────
  link_guardian: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (args.p_parent === args.p_student) return raise('A member cannot be their own guardian')
    if (!(db.guardian_links ?? []).some((g) => g.parent_id === args.p_parent && g.student_id === args.p_student)) {
      engine.insertRow('guardian_links', { parent_id: args.p_parent, student_id: args.p_student, created_by: user.id })
    }
    return ok()
  },
  unlink_guardian: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    engine.deleteRows('guardian_links', (g) => g.parent_id === args.p_parent && g.student_id === args.p_student)
    return ok()
  },
  request_parent_link: ({ args, db, user, engine }) => {
    const existing = (db.parent_link_requests ?? []).find((r) => r.parent_id === user.id && r.student_id === args.p_student && r.status === 'pending')
    if (existing) return ok(existing.id)
    return ok(engine.insertRow('parent_link_requests', { parent_id: user.id, student_id: args.p_student, note: args.p_note ?? null }).id)
  },
  approve_parent_link: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    const req = (db.parent_link_requests ?? []).find((r) => r.id === args.p_request)
    if (!req) return raise('Request not found')
    if (!(db.guardian_links ?? []).some((g) => g.parent_id === req.parent_id && g.student_id === req.student_id)) {
      engine.insertRow('guardian_links', { parent_id: req.parent_id, student_id: req.student_id, created_by: user.id })
    }
    engine.updateRows('parent_link_requests', (r) => r.id === req.id, { status: 'approved', reviewed_by: user.id, reviewed_at: now.toISOString() })
    return ok()
  },
  deny_parent_link: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!(db.parent_link_requests ?? []).some((r) => r.id === args.p_request)) return raise('Request not found')
    engine.updateRows('parent_link_requests', (r) => r.id === args.p_request, { status: 'denied', reviewed_by: user.id, reviewed_at: now.toISOString() })
    return ok()
  },

  // ── Certifications ────────────────────────────────────────────────────────
  request_cert: ({ args, db, user, engine }) => {
    if (!(db.skills ?? []).some((s) => s.id === args.p_skill)) return raise('Skill not found')
    if ((db.member_skills ?? []).some((m) => m.member_id === user.id && m.skill_id === args.p_skill && m.status === 'certified')) return raise('You are already certified in this skill')
    const existing = (db.cert_requests ?? []).find((r) => r.member_id === user.id && r.skill_id === args.p_skill && r.status === 'pending')
    if (existing) return ok(existing.id)
    return ok(engine.insertRow('cert_requests', { member_id: user.id, skill_id: args.p_skill, note: args.p_note ?? null }).id)
  },
  approve_cert_request: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    const req = (db.cert_requests ?? []).find((r) => r.id === args.p_request)
    if (!req) return raise('Request not found')
    const has = (db.member_skills ?? []).some((m) => m.member_id === req.member_id && m.skill_id === req.skill_id)
    const patch = { status: 'certified', certified_by: user.id, certified_at: now.toISOString(), updated_at: now.toISOString() }
    if (has) engine.updateRows('member_skills', (m) => m.member_id === req.member_id && m.skill_id === req.skill_id, patch)
    else engine.insertRow('member_skills', { member_id: req.member_id, skill_id: req.skill_id, ...patch })
    engine.updateRows('cert_requests', (r) => r.id === req.id, { status: 'approved', reviewed_by: user.id, reviewed_at: now.toISOString() })
    return ok()
  },
  deny_cert_request: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!(db.cert_requests ?? []).some((r) => r.id === args.p_request)) return raise('Request not found')
    engine.updateRows('cert_requests', (r) => r.id === args.p_request, { status: 'denied', reviewed_by: user.id, reviewed_at: now.toISOString() })
    return ok()
  },

  // ── Jobs ──────────────────────────────────────────────────────────────────
  claim_task: ({ args, db, user, engine }) => {
    const t = (db.tasks ?? []).find((x) => x.id === args.p_task)
    if (!t) return raise('Task not found')
    if (t.status !== 'open') return raise('Task is not open for claiming')
    const claims = (db.task_claims ?? []).filter((c) => c.task_id === t.id)
    if (claims.some((c) => c.member_id === user.id)) return raise('You have already claimed this task')
    if (t.max_claimants != null && claims.length >= t.max_claimants) return raise('This job is full')
    const req = (db.task_required_skills ?? []).filter((r) => r.task_id === t.id).map((r) => r.skill_id)
    const mine = new Set((db.member_skills ?? []).filter((m) => m.member_id === user.id && m.status === 'certified').map((m) => m.skill_id))
    if (req.length && !req.some((s) => mine.has(s))) return raise("You need at least one of this job's required certifications to claim it")
    engine.insertRow('task_claims', { task_id: t.id, member_id: user.id, status: 'claimed' })
    return ok()
  },
  release_task: ({ args, db, user, engine }) => {
    const c = (db.task_claims ?? []).find((x) => x.task_id === args.p_task && x.member_id === user.id)
    if (!c) return raise('You have not claimed this task')
    if (c.status !== 'claimed') return raise('Task is not in a claimed state')
    engine.deleteRows('task_claims', (x) => x === c)
    return ok()
  },
  submit_task: ({ args, db, user, engine, now }) => {
    const c = (db.task_claims ?? []).find((x) => x.task_id === args.p_task && x.member_id === user.id)
    if (!c) return raise('You have not claimed this task')
    if (c.status !== 'claimed') return raise('Task is not in a claimed state')
    engine.updateRows('task_claims', (x) => x === c, { status: 'submitted', submitted_at: now.toISOString() })
    return ok()
  },
  verify_task: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    const c = (db.task_claims ?? []).find((x) => x.task_id === args.p_task && x.member_id === args.p_member)
    if (!c) return raise('Claim not found')
    if (c.status !== 'submitted') return raise('Task is not awaiting verification')
    engine.updateRows('task_claims', (x) => x === c, args.p_approve
      ? { status: 'completed', verified_by: user.id, verified_at: now.toISOString() }
      : { status: 'claimed', submitted_at: null })
    return ok()
  },
  admin_revert_claim: ({ args, db, user, engine, now }) => {
    const denied = adminOnly(db, user); if (denied) return denied
    const c = (db.task_claims ?? []).find((x) => x.task_id === args.p_task && x.member_id === args.p_member)
    if (!c) return raise('Claim not found')
    if (c.status !== 'completed') return raise('Only an approved claim can be reverted')
    engine.updateRows('task_claims', (x) => x === c, { status: 'submitted', verified_by: null, verified_at: null })
    engine.updateRows('tasks', (t) => t.id === args.p_task && t.status === 'completed', { status: 'open', completed_at: null, updated_at: now.toISOString() })
    return ok()
  },
  set_session_job: ({ args, db, user, engine }) => {
    const c = (db.task_claims ?? []).find((x) => x.task_id === args.p_task && x.member_id === user.id && ['claimed', 'submitted'].includes(x.status))
    if (!c) return raise('Claim this job before logging time to it')
    const mine = (db.attendance_events ?? []).filter((e) => e.user_id === user.id).sort((a, b) => a.event_time.localeCompare(b.event_time))
    const last = mine.at(-1)
    if (!last || last.type !== 'in') return raise('Check in first, then you can log this session to the job')
    engine.updateRows('attendance_events', (e) => e.id === last.id, { job_id: args.p_task })
    return ok()
  },

  // ── Attendance: staff corrections (all audited) ───────────────────────────
  staff_override_attendance: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!['in', 'out'].includes(args.new_type)) return raise('Type must be in or out')
    engine.insertRow('attendance_events', { user_id: args.target_member, type: args.new_type, method: 'override', location: 'override', overridden_by: user.id, verified: true })
    return ok()
  },
  staff_add_event: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!['in', 'out'].includes(args.p_type)) return raise('Type must be in or out')
    if (!args.p_event_time) return raise('An event time is required')
    if (!args.p_reason || !String(args.p_reason).trim()) return raise('A reason is required')
    if (args.p_category && !CATEGORIES.includes(args.p_category)) return raise(`Invalid category: ${args.p_category}`)
    if (!profileOf(db, args.p_member)) return raise('Member not found')
    const row = engine.insertRow('attendance_events', {
      user_id: args.p_member, type: args.p_type, event_time: args.p_event_time, category: args.p_category ?? 'build',
      method: 'manual', location: 'manual', manual_entry: true, verified: true,
    })
    audit(engine, { event: row.id, member: args.p_member, actor: user.id, action: 'insert', reason: args.p_reason, newValue: snapshot(row) })
    return ok(row.id)
  },
  staff_add_manual_session: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!args.p_reason || !String(args.p_reason).trim()) return raise('A reason is required')
    if (!args.p_in || !args.p_out || Date.parse(args.p_out) <= Date.parse(args.p_in)) return raise('Check-out must be after check-in')
    const base = { user_id: args.p_member, category: args.p_category ?? 'build', method: 'manual', location: 'manual', manual_entry: true, verified: true }
    const i = engine.insertRow('attendance_events', { ...base, type: 'in', event_time: args.p_in })
    const o = engine.insertRow('attendance_events', { ...base, type: 'out', event_time: args.p_out })
    for (const r of [i, o]) audit(engine, { event: r.id, member: args.p_member, actor: user.id, action: 'insert', reason: args.p_reason, newValue: snapshot(r) })
    return ok()
  },
  staff_edit_event: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!args.p_reason || !String(args.p_reason).trim()) return raise('A reason is required')
    const e = (db.attendance_events ?? []).find((x) => x.id === args.p_event)
    if (!e) return raise(`Event ${args.p_event} not found`)
    const old = snapshot(e)
    const [next] = engine.updateRows('attendance_events', (x) => x.id === e.id, { event_time: args.p_event_time ?? undefined, category: args.p_category ?? undefined })
    audit(engine, { event: e.id, member: e.user_id, actor: user.id, action: 'edit', reason: args.p_reason, oldValue: old, newValue: snapshot(next) })
    return ok()
  },
  staff_set_event: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!args.p_reason || !String(args.p_reason).trim()) return raise('A reason is required')
    if (args.p_type != null && !['in', 'out'].includes(args.p_type)) return raise('Type must be in or out')
    const e = (db.attendance_events ?? []).find((x) => x.id === args.p_event)
    if (!e) return raise(`Event ${args.p_event} not found`)
    const old = snapshot(e)
    const [next] = engine.updateRows('attendance_events', (x) => x.id === e.id, { type: args.p_type ?? undefined, event_time: args.p_event_time ?? undefined, category: args.p_category ?? undefined })
    audit(engine, { event: e.id, member: e.user_id, actor: user.id, action: 'edit', reason: args.p_reason, oldValue: old, newValue: snapshot(next) })
    return ok()
  },
  staff_void_event: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!args.p_reason || !String(args.p_reason).trim()) return raise('A reason is required')
    const e = (db.attendance_events ?? []).find((x) => x.id === args.p_event)
    if (!e) return raise(`Event ${args.p_event} not found`)
    audit(engine, { event: e.id, member: e.user_id, actor: user.id, action: 'delete', reason: args.p_reason, oldValue: snapshot(e) })
    engine.deleteRows('attendance_events', (x) => x.id === e.id)
    return ok()
  },
  staff_add_hour_adjustment: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!CATEGORIES.includes(args.p_category)) return raise(`Invalid category: ${args.p_category}`)
    if (args.p_hours == null || Number(args.p_hours) === 0) return raise('Adjustment hours must be non-zero')
    if (!args.p_reason || !String(args.p_reason).trim()) return raise('A reason is required')
    return ok(engine.insertRow('hour_adjustments', { member_id: args.p_member, category: args.p_category, hours: args.p_hours, reason: args.p_reason, created_by: user.id }).id)
  },

  // ── Logged hours ──────────────────────────────────────────────────────────
  staff_edit_logged_hours: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    const e = (db.logged_hours ?? []).find((x) => x.id === args.p_entry)
    if (!e) return raise('Entry not found')
    if (args.p_type != null && !CATEGORIES.includes(args.p_type)) return raise(`Invalid category: ${args.p_type}`)
    if (args.p_hours != null && (Number(args.p_hours) <= 0 || Number(args.p_hours) > 24)) return raise('Hours must be between 0 and 24')
    if (args.p_date != null && args.p_date > laDate(now)) return raise('Date cannot be in the future')
    engine.updateRows('logged_hours', (x) => x.id === e.id, { type: args.p_type ?? undefined, hours: args.p_hours ?? undefined, date: args.p_date ?? undefined })
    return ok()
  },
  staff_delete_logged_hours: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!(db.logged_hours ?? []).some((x) => x.id === args.p_entry)) return raise('Entry not found')
    engine.deleteRows('logged_hours', (x) => x.id === args.p_entry)
    return ok()
  },
  request_logged_hours_correction: ({ args, db, user, engine, now }) => {
    const e = (db.logged_hours ?? []).find((x) => x.id === args.p_entry)
    if (!e) return raise('Entry not found')
    if (e.member_id !== user.id) return raise('That entry is not yours')
    if (!args.p_note || !String(args.p_note).trim()) return raise('A reason is required')
    if (args.p_proposed_type != null && !CATEGORIES.includes(args.p_proposed_type)) return raise(`Invalid category: ${args.p_proposed_type}`)
    if (args.p_proposed_hours != null && (Number(args.p_proposed_hours) <= 0 || Number(args.p_proposed_hours) > 24)) return raise('Hours must be between 0 and 24')
    if (args.p_proposed_date != null && args.p_proposed_date > laDate(now)) return raise('Date cannot be in the future')
    if ((db.logged_hours_corrections ?? []).some((c) => c.entry_id === e.id && c.status === 'pending')) return raise('A correction request is already pending for this entry')
    return ok(engine.insertRow('logged_hours_corrections', {
      member_id: user.id, entry_id: e.id, note: args.p_note, proposed_type: args.p_proposed_type ?? null,
      proposed_hours: args.p_proposed_hours ?? null, proposed_date: args.p_proposed_date ?? null,
    }).id)
  },
  resolve_logged_hours_correction: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    const c = (db.logged_hours_corrections ?? []).find((x) => x.id === args.p_id)
    if (!c) return raise('Correction not found')
    if (c.status !== 'pending') return ok()
    if (args.p_approve) {
      engine.updateRows('logged_hours', (x) => x.id === c.entry_id, {
        type: args.p_apply_type ?? c.proposed_type ?? undefined, hours: args.p_apply_hours ?? c.proposed_hours ?? undefined, date: args.p_apply_date ?? c.proposed_date ?? undefined,
      })
    }
    engine.updateRows('logged_hours_corrections', (x) => x.id === c.id, { status: args.p_approve ? 'approved' : 'rejected', resolution_note: args.p_resolution ?? null, reviewed_by: user.id, reviewed_at: now.toISOString() })
    return ok()
  },

  // ── Session corrections ───────────────────────────────────────────────────
  request_session_correction: ({ args, db, user, engine }) => {
    if (!args.p_note || !String(args.p_note).trim()) return raise('A reason is required')
    for (const id of [args.p_checkin, args.p_checkout].filter(Boolean)) {
      const e = (db.attendance_events ?? []).find((x) => x.id === id)
      if (!e || e.user_id !== user.id) return raise('That session is not yours')
    }
    return ok(engine.insertRow('session_corrections', {
      member_id: user.id, checkin_id: args.p_checkin ?? null, checkout_id: args.p_checkout ?? null, note: args.p_note,
      proposed_in: args.p_proposed_in ?? null, proposed_out: args.p_proposed_out ?? null, proposed_category: args.p_proposed_category ?? null,
    }).id)
  },
  resolve_session_correction: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    const c = (db.session_corrections ?? []).find((x) => x.id === args.p_id)
    if (!c) return raise('Correction not found')
    if (c.status !== 'pending') return ok()
    if (args.p_approve) {
      const reason = `Correction request: ${c.note}`
      const apply = (id, time, category) => {
        const e = (db.attendance_events ?? []).find((x) => x.id === id)
        if (!e || (time == null && category == null)) return
        const old = snapshot(e)
        const [next] = engine.updateRows('attendance_events', (x) => x.id === id, { event_time: time ?? undefined, category: category ?? undefined })
        audit(engine, { event: id, member: e.user_id, actor: user.id, action: 'edit', reason, oldValue: old, newValue: snapshot(next) })
      }
      apply(c.checkin_id, args.p_apply_in ?? c.proposed_in, args.p_apply_category ?? c.proposed_category)
      apply(c.checkout_id, args.p_apply_out ?? c.proposed_out, null)
    }
    engine.updateRows('session_corrections', (x) => x.id === c.id, { status: args.p_approve ? 'approved' : 'rejected', resolution_note: args.p_resolution ?? null, reviewed_by: user.id, reviewed_at: now.toISOString() })
    return ok()
  },

  // ── Goals ─────────────────────────────────────────────────────────────────
  set_hour_goal: ({ args, db, user, engine, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (!args.p_season) return raise('A season is required')
    if (args.p_target == null || Number(args.p_target) < 0) return raise('Target hours must be 0 or more')
    const cats = args.p_categories && args.p_categories.length ? args.p_categories : null
    if (cats && cats.some((c) => !CATEGORIES.includes(c))) return raise('Invalid category in goal')
    const match = (g) => g.season_id === args.p_season && (g.member_id ?? null) === (args.p_member ?? null)
    const patch = { target_hours: args.p_target, categories: cats, updated_by: user.id, updated_at: now.toISOString() }
    if ((db.hour_goals ?? []).some(match)) engine.updateRows('hour_goals', match, patch)
    else engine.insertRow('hour_goals', { member_id: args.p_member ?? null, season_id: args.p_season, ...patch })
    return ok()
  },
  clear_hour_goal: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    engine.deleteRows('hour_goals', (g) => g.season_id === args.p_season && (g.member_id ?? null) === (args.p_member ?? null))
    return ok()
  },

  // ── Applications ──────────────────────────────────────────────────────────
  staff_set_discord_confirmed: ({ args, db, user, engine }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    if (args.p_confirmed == null) return raise('A confirmed value is required')
    if (!(db.member_applications ?? []).some((a) => a.id === args.p_application)) return raise('Application not found')
    engine.updateRows('member_applications', (a) => a.id === args.p_application, { discord_server_confirmed: args.p_confirmed })
    return ok()
  },

  // ── Aggregates ────────────────────────────────────────────────────────────
  study_summary: ({ db, user, now }) => {
    const goal = studyGoal(db)
    const out = {
      goal_minutes: goal,
      today_minutes: studyMinutes(db, user?.id, laDate(now)),
      streak: studyStreak(db, user?.id, goal, now),
      strip: studyStrip(db, user?.id, goal, now),
    }
    if (isStaff(db, user)) {
      out.roster = (db.profiles ?? []).filter((p) => p.status === 'active' && p.approved).sort((a, b) => String(a.full_name).localeCompare(String(b.full_name))).map((p) => {
        const strip = studyStrip(db, p.id, goal, now)
        return { member_id: p.id, name: p.full_name, streak: studyStreak(db, p.id, goal, now), days_missed_14: strip.filter((d) => d.minutes < goal).length, strip }
      })
    }
    return ok(out)
  },

  readiness_summary: ({ db, user, now }) => {
    const denied = staffOnly(db, user); if (denied) return denied
    const ae = (db.attendance_events ?? []).slice().sort((a, b) => a.event_time.localeCompare(b.event_time))
    const nowMs = now.getTime()
    const weekAgo = nowMs - 7 * 86400_000
    const today = laDate(now)
    const lastBy = {}
    for (const e of ae) if (e.user_id) lastBy[e.user_id] = e
    const live = Object.values(lastBy).filter((e) => e.type === 'in' && laDate(new Date(e.event_time)) === today)
      .sort((a, b) => a.event_time.localeCompare(b.event_time))
      .map((e) => ({ member_id: e.user_id, name: nameOf(db, e.user_id), since: e.event_time }))
    // Closed in/out pairs per member per UTC day in the last 7 days, plus open sessions.
    let secs = 0
    const recent = ae.filter((e) => Date.parse(e.event_time) >= weekAgo)
    const groups = {}
    for (const e of recent) (groups[`${e.user_id}|${e.event_time.slice(0, 10)}`] ??= []).push(e)
    for (const list of Object.values(groups)) {
      for (let i = 1; i < list.length; i += 1) {
        if (list[i].type === 'out' && list[i - 1].type === 'in') secs += (Date.parse(list[i].event_time) - Date.parse(list[i - 1].event_time)) / 1000
      }
    }
    for (const e of Object.values(lastBy)) if (e.type === 'in' && Date.parse(e.event_time) >= weekAgo) secs += (nowMs - Date.parse(e.event_time)) / 1000
    const activeIds = new Set(recent.map((e) => e.user_id))
    const roster = (db.profiles ?? []).filter((p) => p.status === 'active' && p.approved)
    const byName = (a, b) => String(a.name).localeCompare(String(b.name))
    const goal = studyGoal(db)
    const certCount = (sid) => (db.member_skills ?? []).filter((m) => m.skill_id === sid && m.status === 'certified').length
    const subteams = {}
    for (const t of db.tasks ?? []) {
      const k = t.subteam ?? 'Other'
      const g = (subteams[k] ??= { subteam: k, members: new Set(), open: new Set(), claimed: 0, awaiting_verification: 0, completed: 0 })
      if (t.status === 'open') g.open.add(t.id)
      for (const c of (db.task_claims ?? []).filter((x) => x.task_id === t.id)) {
        g.members.add(c.member_id)
        if (c.status === 'claimed') g.claimed += 1
        if (c.status === 'submitted') g.awaiting_verification += 1
        if (c.status === 'completed') g.completed += 1
      }
    }
    const emails = Object.fromEntries((db.__users ?? []).map((u) => [u.id, u.email]))
    const hoursPending = (db.logged_hours ?? []).filter((l) => l.status === 'pending')
    const submittedClaims = (db.task_claims ?? []).filter((c) => c.status === 'submitted')
    const unapproved = (db.profiles ?? []).filter((p) => !p.approved)
    return ok({
      generated_at: now.toISOString(),
      live_presence: live,
      pulse_7d: {
        total_hours: Math.round((secs / 3600) * 10) / 10,
        active_count: activeIds.size,
        at_risk: roster.filter((p) => !activeIds.has(p.id)).map((p) => ({ member_id: p.id, name: p.full_name })).sort(byName),
      },
      cert_readiness: (db.skills ?? []).filter((s) => s.safety_critical).map((s) => ({ skill_id: s.id, name: s.name, certified_count: certCount(s.id), low: certCount(s.id) < 2 }))
        .sort((a, b) => a.certified_count - b.certified_count || a.name.localeCompare(b.name)),
      project_staffing: Object.values(subteams).sort((a, b) => a.subteam.localeCompare(b.subteam)).map((g) => ({
        subteam: g.subteam, contributors: g.members.size, open: g.open.size, claimed: g.claimed, awaiting_verification: g.awaiting_verification, completed: g.completed,
      })),
      action_queue: {
        total: hoursPending.length + submittedClaims.length + unapproved.length,
        hours_pending: hoursPending.map((l) => ({ id: l.id, name: nameOf(db, l.member_id), date: l.date, hours: l.hours, type: l.type })).sort((a, b) => a.date.localeCompare(b.date)),
        tasks_pending: (db.tasks ?? []).filter((t) => submittedClaims.some((c) => c.task_id === t.id)).map((t) => ({ id: t.id, title: t.title, subteam: t.subteam })),
        roster_pending: unapproved.map((p) => ({ id: p.id, name: p.full_name, email: emails[p.id] ?? null })).sort(byName),
      },
      study_pulse: {
        logged_7d: new Set((db.study_sessions ?? []).filter((s) => s.date >= laAddDays(now, -6)).map((s) => s.member_id)).size,
        streak_zero: roster.filter((p) => studyStreak(db, p.id, goal, now) === 0).map((p) => ({ member_id: p.id, name: p.full_name })).sort(byName),
      },
      squad_coverage: (db.positions ?? []).slice().sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)).map((p) => {
        const holders = (db.position_assignments ?? []).filter((a) => a.position_id === p.id).map((a) => nameOf(db, a.member_id)).filter(Boolean).sort()
        return { position_id: p.id, name: p.name, target_count: p.target_count, holder_count: holders.length, holders, vacant: holders.length === 0, under_target: holders.length < p.target_count }
      }),
    })
  },
}
