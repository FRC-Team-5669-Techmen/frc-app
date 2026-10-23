// Member standing (migration 0015): the client side of the handbook's
// Sections 6, 11, 12 and 14. THE DATABASE DECIDES every standard, probation
// and removal (supabase/migrations/0015_member_standing.sql); this module
// only reads its answers, offers the actions it will accept, and words them.
// The Supabase client is passed in so tests drive it with a stand-in.

import { isSchemaMissing } from './schemaMissing.js'

export const ABSENCE_REASONS = Object.freeze([
  // Handbook Section 6: an emergency is your own illness or injury, or a
  // death, hospital stay or serious illness in your close family. A medical
  // visit is excused when asked 24 hours ahead, never as an emergency (0025).
  { key: 'illness', label: 'Illness or injury', emergency: true },
  { key: 'family_emergency', label: 'Family emergency (a death, hospital stay or serious illness)', emergency: true },
  { key: 'medical', label: 'Medical visit' },
  { key: 'school_event', label: 'Required school event' },
  { key: 'religious', label: 'Religious holiday' },
  { key: 'test_or_college', label: 'Test, major assignment or college application deadline' },
])
export const NEVER_EXCUSED = 'Plan other activities around team meetings.'

export const reasonLabel = (k) => ABSENCE_REASONS.find((r) => r.key === k)?.label ?? k

export const STANDING_LABEL = Object.freeze({ good: 'Good standing', probation: 'Probation', removed: 'Removed' })
export const KIND_LABEL = Object.freeze({ meetings: 'Meetings probation', hours: 'Hours probation', grades: 'Grades probation', removal: 'Removal' })
export const STATUS_LABEL = Object.freeze({
  open: 'Open', closed: 'Closed', failed: 'Failed', proposed: 'Waiting for Mr. Pina', removed: 'Removed', dismissed: 'Withdrawn',
})
export const DISCIPLINE_LABEL = Object.freeze({ verbal: 'Verbal warning', written: 'Written warning', suspension: 'Suspension', removal: 'Removal' })
export const INCIDENT_KINDS = Object.freeze([
  { key: 'injury', label: 'Injury' },
  { key: 'near_miss', label: 'Near miss' },
  { key: 'damaged_tool', label: 'Damaged tool' },
  { key: 'battery', label: 'Battery problem' },
])

// Meeting share the way the database counts it: attended minus every third
// late, against meetings that counted. Never rounded up.
export function meetingShare(m) {
  if (!m || !m.counted) return null
  const effective = m.attended - Math.floor((m.lates ?? 0) / 3)
  return { effective, counted: m.counted, ok: effective * 100 >= (m.pct ?? 80) * m.counted, pct: Math.floor((effective * 100) / m.counted) }
}

export const fmtHours = (h) => {
  const n = Number(h) || 0
  const hh = Math.floor(n)
  const mm = Math.round((n - hh) * 60)
  return mm ? `${hh}h ${mm}m` : `${hh}h`
}

function wrap(res) {
  if (res.error) return { state: isSchemaMissing(res.error) ? 'missing' : 'error', error: res.error, data: null }
  return { state: 'ok', error: null, data: res.data }
}

export async function loadStanding(client, memberId) {
  return wrap(await client.rpc('member_standing', { p_member: memberId }))
}

export async function loadOverview(client) {
  return wrap(await client.rpc('staff_standing_overview'))
}

// Upcoming events an absence request can name: team meetings and mandatory
// events from 2 days ago (an emergency is filed after) to 60 days ahead.
export async function loadAbsenceEvents(client, now = new Date()) {
  const from = new Date(now.getTime() - 2 * 86400000).toISOString()
  const to = new Date(now.getTime() + 60 * 86400000).toISOString()
  const { data, error } = await client.from('events').select('id, title, kind, starts_at, ends_at, mandatory')
    .gte('starts_at', from).lte('starts_at', to).order('starts_at')
  if (error) return []
  return (data ?? []).filter((e) => e.kind === 'meeting' || e.kind === 'competition' || e.mandatory)
}

// What the request form says before it is sent; the server has the last word.
export function absenceProblem(event, { reason, emergency }, now = Date.now()) {
  if (!event) return 'Pick the meeting or event.'
  if (!reason) return 'Pick a reason.'
  const starts = Date.parse(event.starts_at)
  const mandatory = event.mandatory || event.kind === 'competition'
  if (emergency) {
    if (!ABSENCE_REASONS.find((r) => r.key === reason)?.emergency) return 'An emergency is your own illness or injury, or a death, hospital stay or serious illness in your close family.'
    return null
  }
  if (mandatory && !(reason === 'religious' && starts - now >= 14 * 86400000)) {
    return 'Only an emergency excuses a mandatory event. A religious holiday is asked 14 days ahead.'
  }
  if (starts - now < 24 * 3600000) return 'Ask at least 24 hours ahead, or tick Emergency.'
  return null
}

export async function requestAbsence(client, { eventId, reason, note, emergency }) {
  const { data, error } = await client.rpc('request_absence', { p_event: eventId, p_reason: reason, p_note: note ?? null, p_emergency: !!emergency })
  if (error) throw error
  return data
}

export const rpc = async (client, name, args) => {
  const { data, error } = await client.rpc(name, args)
  if (error) throw error
  return data
}

export function errText(err) {
  const m = err?.message || 'Not done'
  return err?.code ? `${m} (${err.code})` : m
}
