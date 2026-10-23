// Meet a team (migration 0035, ledger 0026). Pure: the page, the fixture and
// tests/meet-team-*.test.js read the same rules. No React, no Supabase.
//
// Every member goes out at a competition, talks to another team, and writes
// down what that team does well, how they are organized, what they offer and
// one thing we should copy. The chip vocabularies below are the SAME lists as
// the CHECK constraints on team_connections.org_tags / resource_tags in
// supabase/migrations/0035_meet_a_team.sql; tests/meet-team-form.test.js holds
// the two equal.

export const ORG_TAGS = Object.freeze([
  ['student_led', 'Student-led'], ['mentor_led', 'Mentor-led'], ['subteams', 'Subteams'], ['captains', 'Captains'],
  ['business_team', 'Business team'], ['outreach_team', 'Outreach team'], ['scouting_team', 'Scouting team'], ['strategy_team', 'Strategy team'],
])
export const RESOURCE_TAGS = Object.freeze([
  ['shared_cad_code', 'CAD or code they share'], ['mentoring', 'Mentoring'], ['machining', 'Machining help'], ['spare_parts', 'Spare parts'],
  ['sponsor_contacts', 'Sponsorship contacts'], ['outreach_events', 'Outreach events'], ['training_material', 'Training material'],
])
export const CONTACT_ROLES = Object.freeze([['student', 'Student'], ['mentor', 'Mentor'], ['lead', 'Lead']])
const LABEL = Object.fromEntries([...ORG_TAGS, ...RESOURCE_TAGS, ...CONTACT_ROLES])
export const tagLabel = (k) => LABEL[k] ?? k

export const LIMITS = Object.freeze({ text: 1000, name: 120, email: 200, discord: 100, social: 200 })

export function emptyForm() {
  return {
    team_number: '', team_name: '',
    contact_name: '', contact_role: '', contact_email: '', contact_discord: '', contact_social: '',
    does_well: '', org_tags: [], org_note: '', resource_tags: [], resource_note: '',
    copy_this: '', follow_up: false, follow_up_note: '',
  }
}

/** A saved connection (from meet_team_event) back into the form's shape, for editing. */
export function formFromConnection(c) {
  const k = c?.contact ?? {}
  return {
    ...emptyForm(),
    team_number: String(c?.team_number ?? ''), team_name: c?.team_name ?? '',
    contact_name: k.name ?? '', contact_role: k.role ?? '', contact_email: k.email ?? '', contact_discord: k.discord ?? '', contact_social: k.social ?? '',
    does_well: c?.does_well ?? '', org_tags: [...(c?.org_tags ?? [])], org_note: c?.org_note ?? '',
    resource_tags: [...(c?.resource_tags ?? [])], resource_note: c?.resource_note ?? '',
    copy_this: c?.copy_this ?? '', follow_up: !!c?.follow_up, follow_up_note: c?.follow_up_note ?? '',
  }
}

const blank = (s) => !String(s ?? '').trim()

/**
 * The form's errors, keyed by field. Empty object = ready to save. Mirrors
 * team_connection_save's refusals so a student hears them before a round trip.
 */
export function validateConnection(f) {
  const e = {}
  const n = Number(String(f?.team_number ?? '').trim())
  if (!Number.isInteger(n) || n < 1 || n > 99999) e.team_number = 'Pick the team number.'
  if (blank(f?.does_well)) e.does_well = 'Say what they do well.'
  if (blank(f?.copy_this)) e.copy_this = 'Name one thing we should copy.'
  for (const k of ['does_well', 'copy_this', 'org_note', 'resource_note', 'follow_up_note']) {
    if (String(f?.[k] ?? '').length > LIMITS.text) e[k] = `Keep it under ${LIMITS.text} characters.`
  }
  if (f?.contact_role && !CONTACT_ROLES.some(([k]) => k === f.contact_role)) e.contact_role = 'Their role is student, mentor or lead.'
  if (!blank(f?.contact_email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(f.contact_email).trim())) e.contact_email = 'That email does not look right.'
  if ((f?.org_tags ?? []).some((t) => !ORG_TAGS.some(([k]) => k === t))) e.org_tags = 'Unknown chip.'
  if ((f?.resource_tags ?? []).some((t) => !RESOURCE_TAGS.some(([k]) => k === t))) e.resource_tags = 'Unknown chip.'
  return e
}

/** The arguments team_connection_save takes. */
export function saveArgs(f, eventId, id = null) {
  const t = (s) => (blank(s) ? null : String(s).trim())
  return {
    p_id: id, p_event: eventId, p_team: Number(String(f.team_number).trim()), p_team_name: t(f.team_name),
    p_contact: { name: t(f.contact_name), role: t(f.contact_role), email: t(f.contact_email), discord: t(f.contact_discord), social: t(f.contact_social) },
    p_does_well: t(f.does_well), p_org_tags: [...(f.org_tags ?? [])], p_org_note: t(f.org_note),
    p_resource_tags: [...(f.resource_tags ?? [])], p_resource_note: t(f.resource_note),
    p_copy: t(f.copy_this), p_follow_up: !!f.follow_up, p_follow_up_note: f.follow_up ? t(f.follow_up_note) : null,
  }
}

export const toggle = (list, key) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key])

/** Connections grouped by team number, ascending, filtered by a search string over every text field. */
export function groupByTeam(connections, query = '') {
  const q = String(query ?? '').trim().toLowerCase()
  const hay = (c) => [c.team_number, c.team_name, c.logged_by, c.does_well, c.org_note, c.resource_note, c.copy_this, c.follow_up_note,
    ...(c.org_tags ?? []).map(tagLabel), ...(c.resource_tags ?? []).map(tagLabel), c.contact?.name].filter(Boolean).join(' ').toLowerCase()
  const groups = new Map()
  for (const c of connections ?? []) {
    if (q && !hay(c).includes(q)) continue
    const g = groups.get(c.team_number) ?? { team_number: c.team_number, team_name: '', notes: [] }
    if (!g.team_name && c.team_name) g.team_name = c.team_name
    g.notes.push(c)
    groups.set(c.team_number, g)
  }
  return [...groups.values()].sort((a, b) => a.team_number - b.team_number)
}

// ── Give everyone a slot ───────────────────────────────────────────────
// The SAME rule as staff_meet_team_fill in 0035 (a duplicate on purpose: the
// fixture needs it in the browser and this file is what the unit tests
// drive; 0035_meet_a_team_rls_test.sql holds the SQL copy to the same
// outcomes). Change both.
//
// slots:    [{ id, label, starts_at, ends_at, position, needed, assigned }]
//           (Meet a team slots not yet over; assigned = meet_team boxes
//           already assigned)
// students: [{ member_id, name }] every active student WITHOUT an assigned
//           meet_team box at this event
// busy:     [{ member_id, starts_at, ends_at }] every slot where a student
//           holds another ASSIGNED role (a slot with no end is one hour)
// -> { placed: [{ member_id, name, slot_id, label, starts_at, ends_at }], unplaced: [{ member_id, name, reason }] }
const HOUR = 3600e3
const end = (s) => (s.ends_at ? Date.parse(s.ends_at) : Date.parse(s.starts_at) + HOUR)
const overlaps = (a, b) => Date.parse(a.starts_at) < end(b) && end(a) > Date.parse(b.starts_at)

export function planMeetTeam({ slots = [], students = [], busy = [] } = {}) {
  const live = slots.filter((s) => Number(s.needed) > 0)
  const load = new Map(live.map((s) => [s.id, Number(s.assigned) || 0]))
  const freeFor = (m) => live.filter((s) => !busy.some((b) => b.member_id === m.member_id && overlaps(b, s)))
  const order = students.map((m) => ({ ...m, free: freeFor(m) }))
    .sort((a, b) => a.free.length - b.free.length || String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase()) || String(a.member_id).localeCompare(String(b.member_id)))
  const placed = []
  const unplaced = []
  for (const m of order) {
    if (!live.length) { unplaced.push({ member_id: m.member_id, name: m.name, reason: 'This event has no Meet a team boxes yet.' }); continue }
    if (!m.free.length) { unplaced.push({ member_id: m.member_id, name: m.name, reason: 'Holds another role in every Meet a team slot.' }); continue }
    const pick = [...m.free].sort((a, b) => load.get(a.id) / a.needed - load.get(b.id) / b.needed || load.get(a.id) - load.get(b.id)
      || Date.parse(a.starts_at) - Date.parse(b.starts_at) || (a.position ?? 0) - (b.position ?? 0) || String(a.id).localeCompare(String(b.id)))[0]
    load.set(pick.id, load.get(pick.id) + 1)
    placed.push({ member_id: m.member_id, name: m.name, slot_id: pick.id, label: pick.label, day: pick.day ?? null, starts_at: pick.starts_at, ends_at: pick.ends_at ?? null })
  }
  return { placed, unplaced }
}

// ── The draft ──────────────────────────────────────────────────────────
// The form in progress survives a dropped connection or a closed tab:
// localStorage per member and event, every access wrapped (a private window
// or blocked storage just means no draft).
export const draftKey = (uid, eventId) => `techmen:meet-team-draft:${uid}:${eventId}`
export function readDraft(uid, eventId, storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage?.getItem(draftKey(uid, eventId)) || 'null')
    return v && typeof v === 'object' && v.form ? v : null
  } catch { return null }
}
export function writeDraft(uid, eventId, value, storage = globalThis.localStorage) {
  try { storage?.setItem(draftKey(uid, eventId), JSON.stringify(value)); return true } catch { return false }
}
export function clearDraft(uid, eventId, storage = globalThis.localStorage) {
  try { storage?.removeItem(draftKey(uid, eventId)) } catch { /* nothing to clear */ }
}
/** A draft worth keeping: anything typed beyond the empty form. */
export const draftHasContent = (f) => !!f && Object.entries(emptyForm()).some(([k, v]) => JSON.stringify(f[k] ?? v) !== JSON.stringify(v))
