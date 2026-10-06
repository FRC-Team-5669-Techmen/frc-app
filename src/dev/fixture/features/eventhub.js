// Fixture: the event family hub (supabase/migrations/0005_event_family_hub.sql,
// seeded like 0006). Contract: src/dev/fixture/README.md. Imports nothing,
// does nothing at import time.
//
// WHAT THIS IS, SAID PLAINLY: a test-only JavaScript PORT of 0005's rule
// functions (_hub_progress, _hub_board*, _hub_save, _hub_claim, _hub_mark,
// _hub_pickup_accept, _hub_food_*, _hub_confirm_day, the staff dispatcher),
// so fixture mode can drive the family page, the boards and the mentor page
// in a browser with no database. It is NOT the rule: production runs the
// SQL, and the SQL is proven on a real PostgreSQL by
// 0005_event_family_hub_rls_test.sql (69 checks), its 30 mutants and the
// two-session seat race (tools/sql-harness/). Where this model and the SQL
// could disagree, the SQL wins; a browser test that passes here proves the
// PAGES render and send what they should, against a faithful model.
//
// Not modelled: token hashing (a fixture token is looked up as given), real
// row locks (one tab runs one call at a time; the race is the harness's), and
// email sending (outbox rows are written, never sent).
//
// The seed is relative to the fixture clock: an event on the first Friday to
// Sunday at least a week out, in Los Angeles, shaped like Beach Blitz, plus one event that
// ended three days ago (read-only). Families, by fixture persona and token:
//   Sam (student)     FxSamLink...   nothing answered yet: the form, autosave
//   Riley (student2)  FxRileyLink... done; rides in Casey's Saturday car, and
//                                    in Casey's Friday car, which has LEFT
//   Casey (exempt)    FxCaseyLink... drives Saturday (own student aboard),
//                                    takes pickups, shares phone; peanut allergy
//   Jordan, Avery     ...            done; both need a Saturday seat (the race)
//   Taylor            FxTaylorLink.. drives Saturday, no pickups, no phone consent
//   Morgan            FxMorganLink.. asked for a Saturday pickup (open)
//   Quinn, Jamie      ...            ride Coach Max's Sunday car (a mentor car)
//   Rowan             FxRowanLink... done; Saturday needs a seat
// and a mentor car on Saturday with nobody in it ("takes two or more").

const TZ = 'America/Los_Angeles'
const H = 3600 * 1000
const MIN = 60 * 1000

export const EH = Object.freeze({
  event: 'e0b00000-0000-4000-8000-000000000001',
  pastEvent: 'e0b00000-0000-4000-8000-000000000002',
  fri: 'e0b00000-0000-4000-8000-000000000011',
  sat: 'e0b00000-0000-4000-8000-000000000012',
  sun: 'e0b00000-0000-4000-8000-000000000013',
  pastDay: 'e0b00000-0000-4000-8000-000000000019',
  carCaseyFri: 'e0b00000-0000-4000-8000-000000000101',
  carCaseySatTo: 'e0b00000-0000-4000-8000-000000000102',
  carCaseySatHome: 'e0b00000-0000-4000-8000-000000000103',
  carTaylorSatTo: 'e0b00000-0000-4000-8000-000000000104',
  carMentorSat: 'e0b00000-0000-4000-8000-000000000105',
  carMentorSun: 'e0b00000-0000-4000-8000-000000000106',
  mealStarted: 'e0b00000-0000-4000-8000-000000000201',
  mealSatLunch: 'e0b00000-0000-4000-8000-000000000202',
  needMain: 'e0b00000-0000-4000-8000-000000000301',
  tokens: Object.freeze({
    sam: 'FxSamLink0000000000001',
    riley: 'FxRileyLink00000000002',
    jordan: 'FxJordanLink0000000003',
    avery: 'FxAveryLink00000000004',
    casey: 'FxCaseyLink00000000005',
    taylor: 'FxTaylorLink0000000006',
    morgan: 'FxMorganLink0000000007',
    quinn: 'FxQuinnLink00000000008',
    jamie: 'FxJamieLink00000000009',
    rowan: 'FxRowanLink00000000010',
    past: 'FxPastLink000000000011',
  }),
})

const STUDENT = {
  sam: '00000000-0000-0000-0000-0000000000c1',
  riley: '00000000-0000-0000-0000-0000000000c2',
  casey: '00000000-0000-0000-0000-0000000000c3',
  jordan: '00000000-0000-0000-0000-0000000000c4',
  taylor: '00000000-0000-0000-0000-0000000000c5',
  morgan: '00000000-0000-0000-0000-0000000000c6',
  avery: '00000000-0000-0000-0000-0000000000c7',
  quinn: '00000000-0000-0000-0000-0000000000c8',
  jamie: '00000000-0000-0000-0000-0000000000c9',
  rowan: '00000000-0000-0000-0000-0000000000ca',
}
const INVITE = Object.fromEntries(Object.keys(STUDENT).map((k, i) => [k, `e0b00000-0000-4000-8000-0000000004${String(i).padStart(2, '0')}`]))
const PAST_INVITE = 'e0b00000-0000-4000-8000-000000000499'
const ALLERGENS = ['peanut', 'tree_nut', 'milk', 'egg', 'wheat', 'soy', 'fish', 'shellfish', 'sesame']
const TABLES = ['hub_events', 'hub_days', 'hub_meals', 'hub_food_needs', 'hub_invites', 'hub_invite_tokens', 'hub_responses',
  'hub_day_answers', 'hub_cars', 'hub_seats', 'hub_pickups', 'hub_food_claims', 'hub_outbox', 'hub_resend_log']
const STAFF_ROLES = ['mentor', 'lead', 'admin']
// Is 0008 (supabase/migrations/0008_event_hub_families.sql) on? Set at the
// start of every handler from the engine, so this port answers as 0005 alone
// or as 0005 plus 0008, whichever the fixture is set to.
let V8 = false
let V9 = false
let V10 = false
let V11 = false
const setV8 = (engine) => { V8 = !!engine?.applied?.('0008'); V9 = !!engine?.applied?.('0009'); V10 = !!engine?.applied?.('0010'); V11 = !!engine?.applied?.('0011') }
// 0009: two families in one event sharing an email are brothers and sisters.
function siblings(db, a, b) {
  if (!a || !b || a === b) return false
  const x = one(db, 'hub_invites', (i) => i.id === a)
  const y = one(db, 'hub_invites', (i) => i.id === b)
  return !!x && !!y && x.event_id === y.event_id && (x.emails ?? []).some((e) => (y.emails ?? []).includes(e))
}

// ── time ────────────────────────────────────────────────────────────────────
const fmtParts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function laParts(ms) { const o = {}; for (const { type, value } of fmtParts.formatToParts(new Date(ms))) o[type] = value; return o }
const laDateOf = (ms) => { const p = laParts(ms); return `${p.year}-${p.month}-${p.day}` }
function laInstant(ymd, hh = 0, mm = 0) {
  const [y, m, d] = ymd.split('-').map(Number)
  const want = Date.UTC(y, m - 1, d, hh, mm)
  let t = want
  for (let i = 0; i < 2; i += 1) { const p = laParts(t); t += want - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) }
  return t
}
function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10) }
const iso = (ms) => new Date(ms).toISOString()
const ms = (x) => (x == null ? null : new Date(x).getTime())
const dayLabel = (ymd, style) => new Intl.DateTimeFormat('en-US', style === 'short' ? { weekday: 'short', timeZone: 'UTC' } : { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`))
const fmtTime = (x) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(x))
const fmtDay = (x) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(x))

let seq = 0
const newId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  seq += 1
  return `e0b0ffff-0000-4000-8000-${String(seq).padStart(12, '0')}`
}

// ── store access ────────────────────────────────────────────────────────────
const T = (db, n) => (Array.isArray(db[n]) ? db[n] : (db[n] = []))
const one = (db, n, pred) => T(db, n).find(pred) ?? null

class Refusal extends Error {
  constructor(code, message, state = 'P0001') { super(message); this.code = code; this.state = state }
}
const refuse = (code, message) => { throw new Refusal(code, message) }

function nowMs(now) { return now instanceof Date ? now.getTime() : Number(now) || Date.now() }
const roles = (db, id) => T(db, 'member_roles').filter((r) => r.member_id === id).map((r) => r.role)
const isStaff = (db, id) => !!id && roles(db, id).some((r) => STAFF_ROLES.includes(r))

// ── the model of 0005 ───────────────────────────────────────────────────────
function eventEnd(db, ev) {
  const t = T(db, 'hub_days').filter((d) => d.event_id === ev).map((d) => ms(d.venue_closes_at))
  return t.length ? Math.max(...t) : Infinity
}
// 0010: the application legal name first (this season, else the latest),
// the profile only when there is no application, never anything shaped like
// an email. Before 0010: the profile full name, then the nickname.
const cleanName = (s) => {
  const v = String(s ?? '').replace(/\s+/g, ' ').trim()
  return !v || v.includes('@') || /^[a-z0-9._-]+\.[0-9]{2,4}$/i.test(v) ? null : v
}
function studentName(db, id) {
  const p = one(db, 'profiles', (x) => x.id === id)
  if (!V10) return (p?.full_name || '').trim() || (p?.nickname || '').trim() || 'A student'
  const season = currentSeason(db, Date.now())
  const apps = T(db, 'member_applications').filter((m) => m.member_id === id)
    .sort((a, b) => (b.season_id === season) - (a.season_id === season) || String(b.submitted_at).localeCompare(String(a.submitted_at)))
  if (apps.length) return cleanName(`${apps[0].legal_first_name ?? ''} ${apps[0].legal_last_name ?? ''}`) || 'A student'
  return cleanName(p?.full_name) || cleanName(p?.nickname) || 'A student'
}
// The hub roster. 0010 (_hub_roster_student): approved, active, a student,
// neither mentor nor admin, with an application for the current season.
// Before 0010 every copy excluded lead too, and only the open link (0007)
// required the application.
function currentSeason(db, t) {
  const today = laDateOf(t)
  return T(db, 'seasons').filter((s) => s.start_date <= today && (!s.end_date || s.end_date >= today))
    .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))[0]?.id ?? null
}
function rosterStudent(db, id, t, { needApp = true } = {}) {
  const p = one(db, 'profiles', (x) => x.id === id)
  if (!p || p.approved === false || (p.status ?? 'active') !== 'active') return false
  const r = roles(db, id)
  if (!r.includes('student') || r.some((x) => (V10 ? ['mentor', 'admin'] : STAFF_ROLES).includes(x))) return false
  if (!V10 && !needApp) return true
  const season = currentSeason(db, t)
  return T(db, 'member_applications').some((m) => m.member_id === id && m.season_id === season)
}
const inviteName = (db, inv) => studentName(db, one(db, 'hub_invites', (i) => i.id === inv)?.student_id)
const lastWord = (s) => String(s ?? '').trim().split(/\s+/).pop()
function familySurname(db, inv) {
  const r = one(db, 'hub_responses', (x) => x.invite_id === inv)
  if (!V10) return lastWord(r?.parent_name) || lastWord(inviteName(db, inv)) || 'Team'
  const student = inviteName(db, inv)
  return lastWord(cleanName(r?.parent_name)) || (student === 'A student' ? '' : lastWord(student)) || 'Team'
}
function driverName(db, car) {
  const c = one(db, 'hub_cars', (x) => x.id === car)
  if (c?.driver_label?.trim()) return c.driver_label.trim()
  const r = one(db, 'hub_responses', (x) => x.invite_id === c?.driver_invite_id)
  if (r?.parent_name?.trim()) return r.parent_name.trim()
  return `${inviteName(db, c?.driver_invite_id).split(' ')[0]}'s family`
}
const answer = (db, inv, day) => one(db, 'hub_day_answers', (a) => a.invite_id === inv && a.day_id === day)
const response = (db, inv) => one(db, 'hub_responses', (r) => r.invite_id === inv)
function planRow(db, inv, d) {
  const a = answer(db, inv, d.id) ?? {}
  const nights = response(db, inv)?.staying_nights ?? null
  const nb = (nights ?? []).includes(addDays(d.day_date, -1))
  const na = (nights ?? []).includes(d.day_date)
  return {
    invite_id: inv, day_id: d.id, day_date: d.day_date, attending: a.attending ?? null, adults: a.adults ?? null,
    eff_to: a.to_mode ?? (nb ? 'self' : 'carpool'), eff_home: a.home_mode ?? (na ? 'self' : 'carpool'),
    nearby_before: nb, nearby_after: na, school_mode: a.school_mode ?? null,
  }
}
function plan(db, ev) {
  const days = T(db, 'hub_days').filter((d) => d.event_id === ev)
  return T(db, 'hub_invites').filter((i) => i.event_id === ev).flatMap((i) => days.map((d) => ({ ...planRow(db, i.id, d), student_id: i.student_id })))
}
function ownAboard(db, carId) {
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  const a = c && answer(db, c.driver_invite_id, c.day_id)
  if (!!a && a.attending === 'yes' && (c.run === 'to' ? a.to_mode : a.home_mode) === 'driving') return true
  return V9 && !!c && T(db, 'hub_seats').some((x) => x.car_id === carId && siblings(db, c.driver_invite_id, x.invite_id))
}
const seatsIn = (db, carId) => T(db, 'hub_seats').filter((s) => s.car_id === carId)
function carProblem(db, carId) {
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  const e = one(db, 'hub_events', (x) => x.id === c?.event_id)
  if (!c || !e?.one_minor_rule || c.minor_override_reason || ownAboard(db, carId)) return null
  const s = seatsIn(db, carId)
  if (s.length === 1) return 'needs_second_rider'
  if (s.filter((x) => x.via_pickup).length === 1) return 'single_pickup'
  return null
}
function carPending(db, carId) {
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  const e = one(db, 'hub_events', (x) => x.id === c?.event_id)
  return !!e?.driver_paperwork_required && !!c?.driver_invite_id && !response(db, c.driver_invite_id)?.driver_paperwork_at
}
const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(String(s ?? '').trim())
const isPhone = (s) => String(s ?? '').replace(/\D/g, '').length >= 10

function progress(db, inv) {
  const i = one(db, 'hub_invites', (x) => x.id === inv)
  const e = one(db, 'hub_events', (x) => x.id === i.event_id)
  const r = response(db, inv) ?? {}
  const missing = []
  const steps = { days: true, getting: true, food: true, contacts: true }
  const miss = (step, key, day_id) => { steps[step] = false; missing.push(day_id ? { step, key, day_id } : { step, key }) }
  let unsure = 0; let unconfirmed = 0; let coming = 0
  if (r.staying_nights == null) miss('days', 'staying')
  for (const d of T(db, 'hub_days').filter((x) => x.event_id === e.id).sort((x, y) => x.day_date.localeCompare(y.day_date))) {
    const a = answer(db, inv, d.id) ?? {}
    const p = planRow(db, inv, d)
    if (a.attending == null) miss('days', 'attending', d.id)
    else if (a.attending === 'unsure') unsure += 1
    // 0008: a parent may drive students without their own student aboard,
    // whatever the student's answer, and the car questions apply then too.
    const drives = V8 && (a.drive_to === true || a.drive_home === true)
    const carChecks = () => {
      if (a.offer_seats == null || !String(a.offer_description ?? '').trim() || !a.offer_leave_by || a.offer_takes_pickups == null) miss('getting', 'car', d.id)
      if (!r.driver_25 || !r.driver_licensed) miss('getting', 'driver_checks', d.id)
    }
    if (a.attending !== 'yes') { if (drives) carChecks(); continue }
    coming += 1
    if (!a.confirmed_at) unconfirmed += 1
    if (a.adults == null) miss('days', 'adults', d.id)
    if (d.ask_pit_setup && a.pit_setup == null) miss('days', 'pit_setup', d.id)
    // 0008: each run's mode is an answer; the carpool default is not one.
    if (V8 && a.to_mode == null && !p.nearby_before) miss('getting', 'ride_to', d.id)
    if (V8 && a.home_mode == null && !p.nearby_after) miss('getting', 'ride_home', d.id)
    if (d.ask_school_ride && !p.nearby_before && (V8 ? a.to_mode === 'carpool' : p.eff_to === 'carpool')) {
      if (a.school_mode == null) miss('getting', 'school_mode', d.id)
      else if (a.school_mode === 'pickup' && !one(db, 'hub_pickups', (k) => k.invite_id === inv && k.day_id === d.id && k.spot)) miss('getting', 'pickup', d.id)
    }
    if ([p.eff_to, p.eff_home].includes('driving') || drives) carChecks()
  }
  if (!(r.allergies_none || (r.allergens ?? []).length || String(r.allergy_other ?? '').trim())) miss('food', 'allergies')
  if (r.medication == null) miss('food', 'medication')
  if (!String(r.parent_name ?? '').trim()) miss('contacts', 'parent_name')
  if (!isPhone(r.parent_phone)) miss('contacts', 'parent_phone')
  if (!isEmail(r.parent_email)) miss('contacts', 'parent_email')
  if (!String(r.emergency_name ?? '').trim()) miss('contacts', 'emergency_name')
  if (!isPhone(r.emergency_phone)) miss('contacts', 'emergency_phone')
  if (r.first_reg_done == null) miss('contacts', 'first_reg')
  if (String(e.links?.school_form ?? '').trim() && r.school_form_done == null) miss('contacts', 'school_form')
  const p1 = steps.days && steps.getting && steps.food && steps.contacts
  return { phase1_done: p1, lockin_done: p1 && unsure === 0 && unconfirmed === 0, steps, missing, unsure_days: unsure, unconfirmed_days: unconfirmed, coming_days: coming }
}

function mentorEmails(db, ev) {
  const e = one(db, 'hub_events', (x) => x.id === ev)
  if ((e?.alert_emails ?? []).length) return e.alert_emails
  const admins = T(db, 'member_roles').filter((r) => r.role === 'admin').map((r) => r.member_id)
  return T(db, '__users').filter((u) => admins.includes(u.id)).map((u) => String(u.email).toLowerCase())
}
function enqueue(db, ev, kind, to, subject, body, link = null, dedupe = null) {
  if (!to?.length) return
  if (dedupe && T(db, 'hub_outbox').some((o) => o.dedupe_key === dedupe)) return
  T(db, 'hub_outbox').push({ id: newId(), event_id: ev, kind, to_emails: to, subject, body, link_invite_id: link, dedupe_key: dedupe, status: 'pending', attempts: 0, created_at: iso(Date.now()) })
}
const inviteEmails = (db, inv) => one(db, 'hub_invites', (i) => i.id === inv)?.emails ?? []

function dropSeat(db, carId, rider, cause, why, now) {
  const seat = one(db, 'hub_seats', (s) => s.car_id === carId && s.invite_id === rider)
  if (!seat) return
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  const e = one(db, 'hub_events', (x) => x.id === c.event_id)
  if (cause === 'driver' || cause === 'staff') {
    enqueue(db, e.id, 'seat_dropped', inviteEmails(db, rider), `${e.title}: a seat was dropped`, `${inviteName(db, rider)} no longer has a seat. ${why ?? ''}\n{{link}}`, rider)
    enqueue(db, e.id, 'seat_dropped_staff', mentorEmails(db, e.id), `${e.title}: seat dropped`, `${inviteName(db, rider)} lost a seat.`)
  }
  db.hub_seats = T(db, 'hub_seats').filter((s) => s !== seat)
  if (seat.via_pickup && seat.run === 'to') {
    for (const p of T(db, 'hub_pickups')) if (p.invite_id === rider && p.day_id === seat.day_id && p.car_id === carId) { p.car_id = null; p.accepted_at = null }
  }
  Object.assign(c, { minor_override_reason: null, minor_override_by: null, minor_override_at: null, updated_at: iso(now) })
  if ((cause === 'rider' || cause === 'switch') && e.lockin_opens_at && now >= ms(e.lockin_opens_at)) {
    if (c.driver_invite_id) enqueue(db, e.id, 'rider_left', inviteEmails(db, c.driver_invite_id), `${e.title}: a rider left`, `${inviteName(db, rider)} no longer rides with you.`)
    enqueue(db, e.id, 'rider_left_staff', mentorEmails(db, e.id), `${e.title}: rider left`, `${inviteName(db, rider)} left ${driverName(db, carId)}'s car.`)
  }
  if (carProblem(db, carId)) enqueue(db, e.id, 'car_red', mentorEmails(db, e.id), `${e.title}: ${driverName(db, carId)}'s car needs a second rider`, 'One student who is not the driver\'s own.')
}

function claim(db, carId, rider, staff, override, viaPickup, now) {
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  if (!c) refuse('car_gone', 'That car is no longer listed. Pick another.')
  const e = one(db, 'hub_events', (x) => x.id === c.event_id)
  if (one(db, 'hub_invites', (i) => i.id === rider)?.event_id !== c.event_id) refuse('bad_car', 'That car is not part of this event.')
  if (!staff && now >= eventEnd(db, e.id)) refuse('event_over', 'This event is over. Everything is read-only now.')
  if (c.left_at) refuse('car_left', 'That car already left.')
  if (c.driver_invite_id === rider) refuse('own_car', 'Your student rides in your own car.')
  const a = answer(db, rider, c.day_id)
  if (a?.attending !== 'yes') refuse('not_coming', 'Mark this day as Coming first.')
  if ((c.run === 'to' ? a.to_mode : a.home_mode) === 'driving') refuse('you_drive', 'You are driving this run. Change your plan for this run first.')
  if (carPending(db, carId)) refuse('pending', 'This car is waiting on driver paperwork. Pick another.')
  const riders = seatsIn(db, carId)
  const pickups = riders.filter((s) => s.via_pickup).length
  const mine = riders.find((s) => s.invite_id === rider)
  const overridden = !!staff && !!String(override ?? '').trim()
  const sib = V9 && siblings(db, c.driver_invite_id, rider)
  if (mine) {
    if (viaPickup && !mine.via_pickup) {
      if (e.one_minor_rule && !sib && !ownAboard(db, carId) && pickups + 1 === 1 && !overridden) refuse('one_minor', 'The home pickup leg would carry one student alone with an adult who is not their parent. Ask a mentor.')
      mine.via_pickup = true
      Object.assign(c, { minor_override_reason: overridden ? override.trim() : null, updated_at: iso(now) })
    }
    return 'unchanged'
  }
  if (riders.length >= c.seats) refuse('car_full', 'That car just filled. Pick another.')
  let setOverride = false
  if (e.one_minor_rule && !sib && !ownAboard(db, carId) && (riders.length + 1 === 1 || (viaPickup && pickups + 1 === 1))) {
    if (overridden) setOverride = true
    else refuse('one_minor', riders.length + 1 === 1
      ? 'This car would carry one student alone with an adult who is not their parent. Pick a car with another rider, or ask a mentor.'
      : 'The home pickup leg would carry one student alone with an adult who is not their parent. Ask a mentor.')
  }
  const old = one(db, 'hub_seats', (s) => s.day_id === c.day_id && s.run === c.run && s.invite_id === rider)
  if (old) {
    if (one(db, 'hub_cars', (x) => x.id === old.car_id)?.left_at) refuse('car_left', 'Your student\'s current car already left.')
    dropSeat(db, old.car_id, rider, staff ? 'staff_move' : 'switch', null, now)
  }
  T(db, 'hub_seats').push({ car_id: c.id, day_id: c.day_id, run: c.run, invite_id: rider, via_pickup: !!viaPickup, placed_by: staff, override_reason: setOverride ? override : null, created_at: iso(now) })
  Object.assign(c, { minor_override_reason: setOverride ? override.trim() : null, minor_override_by: setOverride ? staff : null, minor_override_at: setOverride ? iso(now) : null, updated_at: iso(now) })
  if (c.run === 'to') a.to_mode = 'carpool'; else a.home_mode = 'carpool'
  return 'placed'
}

function claimWithHome(db, carId, rider, staff, override, viaPickup, homePickup, now) {
  const first = claim(db, carId, rider, staff, override, viaPickup, now)
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  let home = 'none'; let msg = null
  const d = one(db, 'hub_days', (x) => x.id === c.day_id)
  if (c.run === 'to' && c.driver_invite_id && planRow(db, rider, d).eff_home === 'carpool'
      && !one(db, 'hub_seats', (s) => s.day_id === c.day_id && s.run === 'home' && s.invite_id === rider)) {
    const hc = one(db, 'hub_cars', (x) => x.day_id === c.day_id && x.run === 'home' && x.driver_invite_id === c.driver_invite_id)
    if (hc) {
      const snap = snapshot(db)
      try { home = claim(db, hc.id, rider, staff, null, homePickup, now) } catch (err) {
        if (!(err instanceof Refusal)) throw err
        restore(db, snap); home = 'not_placed'; msg = err.message
      }
    }
  }
  return { result: first, home, home_message: msg }
}

function unclaim(db, carId, rider, staff, now) {
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  if (!c) return
  if (!staff && now >= eventEnd(db, c.event_id)) refuse('event_over', 'This event is over. Everything is read-only now.')
  if (c.left_at) refuse('car_left', 'That car already left. Ask a mentor.')
  dropSeat(db, carId, rider, staff ? 'staff' : 'rider', null, now)
}

function syncCars(db, inv, dayId, now) {
  const a = answer(db, inv, dayId) ?? {}
  const r = response(db, inv) ?? {}
  const d = one(db, 'hub_days', (x) => x.id === dayId)
  for (const run of ['to', 'home']) {
    const mode = run === 'to' ? a.to_mode : a.home_mode
    const flag = V8 && (run === 'to' ? a.drive_to : a.drive_home) === true
    const want = ((a.attending === 'yes' && mode === 'driving') || flag) && a.offer_seats != null && String(a.offer_description ?? '').trim()
      && a.offer_leave_by && a.offer_takes_pickups != null && r.driver_25 && r.driver_licensed
    const c = one(db, 'hub_cars', (x) => x.day_id === dayId && x.run === run && x.driver_invite_id === inv)
    if (want) {
      if (!c) T(db, 'hub_cars').push({ id: newId(), event_id: d.event_id, day_id: dayId, run, driver_invite_id: inv, driver_label: null, seats: a.offer_seats, description: String(a.offer_description).trim(), leave_by: a.offer_leave_by, takes_pickups: a.offer_takes_pickups, left_at: null, arrived_at: null, minor_override_reason: null, created_at: iso(now), updated_at: iso(now) })
      else if (!c.left_at) {
        const n = seatsIn(db, c.id).length
        if (a.offer_seats < n) refuse('seats_below_riders', `${n} students ride with you ${run === 'to' ? 'to the venue' : 'home'}. Ask a mentor to move one before lowering seats.`)
        Object.assign(c, { seats: a.offer_seats, description: String(a.offer_description).trim(), leave_by: a.offer_leave_by, takes_pickups: a.offer_takes_pickups, updated_at: iso(now) })
      }
    } else if (c) {
      if (c.left_at) refuse('car_left', 'That car already left. Ask a mentor.')
      for (const s of seatsIn(db, c.id)) dropSeat(db, c.id, s.invite_id, 'driver', null, now)
      for (const p of T(db, 'hub_pickups')) if (p.car_id === c.id) { p.car_id = null; p.accepted_at = null }
      db.hub_cars = T(db, 'hub_cars').filter((x) => x !== c)
    }
  }
}

function withdrawPickup(db, inv, dayId, now) {
  const pk = one(db, 'hub_pickups', (p) => p.invite_id === inv && p.day_id === dayId)
  if (!pk) return
  if (pk.car_id && one(db, 'hub_cars', (x) => x.id === pk.car_id)?.left_at) refuse('car_left', 'That car already left.')
  for (const s of T(db, 'hub_seats').filter((x) => x.invite_id === inv && x.day_id === dayId && x.via_pickup)) {
    s.via_pickup = false
    const c = one(db, 'hub_cars', (x) => x.id === s.car_id)
    Object.assign(c, { minor_override_reason: null, updated_at: iso(now) })
  }
  db.hub_pickups = T(db, 'hub_pickups').filter((p) => p !== pk)
}

const DAY_FIELDS = ['attending', 'adults', 'pit_setup', 'home_option', 'school_mode', 'pickup', 'to_mode', 'home_mode', 'car_seats', 'car_description', 'car_leave_by', 'car_takes_pickups']
const jtext = (v) => (v == null ? null : String(v).trim() || null)
function jbool(v) { if (v == null) return null; if (typeof v !== 'boolean') refuse('invalid', 'That answer is not a yes or no.'); return v }
function jlen(v, max) { if (v != null && v.length > max) refuse('too_long', `Please keep that under ${max} characters.`); return v }

function save(db, inv, staff, field, value, dayId, now) {
  const i = one(db, 'hub_invites', (x) => x.id === inv)
  if (!i) refuse('not_found', 'That link is not valid.')
  if (!staff && now >= eventEnd(db, i.event_id)) refuse('event_over', 'This event is over. Everything is read-only now.')
  let r = response(db, inv)
  if (!r) { r = { invite_id: inv, allergens: [], updated_at: iso(now) }; T(db, 'hub_responses').push(r) }
  const done = () => { r.updated_at = iso(now); if (staff) r.staff_updated_by = staff }
  switch (field) {
    case 'staying_nights': {
      if (value == null) { r.staying_nights = null; break }
      if (!Array.isArray(value)) refuse('invalid', 'That is not a list of nights.')
      const dates = T(db, 'hub_days').filter((d) => d.event_id === i.event_id).map((d) => d.day_date).sort()
      const nights = [...new Set(value.map(String))].sort()
      if (nights.some((n) => !dates.includes(n) || n >= dates[dates.length - 1])) refuse('invalid', 'That night is not part of this event.')
      r.staying_nights = nights; break
    }
    case 'allergies_none': { const b = jbool(value); r.allergies_none = b; if (b) { r.allergens = []; r.allergy_other = null } break }
    case 'allergens': {
      const list = [...new Set(value ?? [])].sort()
      if (list.some((x) => !ALLERGENS.includes(x))) refuse('invalid', 'That allergen is not on the list. Use Other.')
      r.allergens = list; if (list.length) r.allergies_none = false; break
    }
    case 'allergy_other': { const t = jlen(jtext(value), 300); r.allergy_other = t; if (t) r.allergies_none = false; break }
    case 'dietary': r.dietary = jlen(jtext(value), 300); break
    case 'medication': r.medication = jbool(value); break
    case 'parent_name': r.parent_name = jlen(jtext(value), 120); break
    case 'parent_phone': r.parent_phone = jlen(jtext(value), 40); break
    case 'parent_email': r.parent_email = jlen(jtext(value)?.toLowerCase() ?? null, 200); break
    case 'emergency_name': r.emergency_name = jlen(jtext(value), 120); break
    case 'emergency_phone': r.emergency_phone = jlen(jtext(value), 40); break
    case 'first_reg_done': r.first_reg_done = jbool(value); break
    case 'school_form_done': r.school_form_done = jbool(value); break
    case 'driver_phone_consent': r.driver_phone_consent_at = jbool(value) ? (r.driver_phone_consent_at ?? iso(now)) : null; break
    case 'rider_phone_consent': r.rider_phone_consent_at = jbool(value) ? (r.rider_phone_consent_at ?? iso(now)) : null; break
    case 'driver_25': case 'driver_licensed':
      r[field] = jbool(value)
      for (const d of T(db, 'hub_days').filter((x) => x.event_id === i.event_id)) syncCars(db, inv, d.id, now)
      break
    default: {
      if (!DAY_FIELDS.includes(field) && !(V8 && ['drive_to', 'drive_home'].includes(field))) refuse('unknown_field', 'That answer is not part of this form.')
      const d = one(db, 'hub_days', (x) => x.id === dayId && x.event_id === i.event_id)
      if (!d) refuse('bad_day', 'That day is not part of this event.')
      if (!staff && now >= ms(d.venue_closes_at)) refuse('day_over', 'That day is over. Its answers are read-only now.')
      let a = answer(db, inv, dayId)
      if (!a) { a = { invite_id: inv, day_id: dayId }; T(db, 'hub_day_answers').push(a) }
      saveDay(db, inv, staff, field, value, d, a, r, now)
      a.updated_at = iso(now)
    }
  }
  done()
}

function saveDay(db, inv, staff, field, value, d, a, r, now) {
  const leftIn = (pred) => T(db, 'hub_seats').some((s) => pred(s) && one(db, 'hub_cars', (c) => c.id === s.car_id)?.left_at)
  switch (field) {
    case 'attending': {
      const v = jtext(value)
      if (v != null && !['yes', 'no', 'unsure'].includes(v)) refuse('invalid', 'Choose Coming, Not coming or Not sure yet.')
      if (v !== 'yes') {
        if (leftIn((s) => s.invite_id === inv && s.day_id === d.id) || T(db, 'hub_cars').some((c) => c.driver_invite_id === inv && c.day_id === d.id && c.left_at)) refuse('car_left', 'A car for this day already left. Ask a mentor.')
        for (const s of T(db, 'hub_seats').filter((x) => x.invite_id === inv && x.day_id === d.id)) dropSeat(db, s.car_id, inv, 'rider', null, now)
        withdrawPickup(db, inv, d.id, now)
      }
      a.confirmed_at = v === 'yes' && a.attending === 'yes' ? a.confirmed_at : null
      a.attending = v
      syncCars(db, inv, d.id, now)
      return
    }
    case 'adults':
      if (V8) { if (value != null && !(Number.isInteger(value) && value >= 0 && value <= 30)) refuse('invalid', 'Choose 0 to 30 adults.') }
      else if (value != null && ![0, 1, 2, 3, 4].includes(value)) refuse('invalid', 'Choose 0 to 4 adults.')
      a.adults = value; return
    case 'drive_to': case 'drive_home': {
      const run = field === 'drive_to' ? 'to' : 'home'
      if (T(db, 'hub_cars').some((c) => c.driver_invite_id === inv && c.day_id === d.id && c.run === run && c.left_at)) refuse('car_left', 'That car already left.')
      a[field] = jbool(value)
      syncCars(db, inv, d.id, now)
      return
    }
    case 'pit_setup': a.pit_setup = jbool(value); return
    case 'home_option': {
      const v = jtext(value)
      if (v != null && !(d.home_options ?? []).some((o) => o.key === v)) refuse('invalid', 'That ride-home choice is not offered.')
      a.home_option = v; return
    }
    case 'school_mode': {
      const v = jtext(value)
      if (v != null && !['self', 'pickup'].includes(v)) refuse('invalid', 'Choose how your student gets to Bosco Tech.')
      if (v !== 'pickup') withdrawPickup(db, inv, d.id, now)
      a.school_mode = v; return
    }
    case 'pickup': {
      if (!value || typeof value !== 'object') refuse('invalid', 'That pickup request is incomplete.')
      const spot = jlen(jtext(value.spot), 160)
      const consent = jbool(value.consent ?? false)
      if (!spot || !consent) { withdrawPickup(db, inv, d.id, now); return }
      let pk = one(db, 'hub_pickups', (p) => p.invite_id === inv && p.day_id === d.id)
      if (pk?.car_id && one(db, 'hub_cars', (c) => c.id === pk.car_id)?.left_at) refuse('car_left', 'That car already left.')
      const covers = value.covers_home == null ? true : jbool(value.covers_home)
      if (!pk) { pk = { id: newId(), invite_id: inv, day_id: d.id, car_id: null, accepted_at: null, created_at: iso(now) }; T(db, 'hub_pickups').push(pk) }
      Object.assign(pk, { spot, consent_at: pk.consent_at ?? iso(now), covers_home: covers, updated_at: iso(now) })
      a.school_mode = 'pickup'
      if (!covers) for (const s of T(db, 'hub_seats').filter((x) => x.invite_id === inv && x.day_id === d.id && x.run === 'home' && x.via_pickup)) s.via_pickup = false
      return
    }
    case 'to_mode': case 'home_mode': {
      const v = jtext(value)
      if (v != null && !['carpool', 'driving', 'self'].includes(v)) refuse('invalid', 'Choose how your student travels.')
      const run = field === 'to_mode' ? 'to' : 'home'
      if (leftIn((s) => s.invite_id === inv && s.day_id === d.id && s.run === run) || T(db, 'hub_cars').some((c) => c.driver_invite_id === inv && c.day_id === d.id && c.run === run && c.left_at)) refuse('car_left', 'That car already left.')
      if ((v ?? 'carpool') !== 'carpool') for (const s of T(db, 'hub_seats').filter((x) => x.invite_id === inv && x.day_id === d.id && x.run === run)) dropSeat(db, s.car_id, inv, 'rider', null, now)
      if (field === 'to_mode') {
        const homeWasNull = a.home_mode == null
        a.to_mode = v
        if (v === 'driving' && homeWasNull && !(r.staying_nights ?? []).includes(d.day_date)) {
          a.home_mode = 'driving'
          for (const s of T(db, 'hub_seats').filter((x) => x.invite_id === inv && x.day_id === d.id && x.run === 'home')) dropSeat(db, s.car_id, inv, 'rider', null, now)
        }
      } else a.home_mode = v
      syncCars(db, inv, d.id, now)
      return
    }
    default: {
      const blank = value == null || (field === 'car_description' && !jtext(value))
      if (blank && T(db, 'hub_cars').some((c) => c.driver_invite_id === inv && c.day_id === d.id)) refuse('car_required', V8 ? 'Keep this filled in while you are driving. To stop driving, change your answer to "Will a parent drive?"' : 'Keep this filled in while you are driving. To stop driving, change how your student gets to the venue.')
      if (field === 'car_seats') { if (value != null && ![1, 2, 3, 4, 5, 6, 7].includes(value)) refuse('invalid', 'Choose 1 to 7 seats.'); a.offer_seats = value }
      if (field === 'car_description') a.offer_description = jlen(jtext(value), 80)
      if (field === 'car_leave_by') { if (value != null && Number.isNaN(Date.parse(value))) refuse('invalid', 'That is not a time.'); a.offer_leave_by = value }
      if (field === 'car_takes_pickups') a.offer_takes_pickups = jbool(value)
      syncCars(db, inv, d.id, now)
    }
  }
}

function mark(db, carId, what, actorInv, staff, override, now) {
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  if (!c) refuse('car_gone', 'That car is no longer listed.')
  const e = one(db, 'hub_events', (x) => x.id === c.event_id)
  if (!staff) {
    if (c.driver_invite_id !== actorInv) refuse('not_your_car', 'Only the driver can mark this car.')
    if (now >= eventEnd(db, e.id) + 12 * H) refuse('event_over', 'This event is over. Everything is read-only now.')
  }
  if (what === 'left') {
    if (c.left_at) return
    if (carProblem(db, carId)) {
      if (staff && String(override ?? '').trim()) Object.assign(c, { minor_override_reason: override.trim(), minor_override_by: staff, minor_override_at: iso(now) })
      else refuse('needs_second_rider', 'This car has one student who is not the driver\'s own. It cannot leave until a second rider joins or a mentor records an override.')
    }
    c.left_at = iso(now)
    for (const s of seatsIn(db, carId)) enqueue(db, e.id, 'car_left', inviteEmails(db, s.invite_id), `${e.title}: car left`, `Left at ${fmtTime(now)} with ${inviteName(db, s.invite_id)}.`, null, `left:${carId}:${s.invite_id}`)
  } else if (what === 'arrived') {
    if (!c.left_at) refuse('not_left', 'Mark "Leaving now" first.')
    if (c.arrived_at) return
    c.arrived_at = iso(now)
    for (const s of seatsIn(db, carId)) enqueue(db, e.id, 'car_arrived', inviteEmails(db, s.invite_id), `${e.title}: car arrived`, `Arrived at ${fmtTime(now)}.`, null, `arrived:${carId}:${s.invite_id}`)
  } else refuse('invalid', 'Mark the car as left or arrived.')
}

function pickupAccept(db, pkId, carId, actorInv, staff, override, now) {
  const pk = one(db, 'hub_pickups', (p) => p.id === pkId)
  if (!pk?.spot) refuse('pickup_gone', 'That request was withdrawn.')
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  if (!c || c.run !== 'to' || c.day_id !== pk.day_id) refuse('bad_car', 'Pick your car to the venue on that day.')
  if (!staff) {
    if (now >= eventEnd(db, c.event_id)) refuse('event_over', 'This event is over. Everything is read-only now.')
    if (c.driver_invite_id !== actorInv) refuse('not_your_car', 'Only the driver can accept for this car.')
    if (!c.takes_pickups) refuse('no_pickups', 'Your car offer does not take home pickups.')
  }
  if (pk.car_id && pk.car_id !== carId) refuse('pickup_taken', 'Another driver already accepted this pickup.')
  if (pk.car_id === carId) return { result: 'unchanged', home: 'none' }
  const v = claimWithHome(db, carId, pk.invite_id, staff, override, true, pk.covers_home, now)
  Object.assign(pk, { car_id: carId, accepted_at: iso(now), updated_at: iso(now) })
  return v
}

function foodClaim(db, mealId, needId, inv, staff, label, what, serves, allergen, now) {
  const m = one(db, 'hub_meals', (x) => x.id === mealId)
  if (!m) refuse('meal_gone', 'That meal is not part of this event.')
  if (inv && one(db, 'hub_invites', (i) => i.id === inv)?.event_id !== m.event_id) refuse('meal_gone', 'That meal is not part of this event.')
  if (!staff && now >= ms(m.starts_at)) refuse('meal_started', 'That meal has started. Food for it is closed.')
  if (needId && !one(db, 'hub_food_needs', (n) => n.id === needId && n.meal_id === mealId)) refuse('need_gone', 'That item is no longer on the list.')
  if (!String(what ?? '').trim()) refuse('invalid', 'Say what you will bring.')
  jlen(String(what).trim(), 120)
  if (!(serves >= 1 && serves <= 500)) refuse('invalid', 'Say about how many it serves.')
  if (!['yes', 'no', 'unsure'].includes(allergen)) refuse('invalid', 'Say whether it contains a listed allergen.')
  if (needId && T(db, 'hub_food_claims').some((f) => f.need_id === needId)) refuse('need_taken', 'Someone just claimed that. Pick another, or add something else.')
  const row = { id: newId(), meal_id: mealId, need_id: needId ?? null, invite_id: inv ?? null, staff_label: inv ? null : (String(label ?? '').trim() || 'Mentors'), what: String(what).trim(), serves, allergen, created_at: iso(now), updated_at: iso(now) }
  T(db, 'hub_food_claims').push(row)
  return row.id
}

function foodChange(db, claimId, inv, staff, drop, what, serves, allergen, now) {
  const fc = one(db, 'hub_food_claims', (f) => f.id === claimId)
  if (!fc) return
  const m = one(db, 'hub_meals', (x) => x.id === fc.meal_id)
  if (!staff) {
    if (fc.invite_id !== inv) refuse('not_yours', 'Only the family that claimed this can change it.')
    if (now >= ms(m.starts_at)) refuse('meal_started', 'That meal has started. Food for it is closed.')
  }
  if (drop) {
    db.hub_food_claims = T(db, 'hub_food_claims').filter((f) => f !== fc)
    if (fc.need_id) enqueue(db, m.event_id, 'food_dropped', mentorEmails(db, m.event_id), 'Food dropped', `${fc.what} is open again.`)
    return
  }
  if (!String(what ?? '').trim()) refuse('invalid', 'Say what you will bring.')
  if (!(serves >= 1 && serves <= 500)) refuse('invalid', 'Say about how many it serves.')
  if (!['yes', 'no', 'unsure'].includes(allergen)) refuse('invalid', 'Say whether it contains a listed allergen.')
  Object.assign(fc, { what: String(what).trim(), serves, allergen, updated_at: iso(now) })
}

function confirmDay(db, inv, dayId, staff, now) {
  const i = one(db, 'hub_invites', (x) => x.id === inv)
  const e = one(db, 'hub_events', (x) => x.id === i.event_id)
  const d = one(db, 'hub_days', (x) => x.id === dayId && x.event_id === e.id)
  if (!d) refuse('bad_day', 'That day is not part of this event.')
  if (!staff) {
    if (e.lockin_opens_at && now < ms(e.lockin_opens_at)) refuse('lockin_not_open', `Lock-in opens ${fmtDay(e.lockin_opens_at)}.`)
    if (now >= ms(d.venue_closes_at)) refuse('day_over', 'That day is over. Its answers are read-only now.')
  }
  const a = answer(db, inv, dayId)
  if (a?.attending !== 'yes') refuse('confirm_needs_yes', 'Choose Coming or Not coming for this day first.')
  a.confirmed_at = iso(now)
}

// ── the boards ──────────────────────────────────────────────────────────────
function boardCar(db, carId, viewer, inv, now) {
  const c = one(db, 'hub_cars', (x) => x.id === carId)
  const e = one(db, 'hub_events', (x) => x.id === c.event_id)
  const dr = response(db, c.driver_invite_id) ?? {}
  const staff = viewer === 'staff'
  const mine = viewer === 'family' && !!c.driver_invite_id && c.driver_invite_id === inv
  const seated = viewer === 'family' && seatsIn(db, carId).some((s) => s.invite_id === inv)
  const riders = seatsIn(db, carId).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  const n = riders.length
  const own = ownAboard(db, carId)
  const status = carPending(db, carId) ? 'pending' : c.arrived_at ? 'arrived' : c.left_at ? 'left' : n >= c.seats ? 'full' : 'filling'
  return {
    id: c.id, run: c.run, driver: driverName(db, carId), staff_car: !c.driver_invite_id, description: c.description, seats: c.seats,
    riders_count: n,
    riders: riders.map((s) => {
      const pk = one(db, 'hub_pickups', (p) => p.invite_id === s.invite_id && p.day_id === s.day_id)
      const rr = response(db, s.invite_id) ?? {}
      return {
        name: inviteName(db, s.invite_id), mine: viewer === 'family' && s.invite_id === inv,
        invite_id: staff ? s.invite_id : null,
        pickup: staff || mine || (viewer === 'family' && s.invite_id === inv) ? s.via_pickup : null,
        spot: (staff || mine) && s.via_pickup ? pk?.spot ?? null : null,
        parent_phone: (staff || mine) && rr.rider_phone_consent_at ? rr.parent_phone ?? null : null,
        override_reason: staff ? s.override_reason ?? null : null,
      }
    }),
    leave_by: c.leave_by, takes_pickups: c.takes_pickups, status, left_at: c.left_at, arrived_at: c.arrived_at,
    problem: carProblem(db, carId), override_reason: staff ? c.minor_override_reason ?? null : null,
    own_aboard: own, needs_two: !!e.one_minor_rule && !own && n === 0 && !c.minor_override_reason,
    mine, my_seat: seated,
    driver_phone: dr.driver_phone_consent_at && (seated || mine || staff) ? dr.parent_phone ?? null : null,
    phone_note: c.driver_invite_id && !dr.driver_phone_consent_at && (seated || staff) ? 'contact_mentors' : null,
  }
}

function boardRun(db, d, run, viewer, inv, now) {
  const staff = viewer === 'staff'
  const rows = plan(db, d.event_id).filter((p) => p.day_id === d.id)
  const eff = (p) => (run === 'to' ? p.eff_to : p.eff_home)
  const near = (p) => (run === 'to' ? p.nearby_before : p.nearby_after)
  const need = rows.filter((p) => p.attending === 'yes' && eff(p) === 'carpool'
    && !T(db, 'hub_seats').some((s) => s.day_id === d.id && s.run === run && s.invite_id === p.invite_id))
  const cars = T(db, 'hub_cars').filter((c) => c.day_id === d.id && c.run === run).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id))
  const open = cars.filter((c) => !c.left_at && !carPending(db, c.id)).reduce((s, c) => s + Math.max(c.seats - seatsIn(db, c.id).length, 0), 0)
  const pickupDriver = viewer === 'family' && run === 'to' && cars.some((c) => c.driver_invite_id === inv && c.takes_pickups && !c.left_at)
  const pickups = run === 'to' && (staff || pickupDriver)
    ? T(db, 'hub_pickups').filter((p) => p.day_id === d.id && !p.car_id && p.spot && answer(db, p.invite_id, d.id)?.attending === 'yes')
      .map((p) => ({ id: p.id, name: inviteName(db, p.invite_id), spot: p.spot, covers_home: p.covers_home }))
    : null
  const byName = (a, b) => a.name.localeCompare(b.name)
  return {
    run, needs_seat: need.length, open_seats: open, covered: open >= need.length,
    unplaced: need.map((p) => ({ name: studentName(db, p.student_id), invite_id: staff ? p.invite_id : null, mine: viewer === 'family' && p.invite_id === inv })).sort(byName),
    nearby: rows.filter((p) => p.attending === 'yes' && near(p)).map((p) => studentName(db, p.student_id)).sort(),
    self_count: rows.filter((p) => p.attending === 'yes' && eff(p) === 'self' && !near(p)).length,
    driving_count: rows.filter((p) => p.attending === 'yes' && eff(p) === 'driving').length,
    unsure_count: rows.filter((p) => p.attending === 'unsure').length,
    cars: cars.map((c) => boardCar(db, c.id, viewer, inv, now)),
    pickups,
  }
}

function boardMeal(db, m, viewer, inv, now) {
  const staff = viewer === 'staff'
  const who = plan(db, m.event_id).filter((p) => p.day_id === m.day_id && p.attending === 'yes')
  const tally = {}
  let other = 0
  for (const p of who) {
    const r = response(db, p.invite_id) ?? {}
    for (const a of r.allergens ?? []) tally[a] = (tally[a] ?? 0) + 1
    if (String(r.allergy_other ?? '').trim()) other += 1
  }
  const counts = Object.entries(tally).map(([allergen, count]) => ({ allergen, count }))
  if (other) counts.push({ allergen: 'other', count: other })
  counts.sort((a, b) => b.count - a.count || a.allergen.localeCompare(b.allergen))
  const fam = (fc) => (fc.invite_id ? `the ${familySurname(db, fc.invite_id)} family` : fc.staff_label)
  return {
    id: m.id, day_id: m.day_id, label: m.label, starts_at: m.starts_at, started: now >= ms(m.starts_at), truck_note: m.truck_note ?? null,
    allergy_counts: counts,
    allergy_names: staff ? who.map((p) => ({ p, r: response(db, p.invite_id) ?? {} }))
      .filter(({ r }) => (r.allergens ?? []).length || String(r.allergy_other ?? '').trim() || String(r.dietary ?? '').trim())
      .map(({ p, r }) => ({ name: studentName(db, p.student_id), allergens: r.allergens ?? [], other: r.allergy_other ?? null, dietary: r.dietary ?? null })) : null,
    needs: T(db, 'hub_food_needs').filter((n) => n.meal_id === m.id).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((n) => {
      const fc = one(db, 'hub_food_claims', (f) => f.need_id === n.id)
      return { id: n.id, label: n.label, quantity: n.quantity, starter: staff ? !!n.starter : null,
        claim: fc ? { id: fc.id, what: fc.what, serves: fc.serves, allergen: fc.allergen, family: fam(fc), mine: viewer === 'family' && fc.invite_id === inv } : null }
    }),
    extras: T(db, 'hub_food_claims').filter((f) => f.meal_id === m.id && !f.need_id).map((fc) => ({ id: fc.id, what: fc.what, serves: fc.serves, allergen: fc.allergen, family: fam(fc), mine: viewer === 'family' && fc.invite_id === inv })),
  }
}

function board(db, ev, viewer, inv, now) {
  const e = one(db, 'hub_events', (x) => x.id === ev)
  const days = T(db, 'hub_days').filter((d) => d.event_id === ev).sort((a, b) => a.day_date.localeCompare(b.day_date))
  return {
    event_id: ev, viewer, now: iso(now), one_minor_rule: !!e.one_minor_rule,
    days: days.map((d) => {
      const rows = plan(db, ev).filter((p) => p.day_id === d.id)
      return {
        id: d.id, date: d.day_date, position: d.position ?? 0, label: dayLabel(d.day_date), short: dayLabel(d.day_date, 'short'),
        title: d.title ?? '', intro: d.intro ?? null, meet_at: d.meet_at ?? null, meet_place: d.meet_place ?? null,
        last_car_out_at: d.last_car_out_at ?? null, captain: d.captain_id ? studentName(db, d.captain_id) : null,
        captain_id: viewer === 'staff' ? d.captain_id ?? null : null, target_arrival_at: d.target_arrival_at ?? null,
        doors_at: d.doors_at ?? null, venue_opens_at: d.venue_opens_at ?? null, venue_closes_at: d.venue_closes_at,
        pits_close_at: d.pits_close_at ?? null, drive_to_range: d.drive_to_range ?? null, drive_home_range: d.drive_home_range ?? null,
        miles_to: d.miles_to ?? null, miles_home: d.miles_home ?? null, ask_pit_setup: !!d.ask_pit_setup,
        ask_school_ride: d.ask_school_ride !== false, home_options: d.home_options ?? [], notes: d.notes ?? null,
        over: now >= ms(d.venue_closes_at),
        headcount: { students: rows.filter((p) => p.attending === 'yes').length,
          adults: rows.filter((p) => p.attending === 'yes').reduce((s, p) => s + (p.adults ?? 0), 0),
          unsure: rows.filter((p) => p.attending === 'unsure').length,
          firm: !!e.lockin_due_at && now >= ms(e.lockin_due_at) },
        runs: [boardRun(db, d, 'to', viewer, inv, now), boardRun(db, d, 'home', viewer, inv, now)],
      }
    }),
    meals: T(db, 'hub_meals').filter((m) => m.event_id === ev).sort((a, b) => ms(a.starts_at) - ms(b.starts_at) || (a.position ?? 0) - (b.position ?? 0)).map((m) => boardMeal(db, m, viewer, inv, now)),
  }
}

function eventJson(db, ev, now) {
  const e = one(db, 'hub_events', (x) => x.id === ev)
  const days = T(db, 'hub_days').filter((d) => d.event_id === ev).map((d) => d.day_date).sort()
  const end = eventEnd(db, ev)
  return {
    id: e.id, title: e.title, venue_name: e.venue_name ?? null, venue_address: e.venue_address ?? null, map_url: e.map_url ?? null,
    timezone: e.timezone ?? TZ, phase1_due_at: e.phase1_due_at ?? null, lockin_opens_at: e.lockin_opens_at ?? null,
    lockin_due_at: e.lockin_due_at ?? null, starts_on: days[0] ?? null, ends_at: Number.isFinite(end) ? iso(end) : null,
    over: now >= end, lockin_open: !!e.lockin_opens_at && now >= ms(e.lockin_opens_at),
    one_minor_rule: !!e.one_minor_rule, driver_paperwork_required: !!e.driver_paperwork_required, links: e.links ?? {}, info: e.info ?? {},
    // 0011 (features/eventhubservicehours.js): the parent service hours note.
    ...(V11 ? { parent_service_hours_note: String(e.parent_service_hours_note ?? '').trim() || null } : {}),
  }
}

function familyView(db, inv, viewer, now) {
  const i = one(db, 'hub_invites', (x) => x.id === inv)
  const r = response(db, inv) ?? {}
  const name = studentName(db, i.student_id)
  const days = {}
  for (const d of T(db, 'hub_days').filter((x) => x.event_id === i.event_id)) {
    const a = answer(db, inv, d.id) ?? {}
    const p = planRow(db, inv, d)
    const pk = one(db, 'hub_pickups', (x) => x.invite_id === inv && x.day_id === d.id)
    days[d.id] = {
      attending: a.attending ?? null, adults: a.adults ?? null, pit_setup: a.pit_setup ?? null, home_option: a.home_option ?? null,
      school_mode: a.school_mode ?? null, to_mode: a.to_mode ?? null, home_mode: a.home_mode ?? null,
      eff_to: p.eff_to, eff_home: p.eff_home, nearby_before: p.nearby_before, nearby_after: p.nearby_after,
      car_seats: a.offer_seats ?? null, car_description: a.offer_description ?? null, car_leave_by: a.offer_leave_by ?? null,
      car_takes_pickups: a.offer_takes_pickups ?? null, confirmed: !!a.confirmed_at,
      ...(V8 ? { drive_to: a.drive_to ?? null, drive_home: a.drive_home ?? null } : {}),
      pickup: pk ? { spot: pk.spot, covers_home: pk.covers_home, accepted: !!pk.car_id, driver: pk.car_id ? driverName(db, pk.car_id) : null } : null,
    }
  }
  return {
    invite_id: inv, viewer, now: iso(now), student: { name, first: name.split(' ')[0] },
    event: eventJson(db, i.event_id, now), progress: progress(db, inv),
    answers: {
      response: {
        staying_nights: r.staying_nights ?? null, allergies_none: r.allergies_none ?? null, allergens: r.allergens ?? [],
        allergy_other: r.allergy_other ?? null, dietary: r.dietary ?? null, medication: r.medication ?? null,
        parent_name: r.parent_name ?? null, parent_phone: r.parent_phone ?? null, parent_email: r.parent_email ?? null,
        emergency_name: r.emergency_name ?? null, emergency_phone: r.emergency_phone ?? null,
        first_reg_done: r.first_reg_done ?? null, school_form_done: r.school_form_done ?? null,
        driver_phone_consent: !!r.driver_phone_consent_at, rider_phone_consent: !!r.rider_phone_consent_at,
        driver_25: r.driver_25 ?? null, driver_licensed: r.driver_licensed ?? null, driver_paperwork_on_file: !!r.driver_paperwork_at,
      },
      days,
      food: T(db, 'hub_food_claims').filter((f) => f.invite_id === inv).map((f) => ({ id: f.id, meal_id: f.meal_id, need_id: f.need_id, what: f.what, serves: f.serves, allergen: f.allergen })),
    },
    board: board(db, i.event_id, viewer, viewer === 'family' ? inv : null, now),
  }
}

const inviteStatus = (db, inv) => one(db, 'hub_outbox', (o) => o.dedupe_key === `invite:${inv}`)?.status ?? 'none'

function overview(db, ev, now) {
  const e = one(db, 'hub_events', (x) => x.id === ev)
  if (!e) refuse('event_gone', 'That event does not exist.')
  const invites = T(db, 'hub_invites').filter((i) => i.event_id === ev)
  const days = T(db, 'hub_days').filter((d) => d.event_id === ev).sort((a, b) => a.day_date.localeCompare(b.day_date))
  const rows = plan(db, ev)
  const roster = T(db, 'profiles').filter((p) => rosterStudent(db, p.id, nowMs(now), { needApp: false }))
  const familyRows = invites.map((i) => {
    const pr = progress(db, i.id); const r = response(db, i.id) ?? {}
    return { invite_id: i.id, student_id: i.student_id, name: studentName(db, i.student_id), emails: i.emails ?? [],
      invite_status: inviteStatus(db, i.id), phase1_done: pr.phase1_done, lockin_done: pr.lockin_done, missing: pr.missing.length,
      first_reg_done: r.first_reg_done ?? null, school_form_done: r.school_form_done ?? null }
  }).sort((a, b) => a.name.localeCompare(b.name))
  const out = T(db, 'hub_outbox').filter((o) => o.event_id === ev)
  return {
    event: eventJson(db, ev, now), alert_emails: e.alert_emails ?? [],
    roster: roster.length, roster_without_invite: roster.filter((p) => !invites.some((i) => i.student_id === p.id)).length,
    families: familyRows,
    attendance: days.map((d) => {
      const r = rows.filter((p) => p.day_id === d.id)
      return { day_id: d.id, label: dayLabel(d.day_date), yes: r.filter((p) => p.attending === 'yes').length, no: r.filter((p) => p.attending === 'no').length,
        unsure: r.filter((p) => p.attending === 'unsure').length, none: r.filter((p) => p.attending == null).length }
    }),
    carpool: days.map((d) => ({ day_id: d.id, label: dayLabel(d.day_date), runs: ['to', 'home'].map((run) => {
      const b = boardRun(db, d, run, 'staff', null, now)
      return { run, needs_seat: b.needs_seat, open_seats: b.open_seats, unplaced: b.unplaced, open_pickups: (b.pickups ?? []).length,
        pending: b.cars.filter((c) => c.status === 'pending').map((c) => ({ car_id: c.id, driver: c.driver })),
        red: b.cars.filter((c) => c.problem).map((c) => ({ car_id: c.id, driver: c.driver, problem: c.problem })) }
    }).reverse() })),
    food: T(db, 'hub_meals').filter((m) => m.event_id === ev).sort((a, b) => ms(a.starts_at) - ms(b.starts_at)).map((m) => {
      const needs = T(db, 'hub_food_needs').filter((n) => n.meal_id === m.id)
      return { meal_id: m.id, label: m.label, starts_at: m.starts_at, open: needs.filter((n) => !T(db, 'hub_food_claims').some((f) => f.need_id === n.id)).map((n) => n.label), starter: needs.filter((n) => n.starter).length }
    }),
    drivers: invites.filter((i) => T(db, 'hub_day_answers').some((a) => a.invite_id === i.id && (a.to_mode === 'driving' || a.home_mode === 'driving'))).map((i) => {
      const r = response(db, i.id) ?? {}
      return { invite_id: i.id, driver: (r.parent_name ?? '').trim() || `${studentName(db, i.student_id)}'s family`, student: studentName(db, i.student_id), on_file: !!r.driver_paperwork_at, checks: !!(r.driver_25 && r.driver_licensed) }
    }),
    school_form_on: !!String(e.links?.school_form ?? '').trim(),
    outbox: { pending: out.filter((o) => ['pending', 'sending'].includes(o.status)).length, failed: out.filter((o) => o.status === 'failed').length, sent: out.filter((o) => o.status === 'sent').length },
  }
}

function exportRows(db, ev) {
  return T(db, 'hub_invites').filter((i) => i.event_id === ev).map((i) => {
    const r = response(db, i.id) ?? {}; const pr = progress(db, i.id)
    const days = T(db, 'hub_days').filter((d) => d.event_id === ev).sort((a, b) => a.day_date.localeCompare(b.day_date))
    return {
      student: studentName(db, i.student_id), emails: (i.emails ?? []).join('; '), invite: inviteStatus(db, i.id),
      phase1_done: String(pr.phase1_done), lockin_done: String(pr.lockin_done), parent_name: r.parent_name ?? null,
      parent_phone: r.parent_phone ?? null, parent_email: r.parent_email ?? null, emergency_name: r.emergency_name ?? null,
      emergency_phone: r.emergency_phone ?? null, staying_nights: (r.staying_nights ?? []).join('; '),
      allergies_none: r.allergies_none ?? null, allergens: (r.allergens ?? []).join('; '), allergy_other: r.allergy_other ?? null,
      dietary: r.dietary ?? null, medication: r.medication ?? null, first_reg_done: r.first_reg_done ?? null,
      school_form_done: r.school_form_done ?? null, driver_25: r.driver_25 ?? null, driver_licensed: r.driver_licensed ?? null,
      driver_paperwork_on_file: !!r.driver_paperwork_at, driver_phone_consent: !!r.driver_phone_consent_at, rider_phone_consent: !!r.rider_phone_consent_at,
      days: days.map((d) => {
        const p = planRow(db, i.id, d); const a = answer(db, i.id, d.id) ?? {}
        const seat = (run) => { const s = one(db, 'hub_seats', (x) => x.invite_id === i.id && x.day_id === d.id && x.run === run); return s ? driverName(db, s.car_id) : null }
        return { day: dayLabel(d.day_date, 'short'), attending: p.attending, adults: p.adults, confirmed: !!a.confirmed_at, pit_setup: a.pit_setup ?? null,
          home_option: a.home_option ?? null, to: p.eff_to, home: p.eff_home, school: p.school_mode,
          pickup_spot: one(db, 'hub_pickups', (x) => x.invite_id === i.id && x.day_id === d.id)?.spot ?? null, to_car: seat('to'), home_car: seat('home'),
          // 0011: the date, and drove = this family listed a car that day.
          ...(V11 ? { date: d.day_date, drove: T(db, 'hub_cars').some((c) => c.driver_invite_id === i.id && c.day_id === d.id) } : {}) }
      }),
      food: T(db, 'hub_food_claims').filter((f) => f.invite_id === i.id).map((f) => `${one(db, 'hub_meals', (m) => m.id === f.meal_id)?.label}: ${f.what} (serves ${f.serves})`).join('; ') || null,
    }
  }).sort((a, b) => a.student.localeCompare(b.student))
}

// ── transactions ────────────────────────────────────────────────────────────
function snapshot(db) { return JSON.stringify(Object.fromEntries(TABLES.map((t) => [t, T(db, t)]))) }
function restore(db, snap) { const s = JSON.parse(snap); for (const t of TABLES) db[t] = s[t] }
function txn(db, fn) {
  const snap = snapshot(db)
  try { return fn() } catch (e) { restore(db, snap); throw e }
}

const tokenInvite = (db, token) => (typeof token === 'string' && /^[A-Za-z0-9_-]{22}$/.test(token)
  ? one(db, 'hub_invite_tokens', (t) => t.token === token && !t.revoked_at)?.invite_id ?? null : null)

function familyCall(db, token, action, args, now) {
  const inv = tokenInvite(db, token)
  if (!inv) throw new Refusal('not_found', 'That link is not valid.', 'P0002')
  const a = args ?? {}
  let v = null
  switch (action) {
    case 'fetch': return familyView(db, inv, 'family', now)
    case 'save':
      save(db, inv, null, a.field, a.value, a.day_id ?? null, now)
      return { ok: true, saved_at: iso(now), progress: progress(db, inv) }
    case 'claim_seat': v = claimWithHome(db, a.car_id, inv, null, null, false, false, now); break
    case 'unclaim_seat': unclaim(db, a.car_id, inv, null, now); break
    case 'mark': mark(db, a.car_id, a.what, inv, null, null, now); break
    case 'pickup_accept': v = pickupAccept(db, a.pickup_id, a.car_id, inv, null, null, now); break
    case 'food_claim': foodClaim(db, a.meal_id, a.need_id ?? null, inv, null, null, a.what, Number(a.serves), a.allergen, now); break
    case 'food_edit': foodChange(db, a.claim_id, inv, null, false, a.what, Number(a.serves), a.allergen, now); break
    case 'food_drop': foodChange(db, a.claim_id, inv, null, true, null, null, null, now); break
    case 'confirm_day': confirmDay(db, inv, a.day_id, null, now); break
    default: refuse('unknown_action', 'That action is not part of this page.')
  }
  return { ...familyView(db, inv, 'family', now), result: v }
}

function staffCall(db, user, action, args, now) {
  const a = args ?? {}
  const staff = user.id
  let v = null
  switch (action) {
    case 'overview': return overview(db, a.event_id, now)
    case 'board': return { event: eventJson(db, a.event_id, now), board: board(db, a.event_id, 'staff', null, now) }
    case 'family': return { ...familyView(db, a.invite_id, 'staff', now), emails: one(db, 'hub_invites', (i) => i.id === a.invite_id)?.emails ?? [], invite_status: inviteStatus(db, a.invite_id) }
    case 'save':
      save(db, a.invite_id, staff, a.field, a.value, a.day_id ?? null, now)
      return { ok: true, saved_at: iso(now), progress: progress(db, a.invite_id) }
    case 'move':
      if (!a.car_id) {
        for (const s of T(db, 'hub_seats').filter((x) => x.invite_id === a.invite_id && x.day_id === a.day_id && x.run === a.run)) unclaim(db, s.car_id, a.invite_id, staff, now)
        v = { result: 'unseated' }
      } else v = { result: claim(db, a.car_id, a.invite_id, staff, a.override_reason, false, now) }
      break
    case 'mark': mark(db, a.car_id, a.what, null, staff, a.override_reason, now); break
    case 'undo_mark': { const c = one(db, 'hub_cars', (x) => x.id === a.car_id); if (c) Object.assign(c, { left_at: null, arrived_at: null }); break }
    case 'override': {
      if (!String(a.override_reason ?? '').trim()) refuse('invalid', 'An override needs a reason.')
      const c = one(db, 'hub_cars', (x) => x.id === a.car_id); if (c) Object.assign(c, { minor_override_reason: a.override_reason.trim(), minor_override_by: staff, minor_override_at: iso(now) })
      break
    }
    case 'pickup_accept': v = pickupAccept(db, a.pickup_id, a.car_id, null, staff, a.override_reason, now); break
    case 'paperwork': {
      let r = response(db, a.invite_id)
      if (!r) { r = { invite_id: a.invite_id, allergens: [] }; T(db, 'hub_responses').push(r) }
      r.driver_paperwork_at = a.on ? iso(now) : null; r.driver_paperwork_by = a.on ? staff : null
      break
    }
    case 'confirm_day': confirmDay(db, a.invite_id, a.day_id, staff, now); break
    case 'food_claim': foodClaim(db, a.meal_id, a.need_id ?? null, a.invite_id ?? null, staff, a.staff_label, a.what, Number(a.serves), a.allergen, now); break
    case 'food_edit': foodChange(db, a.claim_id, null, staff, false, a.what, Number(a.serves), a.allergen, now); break
    case 'food_drop': foodChange(db, a.claim_id, null, staff, true, null, null, null, now); break
    case 'sync_invites': {
      let created = 0
      for (const p of T(db, 'profiles').filter((x) => rosterStudent(db, x.id, now, { needApp: false }))) {
        if (T(db, 'hub_invites').some((i) => i.event_id === a.event_id && i.student_id === p.id)) continue
        const app = T(db, 'member_applications').find((m) => m.member_id === p.id)
        T(db, 'hub_invites').push({ id: newId(), event_id: a.event_id, student_id: p.id, emails: app?.parent_email ? [String(app.parent_email).toLowerCase()] : [], created_at: iso(now) })
        created += 1
      }
      return { created, emails_filled: 0 }
    }
    case 'invite_preview': {
      const inv = T(db, 'hub_invites').filter((i) => i.event_id === a.event_id)
      return { to_send: inv.filter((i) => (i.emails ?? []).length && inviteStatus(db, i.id) === 'none').length,
        already: inv.filter((i) => inviteStatus(db, i.id) !== 'none').length,
        no_email: inv.filter((i) => !(i.emails ?? []).length).map((i) => studentName(db, i.student_id)).sort() }
    }
    case 'send_invites': {
      let n = 0
      for (const i of T(db, 'hub_invites').filter((x) => x.event_id === a.event_id && (x.emails ?? []).length && inviteStatus(db, x.id) === 'none')) {
        enqueue(db, a.event_id, 'invite', i.emails, 'Plan', 'Your page:\n{{link}}', i.id, `invite:${i.id}`); n += 1
      }
      return { queued: n }
    }
    case 'remind_preview': case 'remind': {
      if (!['phase1', 'lockin'].includes(a.phase)) refuse('invalid', 'Choose sign-up or lock-in.')
      const list = T(db, 'hub_invites').filter((i) => i.event_id === a.event_id && (i.emails ?? []).length && ['pending', 'sending', 'sent'].includes(inviteStatus(db, i.id))
        && !progress(db, i.id)[a.phase === 'phase1' ? 'phase1_done' : 'lockin_done'])
      if (action === 'remind') for (const i of list) enqueue(db, a.event_id, `remind_${a.phase}`, i.emails, 'Reminder', '{{link}}', i.id)
      return action === 'remind' ? { queued: list.length } : { count: list.length }
    }
    case 'retry_failed': { let n = 0; for (const o of T(db, 'hub_outbox')) if (o.event_id === a.event_id && o.status === 'failed') { o.status = 'pending'; n += 1 } return { requeued: n } }
    case 'set_emails': {
      const list = [...new Set((a.emails ?? []).map((x) => String(x).trim().toLowerCase()).filter(Boolean))]
      if (list.some((x) => !isEmail(x))) refuse('invalid', 'One of those is not an email address.')
      const i = one(db, 'hub_invites', (x) => x.id === a.invite_id); if (i) i.emails = list
      break
    }
    case 'reset_links': { let n = 0; for (const t of T(db, 'hub_invite_tokens')) if (t.invite_id === a.invite_id && !t.revoked_at) { t.revoked_at = iso(now); n += 1 } return { revoked: n } }
    case 'add_car': {
      const d = one(db, 'hub_days', (x) => x.id === a.day_id)
      const id = newId()
      T(db, 'hub_cars').push({ id, event_id: d.event_id, day_id: d.id, run: a.run, driver_invite_id: null, driver_label: String(a.driver_label ?? '').trim() || null, seats: Number(a.seats), description: String(a.description ?? '').trim(), leave_by: a.leave_by || null, takes_pickups: !!a.takes_pickups, left_at: null, arrived_at: null, minor_override_reason: null, created_at: iso(now), updated_at: iso(now) })
      v = { car_id: id }
      break
    }
    case 'remove_car': {
      const c = one(db, 'hub_cars', (x) => x.id === a.car_id)
      if (c?.left_at) refuse('car_left', 'That car already left.')
      if (c?.driver_invite_id) refuse('family_car', 'This is a family\'s car. Change their answer for this day instead.')
      for (const s of seatsIn(db, a.car_id)) dropSeat(db, a.car_id, s.invite_id, 'staff', null, now)
      db.hub_cars = T(db, 'hub_cars').filter((x) => x.id !== a.car_id)
      break
    }
    case 'export': return exportRows(db, a.event_id)
    default: refuse('unknown_action', 'That action is not part of this page.')
  }
  return { ok: true, ...(v ?? {}) }
}

// 0008: who the link belongs to, and every parent or guardian on the family.
function familyExtras(db, token) {
  const tk = one(db, 'hub_invite_tokens', (t) => t.token === token && !t.revoked_at)
  const i = tk && one(db, 'hub_invites', (x) => x.id === tk.invite_id)
  if (!i) return {}
  const me = tk.email ?? null
  const out = { me, guardians: (i.emails ?? []).map((e) => ({ email: e, name: i.guardian_names?.[e] ?? null })) }
  if (V9) {
    out.household = T(db, 'hub_invites')
      .filter((b) => b.id !== i.id && b.event_id === i.event_id && (b.emails ?? []).some((e) => (i.emails ?? []).includes(e)))
      .map((b) => ({ invite_id: b.id, student: studentName(db, b.student_id), can_open: !!me && (b.emails ?? []).includes(me),
        cars: T(db, 'hub_cars').filter((c) => c.driver_invite_id === b.id).map((c) => c.id) }))
      .sort((x, y) => x.student.localeCompare(y.student))
  }
  return out
}

/** The 0008 removals, for features/eventhubfamilies.js (its migration gates them). */
export function removeFamily(db, inv, staff, now) {
  const i = one(db, 'hub_invites', (x) => x.id === inv)
  if (!i) refuse('not_found', 'That family is not part of this event.')
  if (!staff) {
    if (now >= eventEnd(db, i.event_id)) refuse('event_over', 'This event is over.')
    const left = T(db, 'hub_seats').some((x) => x.invite_id === inv && one(db, 'hub_cars', (c) => c.id === x.car_id)?.left_at)
      || T(db, 'hub_cars').some((c) => c.driver_invite_id === inv && c.left_at)
    if (left) refuse('car_left', 'A car with your family in it has already left. Ask a mentor.')
  }
  for (const x of T(db, 'hub_seats').filter((y) => y.invite_id === inv)) dropSeat(db, x.car_id, inv, 'rider', null, now)
  for (const c of T(db, 'hub_cars').filter((y) => y.driver_invite_id === inv)) {
    for (const x of seatsIn(db, c.id)) dropSeat(db, c.id, x.invite_id, 'driver', "The driver's family left the trip.", now)
    for (const p of T(db, 'hub_pickups')) if (p.car_id === c.id) { p.car_id = null; p.accepted_at = null }
    db.hub_cars = T(db, 'hub_cars').filter((y) => y !== c)
  }
  for (const d of T(db, 'hub_days').filter((x) => x.event_id === i.event_id)) withdrawPickup(db, inv, d.id, now)
  for (const fc of T(db, 'hub_food_claims').filter((x) => x.invite_id === inv)) {
    const m = one(db, 'hub_meals', (x) => x.id === fc.meal_id)
    if (m && now < ms(m.starts_at)) foodChange(db, fc.id, inv, staff, true, null, null, null, now)
  }
  const name = studentName(db, i.student_id)
  enqueue(db, i.event_id, 'family_removed', mentorEmails(db, i.event_id), `${name}'s family was removed`, staff ? 'By a mentor.' : 'By the family.')
  for (const t of ['hub_invite_tokens', 'hub_responses', 'hub_day_answers', 'hub_pickups', 'hub_food_claims', 'hub_seats']) db[t] = T(db, t).filter((x) => x.invite_id !== inv)
  db.hub_outbox = T(db, 'hub_outbox').filter((x) => x.link_invite_id !== inv)
  db.hub_invites = T(db, 'hub_invites').filter((x) => x.id !== inv)
  return { ok: true, student: name }
}

export function removeGuardian(db, inv, email, staff, callerEmail, now) {
  const i = one(db, 'hub_invites', (x) => x.id === inv)
  if (!i) refuse('not_found', 'That family is not part of this event.')
  const e = String(email ?? '').trim().toLowerCase()
  if (!staff && now >= eventEnd(db, i.event_id)) refuse('event_over', 'This event is over.')
  if (!(i.emails ?? []).includes(e)) refuse('not_on_family', 'That email is not on this family.')
  if (!staff && i.emails.length === 1) refuse('last_guardian', 'You are the only parent or guardian on this family. To take your family off the trip, use "Remove our family".')
  i.emails = i.emails.filter((x) => x !== e)
  if (i.guardian_names) { const g = { ...i.guardian_names }; delete g[e]; i.guardian_names = g }
  for (const t of T(db, 'hub_invite_tokens')) if (t.invite_id === inv && t.email === e && !t.revoked_at) t.revoked_at = iso(now)
  return { ok: true, self: callerEmail === e }
}

export const hubFixture = { T, one, nowMs, txn, Refusal, tokenInvite, isStaff, claim, seatsIn, refuse, setV8, rosterStudent, studentName }

const refusalAnswer = (e) => ({ data: null, error: { code: e.state, message: `hub:${e.code}`, details: e.message, hint: null } })

// ── seed ────────────────────────────────────────────────────────────────────
function seedRows({ now }) {
  const t = nowMs(now)
  const today = laDateOf(t)
  // The first Friday at least a week out, so the days read Fri / Sat / Sun.
  let fri = addDays(today, 7)
  while (new Date(`${fri}T12:00:00Z`).getUTCDay() !== 5) fri = addDays(fri, 1)
  const sat = addDays(fri, 1); const sun = addDays(fri, 2)
  const at = (ymd, hh, mm = 0) => iso(laInstant(ymd, hh, mm))
  const ev = EH.event
  const day = (id, ymd, position, title, extra) => ({
    id, event_id: ev, day_date: ymd, position, title, intro: null, meet_place: 'Bosco Tech front parking lot', captain_id: null,
    drive_to_range: '45 min to 1 hr', drive_home_range: '50 min to 1 hr 10 min', miles_to: 48.1, miles_home: 50.8,
    ask_pit_setup: false, ask_school_ride: true, home_options: [], notes: null, pits_close_at: null, last_car_out_at: null, ...extra,
  })
  const hub_days = [
    day(EH.fri, fri, 3, 'Load-in and practice', {
      intro: 'Evening session after school: load-in, pit setup and practice matches, 5:00 to 9:00 PM.\nOpen to everyone.\nCars leave Bosco Tech right after school, because the Friday drive takes up to 1 hr 50 min.',
      meet_at: at(fri, 15, 15), target_arrival_at: at(fri, 17), venue_opens_at: at(fri, 17), venue_closes_at: at(fri, 22, 30), pits_close_at: at(fri, 21),
      drive_to_range: '1 hr to 1 hr 50 min', drive_home_range: '50 min to 1 hr 5 min', ask_pit_setup: true, ask_school_ride: false,
      home_options: [{ key: 'pits', label: 'Leave at 9:00 PM when pits close', default: true }, { key: 'movie', label: 'Stay for the Halloween movie, home about 11:35 PM' }],
    }),
    day(EH.sat, sat, 1, 'Qualifications', { meet_at: at(sat, 5, 45), last_car_out_at: at(sat, 6), target_arrival_at: at(sat, 7), doors_at: at(sat, 8), venue_opens_at: at(sat, 8), venue_closes_at: at(sat, 18, 15), captain_id: '00000000-0000-0000-0000-0000000000b1' }),
    day(EH.sun, sun, 2, 'Alliance selection and playoffs', { meet_at: at(sun, 5, 45), last_car_out_at: at(sun, 6), target_arrival_at: at(sun, 7), doors_at: at(sun, 8), venue_opens_at: at(sun, 8), venue_closes_at: at(sun, 17, 30), notes: 'Clocks fall back overnight. The meet time is on the new time.' }),
  ]
  const hub_events = [{
    id: ev, title: 'Fixture Blitz', venue_name: 'Capistrano Valley High School', venue_address: '26301 Via Escolar, Mission Viejo, CA 92692',
    map_url: 'https://www.google.com/maps/search/?api=1&query=26301+Via+Escolar', timezone: TZ,
    phase1_due_at: iso(t + 2 * 24 * H), lockin_opens_at: iso(t - 24 * H), lockin_due_at: iso(t + 5 * 24 * H),
    one_minor_rule: true, driver_paperwork_required: false, alert_emails: [],
    // 0011's column; hidden from every read while 0011 is off.
    parent_service_hours_note: 'Driving, attending, and volunteering at Fixture Blitz all count toward parent service hours.',
    links: { site: 'https://beachblitz.org/', volunteer: 'https://beachblitz.org/volunteer/index.html', stream: 'https://twitch.tv/ocfirst', hotel: 'https://group.hamptoninn.com/lj95ci', first_registration: 'https://www.firstinspires.org/programs/youth-registration', team_list: '', school_form: '', medication_form: '', parent_channel: 'https://groupme.com/join_group/fixture-parents' },
    info: { sections: [
      { key: 'drive', title: 'Drive from Bosco Tech', lines: ['To the venue | I-5 S, 48.1 mi', 'Sat, arrive 7:00 AM | 45 min to 1 hr'] },
      { key: 'agenda_sat', title: 'Saturday', lines: ['8:00 AM | Venue opens', '9:35 AM to 12:00 PM | Qualification matches'] },
      { key: 'teams', title: 'Teams', lines: ['Team list | link:team_list'] },
      { key: 'watch', title: 'Watch from home', lines: ['Live stream on Twitch | link:stream'] },
      { key: 'hotel', title: 'Hotel', lines: ['Group rate | link:hotel', 'Families book and share lodging on their own. Students stay with their own family.'] },
      { key: 'parent_channel', title: 'Parent chat', if_link: 'parent_channel', lines: ['GroupMe | link:parent_channel'] },
    ] },
    created_at: iso(t - 10 * 24 * H), updated_at: iso(t - 10 * 24 * H),
  }, {
    id: EH.pastEvent, title: 'Fixture Scrimmage', venue_name: 'Bosco Tech', timezone: TZ, one_minor_rule: true, driver_paperwork_required: false,
    links: {}, info: { sections: [] }, alert_emails: [], phase1_due_at: null, lockin_opens_at: null, lockin_due_at: null,
    created_at: iso(t - 30 * 24 * H), updated_at: iso(t - 30 * 24 * H),
  }]
  hub_days.push({ id: EH.pastDay, event_id: EH.pastEvent, day_date: addDays(today, -3), position: 1, title: 'Scrimmage', venue_closes_at: at(addDays(today, -3), 17), meet_at: at(addDays(today, -3), 8), ask_pit_setup: false, ask_school_ride: false, home_options: [] })

  const hub_meals = [
    { id: EH.mealStarted, event_id: ev, day_id: EH.fri, label: 'Setup snacks', starts_at: iso(t - H), truck_note: null, position: 0 },
    { id: 'e0b00000-0000-4000-8000-000000000203', event_id: ev, day_id: EH.fri, label: 'Fri dinner', starts_at: at(fri, 18, 30), truck_note: 'Food trucks 5:00 to 9:00 PM.', position: 1 },
    { id: EH.mealSatLunch, event_id: ev, day_id: EH.sat, label: 'Sat lunch', starts_at: at(sat, 12), truck_note: 'Food trucks 7:00 AM to 3:00 PM.', position: 2 },
  ]
  const hub_food_needs = [
    { id: 'e0b00000-0000-4000-8000-000000000302', meal_id: EH.mealStarted, label: 'Granola bars', quantity: 1, starter: false, position: 1 },
    { id: 'e0b00000-0000-4000-8000-000000000303', meal_id: 'e0b00000-0000-4000-8000-000000000203', label: 'Main dish', quantity: 2, starter: true, position: 1 },
    { id: EH.needMain, meal_id: EH.mealSatLunch, label: 'Main dish', quantity: 3, starter: true, position: 1 },
    { id: 'e0b00000-0000-4000-8000-000000000304', meal_id: EH.mealSatLunch, label: 'Water case', quantity: 2, starter: true, position: 2 },
  ]

  const hub_invites = Object.entries(STUDENT).map(([k, sid]) => ({ id: INVITE[k], event_id: ev, student_id: sid, emails: [`${k}.family@example.com`], created_at: iso(t - 5 * 24 * H) }))
  hub_invites.push({ id: PAST_INVITE, event_id: EH.pastEvent, student_id: STUDENT.sam, emails: ['sam.family@example.com'], created_at: iso(t - 20 * 24 * H) })
  const hub_invite_tokens = [...Object.keys(STUDENT).map((k) => ({ token: EH.tokens[k], invite_id: INVITE[k], created_at: iso(t - 5 * 24 * H), revoked_at: null })),
    { token: EH.tokens.past, invite_id: PAST_INVITE, created_at: iso(t - 20 * 24 * H), revoked_at: null }]

  const done = (k, last, extra = {}) => ({
    invite_id: INVITE[k], staying_nights: [], allergies_none: true, allergens: [], allergy_other: null, dietary: null, medication: false,
    parent_name: `Pat ${last}`, parent_phone: `55555501${String(Object.keys(STUDENT).indexOf(k)).padStart(2, '0')}`,
    parent_email: `${k}.family@example.com`, emergency_name: `Lee ${last}`, emergency_phone: '5555550999', first_reg_done: true,
    school_form_done: null, driver_phone_consent_at: null, rider_phone_consent_at: null, driver_25: null, driver_licensed: null,
    driver_paperwork_at: null, updated_at: iso(t - 4 * 24 * H), ...extra,
  })
  const hub_responses = [
    { invite_id: INVITE.sam, allergens: [], parent_name: 'Pat Parent', parent_phone: '5555550199', parent_email: 'parent.test@example.com', updated_at: iso(t - 5 * 24 * H) },
    done('riley', 'Student', { rider_phone_consent_at: iso(t - 4 * 24 * H) }),
    done('casey', 'Exempt', { allergies_none: false, allergens: ['peanut'], driver_25: true, driver_licensed: true, driver_phone_consent_at: iso(t - 4 * 24 * H), parent_name: 'Morgan Exempt', parent_phone: '5555551234' }),
    done('jordan', 'Okafor'), done('avery', 'Chen'),
    done('taylor', 'Nguyen', { driver_25: true, driver_licensed: true, parent_name: 'Kim Nguyen' }),
    done('morgan', 'Patel'), done('quinn', 'Ramirez'), done('jamie', 'Brooks'), done('rowan', 'Ellis'),
    { invite_id: PAST_INVITE, allergens: [], parent_name: 'Pat Parent', updated_at: iso(t - 10 * 24 * H) },
  ]
  const A = (k, dayId, extra) => ({ invite_id: INVITE[k], day_id: dayId, attending: 'yes', adults: 0, pit_setup: dayId === EH.fri ? false : null, school_mode: dayId === EH.fri ? null : 'self', updated_at: iso(t - 4 * 24 * H), ...extra })
  const no = (k, dayId) => ({ invite_id: INVITE[k], day_id: dayId, attending: 'no', updated_at: iso(t - 4 * 24 * H) })
  const hub_day_answers = [
    // A seated rider carries the mode a claim records (0008 asks for it).
    A('riley', EH.fri, { to_mode: 'carpool', home_mode: 'carpool' }), A('riley', EH.sat, { to_mode: 'carpool', home_mode: 'carpool' }), no('riley', EH.sun),
    A('casey', EH.fri, { to_mode: 'driving', home_mode: 'driving', offer_seats: 2, offer_description: 'silver Odyssey', offer_leave_by: at(fri, 21), offer_takes_pickups: false }),
    A('casey', EH.sat, { to_mode: 'driving', home_mode: 'driving', offer_seats: 2, offer_description: 'silver Odyssey', offer_leave_by: at(sat, 15), offer_takes_pickups: true }),
    no('casey', EH.sun),
    no('jordan', EH.fri), A('jordan', EH.sat), no('jordan', EH.sun),
    no('avery', EH.fri), A('avery', EH.sat), no('avery', EH.sun),
    no('taylor', EH.fri), A('taylor', EH.sat, { to_mode: 'driving', home_mode: 'driving', offer_seats: 3, offer_description: 'red sedan', offer_leave_by: at(sat, 18, 15), offer_takes_pickups: false }), no('taylor', EH.sun),
    no('morgan', EH.fri), A('morgan', EH.sat, { school_mode: 'pickup', to_mode: 'carpool', home_mode: 'carpool' }), no('morgan', EH.sun),
    no('quinn', EH.fri), no('quinn', EH.sat), A('quinn', EH.sun, { to_mode: 'carpool', home_mode: 'carpool' }),
    no('jamie', EH.fri), no('jamie', EH.sat), A('jamie', EH.sun, { to_mode: 'carpool', home_mode: 'carpool' }),
    no('rowan', EH.fri), A('rowan', EH.sat), no('rowan', EH.sun),
    { invite_id: PAST_INVITE, day_id: EH.pastDay, attending: 'yes', adults: 1, updated_at: iso(t - 10 * 24 * H) },
  ]
  const car = (id, inv, dayId, run, extra) => ({ id, event_id: ev, day_id: dayId, run, driver_invite_id: inv, driver_label: null, takes_pickups: false, left_at: null, arrived_at: null, minor_override_reason: null, minor_override_by: null, minor_override_at: null, created_at: iso(t - 4 * 24 * H), updated_at: iso(t - 4 * 24 * H), ...extra })
  const hub_cars = [
    car(EH.carCaseyFri, INVITE.casey, EH.fri, 'to', { seats: 2, description: 'silver Odyssey', leave_by: at(fri, 21), left_at: iso(t - 10 * MIN) }),
    car(EH.carCaseySatTo, INVITE.casey, EH.sat, 'to', { seats: 2, description: 'silver Odyssey', leave_by: at(sat, 15), takes_pickups: true }),
    car(EH.carCaseySatHome, INVITE.casey, EH.sat, 'home', { seats: 2, description: 'silver Odyssey', leave_by: at(sat, 15), takes_pickups: true }),
    car(EH.carTaylorSatTo, INVITE.taylor, EH.sat, 'to', { seats: 3, description: 'red sedan', leave_by: at(sat, 18, 15), created_at: iso(t - 3 * 24 * H) }),
    car(EH.carMentorSat, null, EH.sat, 'to', { driver_label: 'Coach Max', seats: 3, description: 'white team van', leave_by: null, created_at: iso(t - 2 * 24 * H) }),
    car(EH.carMentorSun, null, EH.sun, 'to', { driver_label: 'Coach Max', seats: 3, description: 'white team van', leave_by: null }),
  ]
  // Casey's Friday home car was never listed (home_mode driving with the same
  // offer): it exists in the SQL only after a sync, so the model lists the
  // ones a sync would have made.
  hub_cars.push(car('e0b00000-0000-4000-8000-000000000107', INVITE.casey, EH.fri, 'home', { seats: 2, description: 'silver Odyssey', leave_by: at(fri, 21) }))
  hub_cars.push(car('e0b00000-0000-4000-8000-000000000108', INVITE.taylor, EH.sat, 'home', { seats: 3, description: 'red sedan', leave_by: at(sat, 18, 15) }))
  const seat = (carId, dayId, run, k, extra) => ({ car_id: carId, day_id: dayId, run, invite_id: INVITE[k], via_pickup: false, placed_by: null, override_reason: null, created_at: iso(t - 3 * 24 * H), ...extra })
  const hub_seats = [
    seat(EH.carCaseyFri, EH.fri, 'to', 'riley'),
    seat(EH.carCaseySatTo, EH.sat, 'to', 'riley'),
    seat(EH.carCaseySatHome, EH.sat, 'home', 'riley'),
    seat(EH.carMentorSun, EH.sun, 'to', 'quinn', { created_at: iso(t - 2 * 24 * H) }),
    seat(EH.carMentorSun, EH.sun, 'to', 'jamie', { created_at: iso(t - 2 * 24 * H + MIN) }),
  ]
  const hub_pickups = [
    { id: 'e0b00000-0000-4000-8000-000000000501', invite_id: INVITE.morgan, day_id: EH.sat, spot: 'Elm St and 3rd Ave', consent_at: iso(t - 3 * 24 * H), covers_home: true, car_id: null, accepted_at: null, created_at: iso(t - 3 * 24 * H), updated_at: iso(t - 3 * 24 * H) },
  ]
  const hub_food_claims = [
    { id: 'e0b00000-0000-4000-8000-000000000601', meal_id: EH.mealSatLunch, need_id: 'e0b00000-0000-4000-8000-000000000304', invite_id: INVITE.riley, staff_label: null, what: 'Two cases of water', serves: 48, allergen: 'no', created_at: iso(t - 3 * 24 * H), updated_at: iso(t - 3 * 24 * H) },
  ]
  return { hub_events, hub_days, hub_meals, hub_food_needs, hub_invites, hub_invite_tokens, hub_responses, hub_day_answers, hub_cars, hub_seats, hub_pickups, hub_food_claims, hub_outbox: [], hub_resend_log: [] }
}

// ── the plugin ──────────────────────────────────────────────────────────────
const staffOnly = ({ db, user }) => isStaff(db, user?.id)

export default {
  migration: '0005',
  creates: {
    tables: TABLES,
    rpcs: ['hub_member_board', 'hub_member_events', 'hub_staff_call'],
  },
  seed: ({ now }) => seedRows({ now }),
  rpcs: {
    hub_member_events: ({ db, user, persona, now, engine }) => {
      setV8(engine)
      const ok = isStaff(db, user?.id) || (!!user && one(db, 'profiles', (p) => p.id === user.id)?.approved !== false && roles(db, user.id).includes('student'))
      if (!ok) return { data: [], error: null }
      const t = nowMs(now)
      return {
        data: T(db, 'hub_events').filter((e) => persona?.isStaff || eventEnd(db, e.id) > t - 7 * 24 * H)
          .map((e) => { const j = eventJson(db, e.id, t); return { id: e.id, title: e.title, venue_name: e.venue_name ?? null, starts_on: j.starts_on, ends_at: j.ends_at, over: j.over } })
          .sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on))),
        error: null,
      }
    },
    hub_member_board: ({ args, db, user, now, engine }) => {
      setV8(engine)
      const t = nowMs(now)
      const staff = isStaff(db, user?.id)
      const ok = staff || (!!user && one(db, 'profiles', (p) => p.id === user.id)?.approved !== false && roles(db, user.id).includes('student'))
      if (!ok) return { data: null, error: { code: '42501', message: 'hub:not_allowed', details: 'Only team members can see this board.' } }
      if (!one(db, 'hub_events', (e) => e.id === args?.p_event)) return { data: null, error: { code: 'P0002', message: 'hub:not_found', details: 'That event does not exist.' } }
      return { data: { event: eventJson(db, args.p_event, t), board: board(db, args.p_event, staff ? 'staff' : 'member', null, t) }, error: null }
    },
    hub_staff_call: ({ args, db, user, now, engine }) => {
      setV8(engine)
      if (!isStaff(db, user?.id)) return { data: null, error: { code: '42501', message: 'hub:not_allowed', details: 'Staff only.' } }
      try { return { data: txn(db, () => staffCall(db, user, args?.p_action, args?.p_args, nowMs(now))), error: null } } catch (e) {
        if (e instanceof Refusal) return refusalAnswer(e)
        throw e
      }
    },
  },
  functions: {
    // The event-family Edge Function: a family by token, and "lost your link".
    'event-family': ({ body, db, now, engine }) => {
      setV8(engine)
      const t = nowMs(now)
      if (body?.action === 'resend_link') {
        T(db, 'hub_resend_log').push({ id: T(db, 'hub_resend_log').length + 1, email: String(body.email ?? '').toLowerCase(), at: iso(t) })
        return { data: { ok: true }, error: null }
      }
      if (body?.action === 'drain') return { data: { ok: true, sent: 0, failed: 0, skipped: 'gmail_not_configured' }, error: null }
      if (!tokenInvite(db, body?.token)) return { data: { error: 'not_found' }, status: 404 }
      try {
        const out = txn(db, () => familyCall(db, body.token, body.action ?? 'fetch', body.args, t))
        return { data: V8 && out?.event ? { ...out, ...familyExtras(db, body.token) } : out, error: null }
      } catch (e) {
        if (e instanceof Refusal) return e.state === 'P0002' ? { data: { error: 'not_found' }, status: 404 } : { data: { error: e.code, message: e.message }, status: 409 }
        throw e
      }
    },
  },
  // RLS: staff read the hub tables; nobody signed in reads tokens or the
  // throttle; non-staff read nothing (students use hub_member_board).
  visible: Object.fromEntries(TABLES.map((tb) => [tb, ['hub_invite_tokens', 'hub_resend_log'].includes(tb) ? () => false : staffOnly])),
}
