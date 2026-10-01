// The core seed: enough of every table the app reads that every route renders
// real content under fixture mode. Fictional people only.
//
// DETERMINISTIC: a fixed-seed PRNG drives every "random" choice, so two resets
// on the same clock produce the same store and two screenshots of a route are
// comparable. RELATIVE: every timestamp is placed against `now` (the fixture
// clock at reset) on an America/Los_Angeles wall clock, so the shop is open
// right now, there is a week of history behind it and a calendar ahead of it,
// whatever day the fixture is opened.
//
// A feature's rows do NOT go here: a lane adds features/<name>.js with its own
// seed (README, "The contract"), so parallel work never shares a write point.

import { IDS, PERSONAS } from './personas.js'
import { laAt, laAddDays, laDate, laInstant, dow } from './time.js'
import { PARENT_TOKEN } from './routes.js'

// Fixed ids for core rows a feature seed may want to reference.
export const CORE_IDS = Object.freeze({
  seasonOff2026: '10000000-0000-4000-8000-000000000001',
  seasonBiocore: '10000000-0000-4000-8000-000000000002',
  buildNow: '20000000-0000-4000-8000-000000000001',
  meetingTomorrow: '20000000-0000-4000-8000-000000000002',
  surveyOpen: '30000000-0000-4000-8000-000000000001',
  surveyPast: '30000000-0000-4000-8000-000000000002',
  appStudent: '40000000-0000-4000-8000-000000000001',
  appStudent2: '40000000-0000-4000-8000-000000000002',
})

// Deterministic ids for generated rows: a namespace digit + a counter.
function idMaker(prefix) {
  let n = 0
  return () => {
    n += 1
    return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`
  }
}

function prng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// The roster beyond the sign-in personas. Fictional names.
const EXTRA_STUDENTS = [
  ['c4', 'Jordan Okafor', 'Jordan', ['Mechanical', 'Fabrication'], 2027],
  ['c5', 'Taylor Nguyen', 'Tay', ['Programming'], 2028],
  ['c6', 'Morgan Patel', null, ['Electrical'], 2027],
  ['c7', 'Avery Chen', 'Ave', ['CAD', 'Mechanical'], 2029],
  ['c8', 'Quinn Ramirez', null, ['Media', 'Business/Outreach'], 2028],
  ['c9', 'Jamie Brooks', 'JB', ['Drive Team', 'Strategy and Scouting'], 2027],
  ['ca', 'Rowan Ellis', null, ['Field & Pit', 'Robot Construction'], 2029],
  ['cb', 'Skyler Diaz', 'Sky', ['Programming', 'Strategy and Scouting'], 2028],
  ['cc', 'Dakota Hale', null, [], 2029],
]
const memberId = (suffix) => `00000000-0000-0000-0000-0000000000${suffix}`

export function coreSeed({ now }) {
  const rand = prng(5669)
  const pick = (list) => list[Math.floor(rand() * list.length)]
  const iso = (d) => d.toISOString()
  const today = laDate(now)
  const nowMs = now.getTime()
  const lahour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', hourCycle: 'h23' }).format(now))

  // ── People ────────────────────────────────────────────────────────────────
  const people = [
    { id: IDS.admin, full_name: PERSONAS.admin.name, nickname: 'Ada', email: PERSONAS.admin.email, roles: ['admin'], subteams: ['Management'] },
    { id: IDS.mentor, full_name: PERSONAS.mentor.name, nickname: 'Coach Max', email: PERSONAS.mentor.email, roles: ['mentor'], subteams: ['Mechanical'] },
    { id: IDS.lead, full_name: 'Robin Park', nickname: 'Robin', email: 'lead.test@boscotech.edu', roles: ['lead', 'student'], subteams: ['Electrical', 'Management'], grad_year: 2027 },
    { id: IDS.student, full_name: PERSONAS.student.name, nickname: 'Sam', email: PERSONAS.student.email, roles: ['student'], subteams: ['Mechanical', 'CAD'], grad_year: 2028, shirt_size: 'M', bio: 'Builds drivetrains. Learning the lathe.' },
    { id: IDS.student2, full_name: PERSONAS.student2.name, nickname: 'Riley', email: PERSONAS.student2.email, roles: ['student'], subteams: ['Programming'], grad_year: 2027, shirt_size: 'L' },
    { id: IDS.exempt, full_name: PERSONAS.exempt.name, nickname: 'Casey', email: PERSONAS.exempt.email, roles: ['student'], subteams: ['Electrical'], grad_year: 2028, geofence_exempt: true },
    ...EXTRA_STUDENTS.map(([s, full_name, nickname, subteams, grad_year]) => ({
      id: memberId(s), full_name, nickname, email: `${full_name.split(' ')[0].toLowerCase()}.fixture@boscotech.edu`, roles: ['student'], subteams, grad_year,
    })),
    { id: memberId('cf'), full_name: 'Alex Former', nickname: null, email: 'alex.former@example.com', roles: ['student'], subteams: ['Mechanical'], grad_year: 2025, status: 'alumni' },
    { id: IDS.parent, full_name: PERSONAS.parent.name, nickname: null, email: PERSONAS.parent.email, roles: ['parent'], subteams: [] },
    { id: IDS.pending, full_name: PERSONAS.pending.name, nickname: null, email: PERSONAS.pending.email, roles: [], subteams: [], approved: false },
  ]
  const students = people.filter((p) => p.roles.includes('student') && p.status !== 'alumni')
  const onboarded = iso(laAt(now, -120, 16))

  const profiles = people.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    nickname: p.nickname,
    bio: p.bio ?? null,
    approved: p.approved !== false,
    created_at: onboarded,
    grad_year: p.grad_year ?? null,
    status: p.status ?? 'active',
    shirt_size: p.shirt_size ?? null,
    subteams: p.subteams,
    disciplines: [],
    onboarded_at: p.approved === false ? null : onboarded,
    geofence_exempt: p.geofence_exempt === true,
  }))
  const member_roles = people.flatMap((p) => p.roles.map((role) => ({ member_id: p.id, role })))
  // auth.users is not a public table; RPCs that join it (admin_get_members,
  // readiness_summary's roster_pending) read this instead.
  const __users = people.map((p) => ({ id: p.id, email: p.email, full_name: p.full_name }))

  // ── Seasons ───────────────────────────────────────────────────────────────
  const seasons = [
    { id: '10000000-0000-4000-8000-000000000010', name: '2025 Off-Season', start_date: '2025-05-01', end_date: '2025-12-31' },
    { id: CORE_IDS.seasonOff2026, name: 'Offseason 2026', start_date: '2026-05-01', end_date: '2027-01-06' },
    { id: CORE_IDS.seasonBiocore, name: 'Biocore 2027', start_date: '2027-01-07', end_date: '2027-05-31' },
  ]
  // The season spanning the fixture's today, for applications and goals.
  const current = seasons.find((s) => s.start_date <= today && s.end_date >= today) ?? seasons[1]

  // ── Calendar ──────────────────────────────────────────────────────────────
  const eventId = idMaker('20000000')
  for (let i = 0; i < 10; i += 1) eventId() // keep generated ids clear of CORE_IDS
  const events = []
  const addEvent = (e) => { events.push({ id: e.id ?? eventId(), location: 'Shop', notes: null, created_by: IDS.mentor, rsvp_enabled: false, capacity: null, mandatory: false, ...e }); return events.at(-1) }

  // Build sessions Tue/Thu afternoons and Saturday mornings, 6 weeks back and
  // 3 weeks ahead -- except today, which gets the one window that covers now.
  for (let d = -42; d <= 21; d += 1) {
    const ymd = laAddDays(now, d)
    if (ymd === today) continue
    const wd = dow(ymd)
    if (wd === 2 || wd === 4) addEvent({ title: 'Build session', kind: 'build', starts_at: iso(laInstant(ymd, 15, 30)), ends_at: iso(laInstant(ymd, 18, 30)) })
    if (wd === 6) addEvent({ title: 'Saturday build', kind: 'build', starts_at: iso(laInstant(ymd, 9, 0)), ends_at: iso(laInstant(ymd, 13, 0)) })
  }
  // The shop is open now: a build window from 90 minutes ago to 3 hours ahead.
  const openStart = new Date(Math.floor((nowMs - 90 * 60_000) / (30 * 60_000)) * 30 * 60_000)
  addEvent({ id: CORE_IDS.buildNow, title: 'Build session', kind: 'build', starts_at: iso(openStart), ends_at: iso(new Date(openStart.getTime() + 4.5 * 3600_000)), notes: 'Drivetrain gearbox assembly and wiring the practice bot.' })
  addEvent({ id: CORE_IDS.meetingTomorrow, title: 'All-team meeting', kind: 'meeting', starts_at: iso(laAt(now, 1, 18, 0)), ends_at: iso(laAt(now, 1, 19, 0)), location: 'Room 214', rsvp_enabled: true, capacity: 40, mandatory: true, notes: 'Season kickoff planning. Bring your subteam questions.' })
  addEvent({ title: 'Machine shop training', kind: 'training', starts_at: iso(laAt(now, 2, 15, 30)), ends_at: iso(laAt(now, 2, 17, 0)), notes: 'Mechanical: band saw and drill press sign-offs.' })
  addEvent({ title: 'FLL volunteer day', kind: 'volunteering', starts_at: iso(laAt(now, 4, 9, 0)), ends_at: iso(laAt(now, 4, 14, 0)), location: 'FLL room', rsvp_enabled: true, capacity: 8 })
  addEvent({ title: 'Community STEM night', kind: 'outreach', starts_at: iso(laAt(now, 6, 17, 30)), ends_at: iso(laAt(now, 6, 20, 0)), location: 'Library', rsvp_enabled: true })
  addEvent({ title: 'SoCal Showdown', kind: 'competition', starts_at: iso(laAt(now, 8, 7, 0)), ends_at: iso(laAt(now, 10, 18, 0)), location: 'Offsite', rsvp_enabled: true, capacity: 24, notes: 'Drive Team and Strategy and Scouting travel Friday.' })
  addEvent({ title: 'Team potluck', kind: 'potluck', starts_at: iso(laAt(now, 12, 18, 0)), ends_at: iso(laAt(now, 12, 20, 0)), location: 'Courtyard', rsvp_enabled: true })
  const pastOutreach = addEvent({ title: 'Robot demo at the fair', kind: 'outreach', starts_at: iso(laAt(now, -9, 10, 0)), ends_at: iso(laAt(now, -9, 14, 0)), location: 'County fair' })
  const pastComp = addEvent({ title: 'Offseason scrimmage', kind: 'competition', starts_at: iso(laAt(now, -20, 8, 0)), ends_at: iso(laAt(now, -19, 17, 0)), location: 'Offsite' })
  const pastVolunteer = addEvent({ title: 'FLL scrimmage judging', kind: 'volunteering', starts_at: iso(laAt(now, -13, 9, 0)), ends_at: iso(laAt(now, -13, 13, 0)), location: 'FLL room' })
  addEvent({ title: 'Subteam leads sync', kind: 'other', starts_at: iso(laAt(now, -3, 12, 0)), ends_at: iso(laAt(now, -3, 12, 45)), location: 'Room 214' })

  const event_signups = []
  const rsvpEvents = events.filter((e) => e.rsvp_enabled)
  rsvpEvents.forEach((e, i) => {
    students.forEach((s, j) => {
      if (s.id === IDS.student && e.id === CORE_IDS.meetingTomorrow) return // Sam has not answered yet
      const r = rand()
      if (r < 0.5) event_signups.push({ event_id: e.id, member_id: s.id, response: r < 0.35 ? 'going' : 'maybe', item: e.kind === 'potluck' && j % 3 === 0 ? pick(['Chips', 'Fruit tray', 'Lemonade', 'Cookies']) : null })
    })
    if (i === 0) event_signups.push({ event_id: e.id, member_id: IDS.mentor, response: 'going', item: null })
  })

  // ── Attendance ────────────────────────────────────────────────────────────
  const aeId = idMaker('50000000')
  const attendance_events = []
  // Every session a member has, so generated build sessions never overlap a
  // deliberate one: the anomaly list on /verify-hours must show the anomalies
  // seeded on purpose below and nothing the generator made by accident.
  const taken = {}
  const closedAfter = {} // member -> instant after which nothing may be added
  const free = (member, a, b) => (closedAfter[member] == null || a < closedAfter[member]) &&
    !(taken[member] ?? []).some(([x, y]) => a < y && b > x)
  const addPair = (member, inAt, outAt, category = 'build', extra = {}) => {
    const inRow = { id: aeId(), user_id: member, type: 'in', event_time: iso(inAt), method: 'nfc', location: extra.location ?? 'shop-main', category, geo_ok: extra.geo_ok ?? true, manual_entry: false, verified: false }
    attendance_events.push(inRow)
    let outRow = null
    if (outAt) {
      outRow = { id: aeId(), user_id: member, type: 'out', event_time: iso(outAt), method: extra.outMethod ?? 'nfc', location: extra.outLocation ?? extra.location ?? 'shop-main', category, geo_ok: null, manual_entry: false, verified: false }
      attendance_events.push(outRow)
    }
    ;(taken[member] ??= []).push([inAt.getTime(), (outAt ?? new Date(inAt.getTime() + 4 * 3600_000)).getTime()])
    return { inRow, outRow }
  }

  // Non-build categories, attached to the real events they happened at.
  for (const s of students.slice(0, 6)) {
    addPair(s.id, new Date(Date.parse(pastOutreach.starts_at) + 10 * 60_000), new Date(Date.parse(pastOutreach.ends_at) - 15 * 60_000), 'outreach', { location: 'county-fair' })
  }
  for (const s of students.slice(2, 8)) {
    addPair(s.id, new Date(Date.parse(pastComp.starts_at)), laAt(now, -20, 17, 30), 'competition', { location: 'offsite' })
    addPair(s.id, laAt(now, -19, 7, 45), new Date(Date.parse(pastComp.ends_at)), 'competition', { location: 'offsite' })
  }
  for (const s of [students[0], students[1], students[4]]) {
    addPair(s.id, new Date(Date.parse(pastVolunteer.starts_at)), new Date(Date.parse(pastVolunteer.ends_at)), 'volunteer', { location: 'fll-room' })
  }

  // Anomalies for /verify-hours, on purpose and nowhere else:
  //  - capped: Morgan's check-in two days ago is the LAST thing Morgan did, so
  //    it reads as a still-open session past MAX_SESSION_MS (missed check-out);
  //  - double_in: Jamie's IN five days ago is followed by another IN;
  //  - geofence: Casey (exempt) checked in yesterday without the fence.
  const stale = addPair(memberId('c6'), laAt(now, -2, 15, 40), null, 'build').inRow
  closedAfter[memberId('c6')] = laAt(now, -2, 15, 40).getTime()
  addPair(memberId('c9'), laAt(now, -5, 15, 35), null, 'build')
  taken[memberId('c9')].pop() // the orphan's window is what the next IN overlaps
  addPair(memberId('c9'), laAt(now, -5, 16, 10), laAt(now, -5, 18, 20), 'build')
  addPair(IDS.exempt, laAt(now, -1, 15, 45), laAt(now, -1, 18, 0), 'build', { geo_ok: false })
  // An auto-closed session awaiting mentor review.
  const autoClosed = addPair(memberId('c5'), laAt(now, -6, 15, 30), laAt(now, -6, 22, 0), 'build', { outMethod: 'auto_close', outLocation: 'auto' })
  // A manual session a mentor entered, with its audit row.
  const manual = addPair(memberId('c7'), laAt(now, -8, 9, 0), laAt(now, -8, 12, 0), 'build')
  manual.inRow.manual_entry = true; manual.inRow.method = 'manual'; manual.inRow.location = 'manual'; manual.inRow.verified = true; manual.inRow.geo_ok = null
  manual.outRow.manual_entry = true; manual.outRow.method = 'manual'; manual.outRow.location = 'manual'; manual.outRow.verified = true

  // Today: a few members are checked in right now (the presence board and
  // Team pulse have someone to show). NOT Sam, Riley or Casey -- the check-in
  // end-to-end test starts each of them from a clean day -- and not Morgan,
  // whose stale session must stay the last thing on the ledger.
  if (lahour >= 2) {
    const inNow = students.filter((x) => ![IDS.student, IDS.student2, IDS.exempt, memberId('c6')].includes(x.id)).slice(0, 4)
    for (const [i, s] of inNow.entries()) addPair(s.id, new Date(nowMs - (40 + i * 17) * 60_000), null, 'build')
    // ...and one who came and went earlier today.
    addPair(memberId('cb'), new Date(nowMs - 150 * 60_000), new Date(nowMs - 95 * 60_000), 'build')
  }

  // Ordinary build sessions on every past build day, around everything above.
  const sessionDays = events.filter((e) => e.kind === 'build' && e.ends_at < iso(laInstant(today, 0, 0)))
  for (const s of students) {
    const keen = s.id === IDS.student || s.id === IDS.student2 ? 0.85 : 0.45 + rand() * 0.4
    for (const e of sessionDays) {
      if (rand() > keen) continue
      const start = new Date(Date.parse(e.starts_at) + Math.floor(rand() * 25) * 60_000)
      const end = new Date(Date.parse(e.ends_at) - Math.floor(rand() * 40) * 60_000)
      if (!free(s.id, start.getTime(), end.getTime())) continue
      addPair(s.id, start, end, 'build', { location: pick(['shop-main', 'shop-main', 'shop-side']) })
    }
  }
  attendance_events.sort((a, b) => a.event_time.localeCompare(b.event_time))

  const session_reviews = [
    { id: '51000000-0000-4000-8000-000000000001', user_id: memberId('c5'), checkin_id: autoClosed.inRow.id, checkout_id: autoClosed.outRow.id, status: 'pending', created_at: iso(laAt(now, -6, 22, 0)) },
  ]
  const attendance_audit = [
    { event_id: manual.inRow.id, member_id: memberId('c7'), actor_id: IDS.mentor, action: 'insert', reason: 'Saturday build, forgot to tap in', old_value: null, new_value: { type: 'in', event_time: manual.inRow.event_time }, created_at: iso(laAt(now, -7, 9, 0)) },
    { event_id: manual.outRow.id, member_id: memberId('c7'), actor_id: IDS.mentor, action: 'insert', reason: 'Saturday build, forgot to tap in', old_value: null, new_value: { type: 'out', event_time: manual.outRow.event_time }, created_at: iso(laAt(now, -7, 9, 0)) },
  ]

  // Sam's most recent two sessions, for a pending correction request.
  const samPairs = attendance_events.filter((e) => e.user_id === IDS.student)
  const samIn = samPairs.filter((e) => e.type === 'in').at(-1)
  const samOut = samPairs.find((e) => e.type === 'out' && e.event_time > (samIn?.event_time ?? ''))
  const session_corrections = samIn && samOut ? [
    { member_id: IDS.student, checkin_id: samIn.id, checkout_id: samOut.id, note: 'I stayed until close to help sweep, my phone died before I tapped out.', proposed_in: null, proposed_out: iso(new Date(Date.parse(samOut.event_time) + 30 * 60_000)), proposed_category: null, status: 'pending', created_at: iso(laAt(now, -1, 19, 0)) },
  ] : []

  // ── Logged hours ──────────────────────────────────────────────────────────
  const logged_hours = [
    { id: '52000000-0000-4000-8000-000000000001', member_id: IDS.student, date: laAddDays(now, -16), hours: 3, type: 'outreach', description: 'Robotics table at the elementary school open house', status: 'verified', verified_by: IDS.mentor, verified_at: iso(laAt(now, -15, 10)), reviewed_by: IDS.mentor },
    { id: '52000000-0000-4000-8000-000000000002', member_id: IDS.student, date: laAddDays(now, -4), hours: 2, type: 'volunteer', description: 'Helped reset the FLL practice tables', status: 'pending' },
    { id: '52000000-0000-4000-8000-000000000003', member_id: IDS.student2, date: laAddDays(now, -27), hours: 8, type: 'competition', description: 'Scouting at a regional offseason event', status: 'verified', verified_by: IDS.mentor, verified_at: iso(laAt(now, -26, 9)), reviewed_by: IDS.mentor },
    { id: '52000000-0000-4000-8000-000000000004', member_id: IDS.student2, date: laAddDays(now, -11), hours: 1.5, type: 'outreach', description: 'Wrote the newsletter robot update', status: 'verified', verified_by: IDS.admin, verified_at: iso(laAt(now, -10, 12)), reviewed_by: IDS.admin },
    { id: '52000000-0000-4000-8000-000000000005', member_id: memberId('c8'), date: laAddDays(now, -2), hours: 4, type: 'outreach', description: 'Filmed and edited the sponsor thank-you video', status: 'pending' },
    { id: '52000000-0000-4000-8000-000000000006', member_id: memberId('c4'), date: laAddDays(now, -30), hours: 6, type: 'volunteer', description: 'Beach cleanup with the school service club', status: 'rejected', reviewed_by: IDS.mentor },
    { id: '52000000-0000-4000-8000-000000000007', member_id: memberId('c9'), date: laAddDays(now, -6), hours: 2.5, type: 'build', description: 'Worked on the bumpers at home', status: 'pending' },
  ]
  const logged_hours_corrections = [
    { member_id: IDS.student2, entry_id: '52000000-0000-4000-8000-000000000004', note: 'It was two hours, I also proofread the sponsor section.', proposed_type: null, proposed_hours: 2, proposed_date: null, status: 'pending', created_at: iso(laAt(now, -3, 20)) },
  ]
  const hour_adjustments = [
    { member_id: IDS.student, category: 'build', hours: 1.5, reason: 'Stayed after the scrimmage to pack the trailer (no tag at the venue).', created_by: IDS.mentor, created_at: iso(laAt(now, -18, 11)) },
    { member_id: memberId('c4'), category: 'outreach', hours: -1, reason: 'Duplicate entry for the fair demo.', created_by: IDS.admin, created_at: iso(laAt(now, -8, 15)) },
  ]
  const hour_goals = [
    { member_id: null, season_id: current.id, target_hours: 60, categories: null, updated_by: IDS.admin, updated_at: iso(laAt(now, -60, 9)) },
    { member_id: IDS.student2, season_id: current.id, target_hours: 40, categories: ['build', 'outreach'], updated_by: IDS.admin, updated_at: iso(laAt(now, -30, 9)) },
  ]

  // ── Skills and certifications ─────────────────────────────────────────────
  const skillDefs = [
    ['Band saw', 'Machining', true], ['Drill press', 'Machining', true], ['Lathe', 'Machining', true], ['Mill', 'Machining', true],
    ['Soldering', 'Electrical', false], ['Crimping and wiring', 'Electrical', false], ['Battery handling', 'Electrical', true],
    ['Git basics', 'Software', false], ['WPILib commands', 'Software', false], ['Onshape assemblies', 'CAD', false],
    ['Pit safety', 'Competition', true], ['Scouting app', 'Competition', false],
  ]
  const skills = skillDefs.map(([name, category, safety_critical], i) => ({
    id: `60000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name, category, safety_critical, sort_order: i,
    description: safety_critical ? 'Safety-critical: a mentor signs this off in person.' : null,
  }))
  const sk = Object.fromEntries(skills.map((s) => [s.name, s.id]))
  const member_skills = []
  const cert = (member, skill, status = 'certified', by = IDS.mentor, daysAgo = 30) => member_skills.push({
    member_id: member, skill_id: sk[skill], status, certified_by: status === 'certified' ? by : null,
    certified_at: status === 'certified' ? iso(laAt(now, -daysAgo, 16)) : null, updated_at: iso(laAt(now, -daysAgo, 16)),
  })
  cert(IDS.student, 'Band saw'); cert(IDS.student, 'Drill press', 'certified', IDS.mentor, 12); cert(IDS.student, 'Onshape assemblies', 'certified', IDS.admin, 50); cert(IDS.student, 'Lathe', 'in_progress', null, 3)
  cert(IDS.student2, 'Git basics'); cert(IDS.student2, 'WPILib commands', 'certified', IDS.mentor, 8); cert(IDS.student2, 'Scouting app', 'in_progress', null, 2)
  cert(IDS.lead, 'Soldering'); cert(IDS.lead, 'Crimping and wiring'); cert(IDS.lead, 'Battery handling', 'certified', IDS.mentor, 40)
  cert(memberId('c4'), 'Band saw'); cert(memberId('c4'), 'Mill', 'certified', IDS.mentor, 20)
  cert(memberId('c6'), 'Soldering', 'certified', IDS.mentor, 10)
  cert(memberId('c9'), 'Pit safety', 'certified', IDS.admin, 25)
  cert(IDS.exempt, 'Crimping and wiring', 'in_progress', null, 5)
  const cert_requests = [
    { member_id: IDS.student2, skill_id: sk['Soldering'], note: 'Did the practice board with Robin last week.', status: 'pending', created_at: iso(laAt(now, -1, 17)) },
    { member_id: memberId('c7'), skill_id: sk['Band saw'], note: null, status: 'approved', reviewed_by: IDS.mentor, reviewed_at: iso(laAt(now, -9, 16)), created_at: iso(laAt(now, -10, 16)) },
  ]
  const disciplines = [
    ['CAD & Design', 'Build / Mechanical'], ['Machining & Fabrication', 'Build / Mechanical'], ['Welding', 'Build / Mechanical'], ['3D Printing', 'Build / Mechanical'],
    ['Mechanisms', 'Build / Mechanical'], ['Drivetrain', 'Build / Mechanical'], ['Pneumatics', 'Build / Mechanical'], ['Wiring & Electrical', 'Electrical / Software'],
    ['Programming', 'Electrical / Software'], ['Controls & Sensors', 'Electrical / Software'], ['Vision & Autonomous', 'Electrical / Software'], ['Drive Team', 'Competition'],
    ['Pit Crew', 'Competition'], ['Scouting', 'Competition'], ['Strategy & Match Analysis', 'Competition'], ['Safety', 'Competition'],
    ['Outreach & Community', 'Off-field'], ['Media & Design', 'Off-field'], ['Business & Sponsorship', 'Off-field'], ['Engineering Notebook / Impact', 'Off-field'],
  ].map(([name, category], i) => ({ id: `61000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name, category, sort_order: i }))
  profiles.find((p) => p.id === IDS.student).disciplines = ['Drivetrain', 'CAD & Design']
  profiles.find((p) => p.id === IDS.student2).disciplines = ['Programming', 'Vision & Autonomous']

  // ── Jobs ──────────────────────────────────────────────────────────────────
  const taskDefs = [
    ['Rebuild the swerve module gearboxes', 'Mechanical', 'open', 2, 6, ['Band saw', 'Drill press']],
    ['Wire the practice bot PDH', 'Electrical', 'open', 1, 3, ['Crimping and wiring']],
    ['Autonomous path for the two-piece routine', 'Programming', 'open', null, 10, []],
    ['CAD the new intake roller bracket', 'CAD', 'open', 1, -2, ['Onshape assemblies']],
    ['Cut bumper plywood', 'Fabrication', 'open', 2, 5, ['Band saw']],
    ['Sponsor thank-you posters', 'Business/Outreach', 'closed', 3, null, []],
    ['Pit cart lighting', 'Field & Pit', 'completed', 1, -10, []],
    ['Scouting sheet for SoCal Showdown', 'Strategy and Scouting', 'open', 3, 7, ['Scouting app']],
  ]
  const tasks = taskDefs.map(([title, subteam, status, max, dueIn, reqs], i) => ({
    id: `70000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    title, subteam, status, max_claimants: max,
    description: `${title}. Check the reference links before starting and post progress as you go.`,
    due_date: dueIn == null ? null : laAddDays(now, dueIn),
    created_by: i % 3 === 0 ? IDS.mentor : IDS.lead,
    created_at: iso(laAt(now, -14 + i, 16)), updated_at: iso(laAt(now, -2, 16)),
    completed_at: status === 'completed' ? iso(laAt(now, -9, 17)) : null,
    links: i === 0 ? [{ label: 'Gearbox drawing', url: 'https://example.com/gearbox' }] : [],
    images: [],
    _reqs: reqs,
  }))
  const task_required_skills = tasks.flatMap((t) => t._reqs.map((name) => ({ task_id: t.id, skill_id: sk[name] })))
  for (const t of tasks) delete t._reqs
  const T = (i) => tasks[i].id
  const task_claims = [
    { task_id: T(0), member_id: IDS.student, status: 'claimed', claimed_at: iso(laAt(now, -3, 16)) },
    { task_id: T(0), member_id: memberId('c4'), status: 'claimed', claimed_at: iso(laAt(now, -3, 17)) },
    { task_id: T(3), member_id: IDS.student, status: 'submitted', claimed_at: iso(laAt(now, -9, 16)), submitted_at: iso(laAt(now, -1, 18)) },
    { task_id: T(2), member_id: IDS.student2, status: 'claimed', claimed_at: iso(laAt(now, -5, 16)) },
    { task_id: T(6), member_id: memberId('ca'), status: 'completed', claimed_at: iso(laAt(now, -14, 16)), submitted_at: iso(laAt(now, -10, 16)), verified_by: IDS.mentor, verified_at: iso(laAt(now, -9, 17)) },
    { task_id: T(7), member_id: memberId('c9'), status: 'submitted', claimed_at: iso(laAt(now, -4, 16)), submitted_at: iso(laAt(now, -2, 16)) },
  ]
  const task_updates = [
    { task_id: T(0), member_id: IDS.student, body: 'Pulled the first two modules apart. One bearing is cracked; spare is in bin B4.', created_at: iso(laAt(now, -2, 17)) },
    { task_id: T(0), member_id: IDS.mentor, body: 'Good catch. Order two more bearings before Thursday.', created_at: iso(laAt(now, -2, 18)) },
    { task_id: T(3), member_id: IDS.student, body: 'Bracket v2 uploaded, ready for review.', created_at: iso(laAt(now, -1, 18)) },
  ]

  // ── Study ─────────────────────────────────────────────────────────────────
  const study_sessions = []
  for (let d = 0; d < 14; d += 1) {
    // Sam: a live streak with one bridged gap (day 4) and one short day (day 6).
    if (d !== 3) study_sessions.push({ member_id: IDS.student, date: laAddDays(now, -d - 1), minutes: d === 5 ? 30 : 70, note: d % 5 === 0 ? 'Gear ratios chapter' : null })
    if (d % 2 === 0) study_sessions.push({ member_id: IDS.student2, date: laAddDays(now, -d), minutes: 60, note: 'Command-based tutorial' })
    if (d < 4) study_sessions.push({ member_id: memberId('c5'), date: laAddDays(now, -d), minutes: 30 + d * 10, note: null })
  }

  // ── Squad ─────────────────────────────────────────────────────────────────
  const positions = ['Drive Coach', 'Driver', 'Operator', 'Human Player', 'Pit Boss', 'Safety Captain', 'Team Captain', 'Lead Mechanical', 'Lead Electrical', 'Lead Programmer', 'Scouting Lead', 'Strategy Lead', 'Awards/Impact Lead', 'Media Lead']
    .map((name, i) => ({ id: `62000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, name, target_count: name === 'Pit Boss' ? 2 : 1, sort_order: i, description: null }))
  const P = Object.fromEntries(positions.map((p) => [p.name, p.id]))
  const position_assignments = [
    [P['Drive Coach'], IDS.mentor], [P['Driver'], memberId('c9')], [P['Operator'], IDS.student2], [P['Pit Boss'], memberId('ca')],
    [P['Lead Electrical'], IDS.lead], [P['Lead Mechanical'], memberId('c4')], [P['Lead Programmer'], memberId('cb')], [P['Media Lead'], memberId('c8')],
  ].map(([position_id, member_id]) => ({ position_id, member_id, assigned_by: IDS.admin, assigned_at: iso(laAt(now, -40, 12)) }))

  // ── Access, parents, applications ─────────────────────────────────────────
  const access_requests = [
    { email: 'jordan.guest@example.com', full_name: 'Jordan Guest', requested_role: 'parent', note: 'Parent of Avery, would like to see the schedule.', status: 'pending', created_at: iso(laAt(now, -1, 20)) },
    { email: PERSONAS.pending.email, full_name: PERSONAS.pending.name, requested_role: 'student', note: 'Transfer student, starting this week.', status: 'pending', created_at: iso(laAt(now, 0, 7)) },
    { email: 'old.guest@example.com', full_name: 'Morgan Visitor', requested_role: 'mentor', note: null, status: 'approved', reviewed_by: IDS.admin, reviewed_at: iso(laAt(now, -20, 9)), created_at: iso(laAt(now, -21, 9)) },
  ]
  const approved_emails = [{ email: 'old.guest@example.com', granted_role: 'mentor', added_by: IDS.admin }]
  const guardian_links = [{ parent_id: IDS.parent, student_id: IDS.student, created_by: IDS.admin, created_at: iso(laAt(now, -60, 9)) }]
  const parent_link_requests = [
    { parent_id: IDS.parent, student_id: IDS.student2, note: 'Riley is my nephew, I drive him to competitions.', status: 'pending', created_at: iso(laAt(now, -2, 21)) },
  ]
  const appRow = (id, p, extra = {}) => ({
    id, member_id: p.id, season_id: current.id, submitted_at: iso(laAt(now, -25, 19)),
    legal_first_name: p.full_name.split(' ')[0], legal_last_name: p.full_name.split(' ').slice(1).join(' ') || 'Fixture',
    student_phone: '5555550100', pathway: pick(['CSEE', 'MSET', 'MAT', 'IDEA', 'ACE', 'BMET']), returning_member: rand() < 0.6,
    seasons_on_team: 1, prior_robotics: ['FLL'], programming_languages: [], cad_tools: [], hands_on_experience: [], certifications_claimed: null,
    subteam_first: p.subteams[0] ?? 'Mechanical', subteam_second: p.subteams[1] ?? (p.subteams[0] === 'Programming' ? 'CAD' : 'Programming'), subteam_third: null,
    subteam_rationale: 'I want to learn how the robot is built end to end.',
    monday_lunch: 'Yes', tuesday_after_school: 'Yes', friday_after_school: 'Sometimes', transport_after_5pm: 'Parent pickup',
    seasonal_conflicts: [], conflict_detail: null, fll_volunteering_interest: null, build_season_acknowledged: true,
    parent_name: 'Fixture Parent', parent_email: 'parent.fixture@example.com', parent_phone: '5555550199',
    parent_two_name: null, parent_two_contact: null, dietary_restrictions: null,
    emergency_contact_name: 'Fixture Guardian', emergency_contact_phone: '5555550188',
    discord_username: `${(p.nickname ?? p.full_name.split(' ')[0]).toLowerCase()}_5669`, discord_server_confirmed: rand() < 0.7, conduct_acknowledged: true,
    ...extra,
  })
  // Every student persona owes nothing for the current season, or App.jsx's
  // application gate would swallow every route they open.
  const member_applications = students.map((p) => appRow(
    p.id === IDS.student ? CORE_IDS.appStudent : p.id === IDS.student2 ? CORE_IDS.appStudent2 : undefined,
    p,
    p.id === IDS.student ? { parent_name: PERSONAS.parent.name, parent_email: PERSONAS.parent.email, pathway: 'MSET', returning_member: true, parent_token: PARENT_TOKEN } : {},
  )).map((r) => (r.id ? r : (({ id, ...rest }) => rest)(r)))
  const parent_responses = [
    { application_id: CORE_IDS.appStudent, weekend_supervision: 'saturdays', meal_support: 'yes', travel_driving: 'maybe', employer_name: 'Harbor Machine Works', employer_contact_consent: true, donation_offer: 'Can lend a pickup truck for the trailer.', submitted_at: iso(laAt(now, -24, 20)) },
  ]

  // ── Feedback ──────────────────────────────────────────────────────────────
  const feedback = [
    { member_id: IDS.student, category: 'bug', message: 'The Check Out button took two taps yesterday before it flipped.', image_paths: ['member/c1/fixture-screenshot.png'], route: '/dashboard', viewport: '390x844', user_agent: 'Mozilla/5.0 (iPhone; fixture)', status: 'open', created_at: iso(laAt(now, -1, 18, 40)) },
    { member_id: IDS.student2, category: 'idea', message: 'Could the schedule show which subteams are needed at each build session?', image_paths: [], route: '/schedule', viewport: '1440x900', user_agent: 'Mozilla/5.0 (fixture)', status: 'open', created_at: iso(laAt(now, -3, 21)) },
    { member_id: memberId('c4'), category: 'feedback', message: 'Jobs page is great, the cert coverage badge helps a lot.', image_paths: [], route: '/jobs', viewport: '412x915', user_agent: 'Mozilla/5.0 (Android; fixture)', status: 'reviewed', reviewed_by: IDS.admin, reviewed_at: iso(laAt(now, -4, 9)), created_at: iso(laAt(now, -6, 19)) },
  ]

  // ── Surveys ───────────────────────────────────────────────────────────────
  const surveys = [
    { id: CORE_IDS.surveyPast, title: 'Week of Sep 21', opens_at: null, closes_at: iso(laAt(now, -4, 23, 59)), is_open: false, created_by: IDS.mentor, created_at: iso(laAt(now, -11, 9)) },
    { id: CORE_IDS.surveyOpen, title: 'Week of Sep 28', opens_at: null, closes_at: null, is_open: true, created_by: IDS.mentor, created_at: iso(laAt(now, -4, 9)) },
  ]
  const qId = idMaker('31000000')
  const questionSet = (survey_id, rotating) => [
    { id: qId(), survey_id, position: 1, kind: 'single', prompt: 'Which subteam are you on right now?', options: ['Mechanical', 'Electrical', 'Programming', 'CAD', 'Business/Outreach', 'Strategy and Scouting'], required: true },
    { id: qId(), survey_id, position: 2, kind: 'multi', prompt: 'What do you want covered in training this week?', options: ['Machining', 'Wiring', 'Git', 'Scouting', 'Driving'], required: false },
    { id: qId(), survey_id, position: 3, kind: 'text', prompt: 'What is blocking you?', options: [], required: false },
    { id: qId(), survey_id, position: 4, kind: 'scale', prompt: 'How was this week overall?', options: ['1', '2', '3', '4', '5'], required: false },
    { id: qId(), survey_id, position: 5, kind: 'single', prompt: rotating, options: ['Yes', 'No', 'Not sure'], required: true },
  ]
  const survey_questions = [
    ...questionSet(CORE_IDS.surveyPast, 'Can you help at the fair demo?'),
    ...questionSet(CORE_IDS.surveyOpen, 'Can you make SoCal Showdown?'),
  ]
  const survey_responses = []
  const survey_answers = []
  const respond = (survey, member, answers, daysAgo) => {
    const rid = `32000000-0000-4000-8000-${String(survey_responses.length + 1).padStart(12, '0')}`
    survey_responses.push({ id: rid, survey_id: survey, member_id: member, submitted_at: iso(laAt(now, -daysAgo, 19)) })
    const qs = survey_questions.filter((q) => q.survey_id === survey)
    answers.forEach((v, i) => { if (v != null) survey_answers.push({ response_id: rid, question_id: qs[i].id, value: v }) })
  }
  respond(CORE_IDS.surveyOpen, IDS.student2, ['Programming', ['Git', 'Scouting'], 'Waiting on the roboRIO image.', '4', 'Yes'], 1)
  respond(CORE_IDS.surveyOpen, memberId('c4'), ['Mechanical', ['Machining'], null, '5', 'Yes'], 2)
  respond(CORE_IDS.surveyOpen, memberId('c8'), ['Business/Outreach', null, 'Need sponsor logos from the mentors.', '3', 'Not sure'], 2)
  respond(CORE_IDS.surveyPast, IDS.student, ['Mechanical', ['Machining', 'Driving'], null, '4', 'Yes'], 8)
  respond(CORE_IDS.surveyPast, IDS.student2, ['Programming', ['Git'], 'Laptop battery.', '3', 'No'], 8)

  // ── Settings ──────────────────────────────────────────────────────────────
  const app_settings = [
    { key: 'study_daily_goal_minutes', value: '60' },
    { key: 'auto_close_cutoff', value: '22:00' },
  ]
  const allowed_domains = [{ domain: 'boscotech.edu' }, { domain: 'boscotech.net' }]

  return {
    __users,
    profiles, member_roles, seasons, events, event_signups,
    attendance_events, session_reviews, attendance_audit, session_corrections,
    logged_hours, logged_hours_corrections, hour_adjustments, hour_goals,
    skills, member_skills, cert_requests, disciplines,
    tasks, task_required_skills, task_claims, task_updates,
    study_sessions, positions, position_assignments,
    access_requests, approved_emails, guardian_links, parent_link_requests,
    member_applications, parent_responses, feedback,
    surveys, survey_questions, survey_responses, survey_answers,
    app_settings, allowed_domains,
    // Referenced by the stale-session anomaly docs/tests.
    __meta: [{ id: 'core', staleCheckinId: stale.id }],
  }
}
