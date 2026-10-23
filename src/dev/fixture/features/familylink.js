// Fixture: family link recovery (supabase/migrations/0023_family_link_recovery.sql).
// Contract: src/dev/fixture/README.md. Imports only the hub fixture helpers,
// does nothing at import time. A test-only JavaScript PORT of
// staff_send_trip_link, trip_join_contact, family_hub_trips and
// family_hub_send_link over the tables eventhub.js seeds (0005) and the
// applications the core seed holds, so the pages can be driven in a browser.
// It is NOT the rule: production runs the SQL, proven by
// 0023_family_link_recovery_rls_test.sql on tools/sql-harness/.
import { hubFixture } from './eventhub.js'

const { T, one, nowMs, isStaff, studentName, progress, eventEnd, setV8 } = hubFixture
const iso = (ms) => new Date(ms).toISOString()
const refusal = (code, details, state = 'P0001') => ({ data: null, error: { code: state, message: `hub:${code}`, details, hint: null } })
const hour = (t) => new Date(t).toISOString().slice(0, 13).replace(/[-T]/g, '')
const firstDay = (db, ev) => T(db, 'hub_days').filter((d) => d.event_id === ev).map((d) => d.day_date).sort()[0] ?? null

function joinEvent(db, ev, t) {
  return T(db, 'hub_events')
    .filter((e) => (!ev || e.id === ev) && T(db, 'hub_days').some((d) => d.event_id === e.id) && t < eventEnd(db, e.id))
    .sort((a, b) => String(firstDay(db, a.id)).localeCompare(String(firstDay(db, b.id))))[0] ?? null
}

function sendTo(db, inv, to, prefix, t) {
  const i = one(db, 'hub_invites', (x) => x.id === inv)
  const e = one(db, 'hub_events', (x) => x.id === i.event_id)
  let queued = 0; let already = 0
  for (const addr of to) {
    const key = `${prefix}:${inv}:${addr}:${hour(t)}`
    if (T(db, 'hub_outbox').some((o) => o.dedupe_key === key)) { already += 1; continue }
    T(db, 'hub_outbox').push({
      id: `fx-link-${T(db, 'hub_outbox').length}`, event_id: e.id, kind: 'resend', to_emails: [addr],
      subject: `Your ${e.title} link for ${studentName(db, i.student_id).split(' ')[0]}`, body: '{{link}}',
      link_invite_id: inv, dedupe_key: key, status: 'pending', attempts: 0, created_at: iso(t),
    })
    queued += 1
  }
  return { queued, already }
}

const tokenStudent = (db, token) => T(db, 'member_applications')
  .filter((a) => a.parent_token === token)
  .sort((a, b) => String(b.submitted_at ?? '').localeCompare(String(a.submitted_at ?? '')))[0]?.member_id ?? null
const knownToken = (db, token) => !!token && T(db, 'member_applications').some((a) => a.parent_token === token)

export default {
  migration: '0023',
  creates: { rpcs: ['staff_send_trip_link', 'trip_join_contact', 'family_hub_trips', 'family_hub_send_link'] },
  rpcs: {
    staff_send_trip_link: ({ args, db, user, now, engine }) => {
      setV8(engine)
      const t = nowMs(now)
      if (!isStaff(db, user?.id)) return refusal('not_allowed', 'Staff only.', '42501')
      let inv = args?.p_invite ?? null
      const trip = String(args?.p_trip ?? '').trim().toLowerCase()
      if (!inv) {
        if (!args?.p_student) return refusal('invalid', 'Say which family: a student, or the family on the mentor page.')
        const hits = T(db, 'hub_invites').filter((x) => x.student_id === args.p_student && t < eventEnd(db, x.event_id)
          && (!trip || String(one(db, 'hub_events', (e) => e.id === x.event_id)?.title ?? '').toLowerCase().includes(trip)))
        if (!hits.length) return refusal('not_found', 'That student has no sign-up on a trip that is still coming up.')
        if (hits.length > 1) return refusal('ambiguous', 'That student is signed up for more than one trip. Say which.')
        inv = hits[0].id
      }
      const i = one(db, 'hub_invites', (x) => x.id === inv)
      if (!i) return refusal('family_gone', 'That family is no longer on this trip.')
      if (t >= eventEnd(db, i.event_id)) return refusal('event_over', 'This event is over.')
      const email = String(args?.p_email ?? '').trim().toLowerCase()
      if (email && !(i.emails ?? []).includes(email)) return refusal('not_on_family', 'That email is not on this family. Save it on the family first.')
      const to = email ? [email] : (i.emails ?? [])
      if (!to.length) return refusal('no_email', 'This family has no email yet. Add one first.')
      const r = sendTo(db, inv, to, 'staff_link', t)
      return { data: { ...r, ok: true, to, student: studentName(db, i.student_id), event: one(db, 'hub_events', (e) => e.id === i.event_id)?.title }, error: null }
    },
    trip_join_contact: ({ args, db, now, engine }) => {
      setV8(engine)
      const e = joinEvent(db, args?.p_event ?? null, nowMs(now))
      const c = String(e?.alert_emails?.[0] ?? '').trim().toLowerCase()
      return { data: c || null, error: null }
    },
    family_hub_trips: ({ args, db, now, engine }) => {
      setV8(engine)
      const t = nowMs(now)
      if (!knownToken(db, args?.p_token)) return { data: null, error: { code: 'P0002', message: 'This link is not valid', details: null, hint: null } }
      const sid = tokenStudent(db, args.p_token)
      const list = T(db, 'hub_invites').filter((i) => sid && i.student_id === sid && t < eventEnd(db, i.event_id)).map((i) => {
        const e = one(db, 'hub_events', (x) => x.id === i.event_id)
        const p = progress(db, i.id)
        return {
          event_id: e.id, title: e.title, starts_on: firstDay(db, e.id), signup_done: !!p.phase1_done,
          lockin_open: !!e.lockin_opens_at && t >= new Date(e.lockin_opens_at).getTime(), lockin_done: !!p.lockin_done,
          has_email: (i.emails ?? []).length > 0,
        }
      }).sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)) || a.title.localeCompare(b.title))
      return { data: list, error: null }
    },
    family_hub_send_link: ({ args, db, now, engine }) => {
      setV8(engine)
      const t = nowMs(now)
      if (!knownToken(db, args?.p_token)) return { data: null, error: { code: 'P0002', message: 'This link is not valid', details: null, hint: null } }
      const sid = tokenStudent(db, args.p_token)
      const i = one(db, 'hub_invites', (x) => x.event_id === args?.p_event && x.student_id === sid)
      if (!sid || !i) return refusal('not_found', 'There is no sign-up for that trip on this family link.')
      if (t >= eventEnd(db, i.event_id)) return refusal('event_over', 'This event is over.')
      if (!(i.emails ?? []).length) return refusal('no_email', 'There is no email on this sign-up yet. Ask a mentor to add yours.')
      const r = sendTo(db, i.id, i.emails, 'family_link', t)
      return { data: { ok: true, queued: r.queued, already: r.already, count: i.emails.length }, error: null }
    },
  },
}
