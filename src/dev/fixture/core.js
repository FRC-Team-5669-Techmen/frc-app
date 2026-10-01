// The core plugin: the same shape as a feature fixture (README, "The
// contract"), with no migration, holding the seed, RPCs, read filters and Edge
// Function stand-ins for everything that already exists in production.

import { coreSeed } from './seed.js'
import { CORE_RPCS } from './rpcs.js'
import { STAFF_ROLES } from './personas.js'

const roles = (db, id) => (db.member_roles ?? []).filter((r) => r.member_id === id).map((r) => r.role)
const staff = (db, user) => !!user && roles(db, user.id).some((r) => STAFF_ROLES.includes(r))
const admin = (db, user) => !!user && roles(db, user.id).includes('admin')
const own = (col) => ({ row, user }) => !!user && row[col] === user.id

// The SELECT policies from the frozen SQL that are narrower than `using (true)`,
// as row filters. A table not listed here is readable by every signed-in
// member, which is what its policy says. (Signed-out visitors read nothing:
// every policy here is `to authenticated`.)
export const CORE_VISIBLE = {
  access_requests: ({ db, user }) => staff(db, user),
  approved_emails: ({ db, user }) => staff(db, user),
  attendance_audit: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }),
  cert_requests: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }),
  discord_calendar_log: ({ db, user }) => staff(db, user),
  discord_calendar_posts: ({ db, user }) => staff(db, user),
  feedback: ({ db, user }) => admin(db, user),
  guardian_links: ({ row, db, user }) => staff(db, user) || own('parent_id')({ row, user }),
  hour_adjustments: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }),
  hour_goals: ({ row, db, user }) => row.member_id == null || staff(db, user) || own('member_id')({ row, user }),
  logged_hours: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }) ||
    (!!user && (db.guardian_links ?? []).some((g) => g.parent_id === user.id && g.student_id === row.member_id)),
  logged_hours_corrections: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }),
  member_applications: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }),
  notifications_sent: () => false,
  parent_link_requests: ({ row, db, user }) => staff(db, user) || own('parent_id')({ row, user }),
  parent_responses: ({ db, user }) => staff(db, user),
  push_subscriptions: own('member_id'),
  session_corrections: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }),
  study_sessions: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }),
  survey_answers: ({ row, db, user }) => staff(db, user) ||
    (!!user && (db.survey_responses ?? []).some((r) => r.id === row.response_id && r.member_id === user.id)),
  survey_responses: ({ row, db, user }) => staff(db, user) || own('member_id')({ row, user }),
}

// Edge Functions the client invokes. Each answers the way the deployed one
// does when its mail secrets are unset: the write happens, the email is
// skipped. ({ body, user, persona, db, now, engine }) -> { data, error, status }
export const CORE_FUNCTIONS = {
  'send-approval-email': () => ({ data: { ok: true, skipped: true }, error: null }),
  'send-parent-request': ({ body, db, user }) => {
    const app = (db.member_applications ?? []).find((a) => a.id === body?.application_id)
    if (!app) return { data: { error: 'not_found' }, error: null, status: 404 }
    if (app.member_id !== user?.id && !staff(db, user)) return { data: { error: 'forbidden' }, error: null, status: 403 }
    return { data: { ok: true, skipped: true }, error: null }
  },
  'invite-member': ({ body, db, user, engine }) => {
    if (!staff(db, user)) return { data: { error: 'Permission denied: staff role required' }, error: null }
    const email = String(body?.email ?? '').trim().toLowerCase()
    const role = body?.role ?? 'parent'
    if (!email.includes('@')) return { data: { error: 'A valid email is required' }, error: null }
    engine.deleteRows('approved_emails', (r) => r.email === email)
    engine.insertRow('approved_emails', { email, granted_role: role, added_by: user.id })
    const exists = (db.__users ?? []).some((u) => u.email === email)
    return { data: exists ? { alreadyRegistered: true, role } : { invited: true, role }, error: null }
  },
  // A capability URL fetched with plain fetch() (ParentResponse.jsx), not
  // functions.invoke -- client.js routes that fetch here.
  'parent-response': ({ body, db, engine, now }) => {
    const app = (db.member_applications ?? []).find((a) => a.parent_token && a.parent_token === body?.token)
    if (!app) return { data: { error: 'not_found' }, error: null, status: 404 }
    const existing = (db.parent_responses ?? []).find((r) => r.application_id === app.id) ?? null
    if (body?.action === 'fetch') {
      const p = (db.profiles ?? []).find((x) => x.id === app.member_id)
      return { data: { student_name: p?.nickname || p?.full_name || null, response: existing }, error: null }
    }
    if (body?.action === 'submit') {
      const pick = (v, list) => (v == null || v === '' ? null : list.includes(v) ? v : undefined)
      const row = {
        weekend_supervision: pick(body.weekend_supervision, ['saturdays', 'sundays', 'either', 'neither']),
        meal_support: pick(body.meal_support, ['yes', 'no', 'maybe']),
        travel_driving: pick(body.travel_driving, ['yes', 'no', 'maybe']),
        employer_name: body.employer_name ? String(body.employer_name).slice(0, 200) : null,
        employer_contact_consent: body.employer_contact_consent === true,
        donation_offer: body.donation_offer ? String(body.donation_offer).slice(0, 2000) : null,
      }
      for (const k of ['weekend_supervision', 'meal_support', 'travel_driving']) {
        if (row[k] === undefined) return { data: { error: `invalid_${k}` }, error: null, status: 400 }
      }
      if (existing) {
        engine.updateRows('parent_responses', (r) => r.id === existing.id, { ...row, updated_at: now.toISOString() })
        return { data: { ok: true, updated: true }, error: null }
      }
      engine.insertRow('parent_responses', { application_id: app.id, ...row })
      return { data: { ok: true, updated: false }, error: null }
    }
    return { data: { error: 'bad_request' }, error: null, status: 400 }
  },
}

export default {
  name: 'core',
  migration: null,
  seed: coreSeed,
  rpcs: CORE_RPCS,
  visible: CORE_VISIBLE,
  functions: CORE_FUNCTIONS,
}
