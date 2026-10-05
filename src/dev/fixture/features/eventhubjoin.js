// Fixture: the event hub's open link (supabase/migrations/0007_event_hub_open_link.sql).
// Contract: src/dev/fixture/README.md. Imports nothing, does nothing at import
// time. A test-only JavaScript PORT of hub_join_info / hub_join /
// hub_add_parent over the tables eventhub.js seeds (0005), so the /join page
// can be driven in a browser. It is NOT the rule: production runs the SQL,
// proven by 0007_event_hub_open_link_rls_test.sql on tools/sql-harness/.

const STAFF_ROLES = ['mentor', 'lead', 'admin']
const TZ = 'America/Los_Angeles'
const T = (db, n) => (Array.isArray(db[n]) ? db[n] : (db[n] = []))
const one = (db, n, pred) => T(db, n).find(pred) ?? null
const nowMs = (now) => (now instanceof Date ? now.getTime() : Number(now) || Date.now())
const iso = (ms) => new Date(ms).toISOString()
const roles = (db, id) => T(db, 'member_roles').filter((r) => r.member_id === id).map((r) => r.role)
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(String(s ?? '').trim())
const laDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms))
const refusal = (code, details, state = 'P0001') => ({ data: null, error: { code: state, message: `hub:${code}`, details, hint: null } })

function eventEnd(db, ev) {
  const t = T(db, 'hub_days').filter((d) => d.event_id === ev).map((d) => new Date(d.venue_closes_at).getTime())
  return t.length ? Math.max(...t) : -Infinity
}
function studentName(db, id) {
  const p = one(db, 'profiles', (x) => x.id === id)
  return (p?.full_name || '').trim() || (p?.nickname || '').trim() || 'A student'
}
function currentSeason(db, t) {
  const today = laDate(t)
  return T(db, 'seasons').filter((s) => s.start_date <= today && (!s.end_date || s.end_date >= today))
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0]?.id ?? null
}
function eligible(db, id, t) {
  const p = one(db, 'profiles', (x) => x.id === id)
  if (!p || p.approved === false || (p.status ?? 'active') !== 'active') return false
  const r = roles(db, id)
  if (!r.includes('student') || r.some((x) => STAFF_ROLES.includes(x))) return false
  const season = currentSeason(db, t)
  return T(db, 'member_applications').some((m) => m.member_id === id && m.season_id === season)
}
function joinEvent(db, ev, t) {
  return T(db, 'hub_events')
    .filter((e) => (!ev || e.id === ev) && T(db, 'hub_days').some((d) => d.event_id === e.id) && t < eventEnd(db, e.id))
    .map((e) => ({ e, first: T(db, 'hub_days').filter((d) => d.event_id === e.id).map((d) => d.day_date).sort()[0] }))
    .sort((a, b) => String(a.first).localeCompare(String(b.first)))[0]?.e ?? null
}
const taken = (db, inv) => !!inv && (
  T(db, 'hub_invite_tokens').some((x) => x.invite_id === inv)
  || T(db, 'hub_day_answers').some((a) => a.invite_id === inv)
  || T(db, 'hub_responses').some((r) => r.invite_id === inv && r.staff_updated_by))
const mask = (e) => `${e.split('@')[0].slice(0, 1)}•••@${e.split('@')[1]}`
function mint(db, inv, t) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let token = ''
  for (let i = 0; i < 22; i++) token += a[Math.floor(Math.random() * a.length)]
  T(db, 'hub_invite_tokens').push({ token, invite_id: inv, created_at: iso(t), revoked_at: null })
  return token
}
function enqueue(db, ev, kind, to, subject, link, dedupe, t) {
  if (!to?.length || T(db, 'hub_outbox').some((o) => o.dedupe_key === dedupe)) return
  T(db, 'hub_outbox').push({ id: `fx-${kind}-${T(db, 'hub_outbox').length}`, event_id: ev, kind, to_emails: to, subject, body: '{{link}}', link_invite_id: link, dedupe_key: dedupe, status: 'pending', attempts: 0, created_at: iso(t) })
}

export default {
  migration: '0007',
  creates: { rpcs: ['hub_join_info', 'hub_join', 'hub_add_parent'] },
  rpcs: {
    hub_join_info: ({ args, db, now }) => {
      const t = nowMs(now)
      const e = joinEvent(db, args?.p_event ?? null, t)
      if (!e) return refusal('not_open', 'This sign-up is closed or the link is not right. Ask the team for the current link.')
      const days = T(db, 'hub_days').filter((d) => d.event_id === e.id).map((d) => d.day_date).sort()
      return {
        data: {
          event: { id: e.id, title: e.title, venue_name: e.venue_name ?? null, timezone: e.timezone, first_day: days[0], last_day: days[days.length - 1], lockin_due_at: e.lockin_due_at ?? null },
          students: T(db, 'profiles').filter((p) => eligible(db, p.id, t)).map((p) => ({ id: p.id, name: studentName(db, p.id) }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        },
        error: null,
      }
    },
    hub_join: ({ args, db, now }) => {
      const t = nowMs(now)
      const e = joinEvent(db, args?.p_event ?? null, t)
      const email = String(args?.p_email ?? '').trim().toLowerCase()
      const name = String(args?.p_name ?? '').trim()
      if (!e) return refusal('not_open', 'This sign-up is closed or the link is not right. Ask the team for the current link.')
      if (args?.p_guardian !== true) return refusal('guardian', 'Only a parent or guardian can fill this out. Please tick the box to confirm.')
      if (!name || name.length > 120) return refusal('name', 'Please enter your name.')
      if (!isEmail(email)) return refusal('email', 'Please enter a working email address.')
      if (!args?.p_student || !eligible(db, args.p_student, t)) return refusal('student', "Pick your student from the list. Only students who filled out this season's team application are listed.")
      const student = studentName(db, args.p_student)
      let inv = one(db, 'hub_invites', (i) => i.event_id === e.id && i.student_id === args.p_student)
      if (inv && taken(db, inv.id)) {
        if (!inv.emails?.length) return { data: { status: 'ask_mentor', student }, error: null }
        const hour = new Date(t).toISOString().slice(0, 13)
        enqueue(db, e.id, 'join_request', inv.emails, `Your ${e.title} page`, inv.id, `join:${inv.id}:${email}:${hour}`, t)
        return { data: { status: 'emailed', student, to: inv.emails.map(mask) }, error: null }
      }
      if (!inv) {
        inv = { id: `fx-inv-${T(db, 'hub_invites').length}-${args.p_student.slice(-4)}`, event_id: e.id, student_id: args.p_student, emails: [], created_at: iso(t) }
        T(db, 'hub_invites').push(inv)
      }
      if (!inv.emails.includes(email)) inv.emails = [...inv.emails, email]
      const r = one(db, 'hub_responses', (x) => x.invite_id === inv.id)
      if (r) Object.assign(r, { parent_name: name, parent_email: email, parent_phone: null })
      else T(db, 'hub_responses').push({ invite_id: inv.id, parent_name: name, parent_email: email, parent_phone: null, allergens: [] })
      enqueue(db, e.id, 'welcome', [email], `Your ${e.title} page`, inv.id, `welcome:${inv.id}:${email}`, t)
      return { data: { status: 'in', token: mint(db, inv.id, t), student }, error: null }
    },
    hub_add_parent: ({ args, db, now }) => {
      const t = nowMs(now)
      const tok = one(db, 'hub_invite_tokens', (x) => x.token === args?.p_token && !x.revoked_at)
      if (!tok) return refusal('not_found', 'That link is not valid.', 'P0002')
      const inv = one(db, 'hub_invites', (i) => i.id === tok.invite_id)
      const email = String(args?.p_email ?? '').trim().toLowerCase()
      if (t >= eventEnd(db, inv.event_id)) return refusal('event_over', 'This event is over.')
      if (!isEmail(email)) return refusal('email', 'Please enter a working email address.')
      if (!inv.emails.includes(email)) {
        if (inv.emails.length >= 6) return refusal('too_many', 'This family already has six emails. Ask a mentor to change them.')
        inv.emails = [...inv.emails, email]
      }
      enqueue(db, inv.event_id, 'added', [email], 'Your family page', inv.id, `added:${inv.id}:${email}`, t)
      return { data: { ok: true, emails: inv.emails }, error: null }
    },
  },
}
