// Sign-out requests and meeting check-in (migration 0014), shared by the tag
// routes, the dashboard and the approver page. Small on purpose: the NFC fast
// path imports it. The Supabase client is passed in, so tests drive it with a
// stand-in.
//
// The handbook, Section 7: scan out and leave a note of what you did; the note
// asks to leave; hours stop when a mentor (or a student Mr. Pina permits)
// approves. Section 6: a scan in the first 15 minutes of a team meeting logs
// present, a later scan logs late, and a member already signed in who scans
// during the meeting keeps the session open.
//
// Before 0014 is pasted every helper here reports `legacy`, and the callers
// check out exactly as they always have.

import { isSchemaMissing } from './schemaMissing'

export const NOTE_MIN = 3
export const NOTE_MAX = 1000

export function noteProblem(note) {
  const n = String(note ?? '').trim()
  if (n.length < NOTE_MIN) return 'Write a short note of what you did.'
  if (n.length > NOTE_MAX) return `Keep the note under ${NOTE_MAX} characters.`
  return null
}

// The member's pending request, the last one sent back (with its reason), or
// legacy when 0014 is not there yet. -> { legacy, pending, returned }
export async function loadMySignout(client, uid) {
  const { data, error } = await client.from('signout_requests')
    .select('id, status, note, cleanup_confirmed, requested_at, decided_at, reason')
    .eq('member_id', uid)
    .in('status', ['pending', 'returned'])
    .order('requested_at', { ascending: false })
    .limit(2)
  if (error) {
    if (isSchemaMissing(error)) return { legacy: true, pending: null, returned: null }
    throw error
  }
  const rows = data ?? []
  return {
    legacy: false,
    pending: rows.find((r) => r.status === 'pending') ?? null,
    returned: rows[0]?.status === 'returned' ? rows[0] : null,
  }
}

// -> { mode: 'request', row } | { mode: 'legacy' }
export async function requestSignout(client, { note, cleanup, location, source = 'nfc' }) {
  const { data, error } = await client.rpc('request_signout', {
    p_note: String(note ?? '').trim(), p_cleanup: !!cleanup, p_location: location ?? null, p_source: source,
  })
  if (error) {
    if (isSchemaMissing(error)) return { mode: 'legacy' }
    throw error
  }
  return { mode: 'request', row: Array.isArray(data) ? data[0] : data }
}

export async function withdrawSignout(client) {
  const { error } = await client.rpc('withdraw_signout')
  if (error) throw error
}

// ── approvers ──────────────────────────────────────────────────────────────
export async function canApproveSignouts(client) {
  const { data, error } = await client.rpc('can_approve_signouts')
  if (error) return isSchemaMissing(error) ? null : false
  return data === true
}

export async function approveSignout(client, id) {
  const { error } = await client.rpc('approve_signout', { p_request: id })
  if (error) throw error
}

export async function approveAllSignouts(client) {
  const { data, error } = await client.rpc('approve_all_signouts')
  if (error) throw error
  return data ?? 0
}

export async function returnSignout(client, id, reason) {
  const { error } = await client.rpc('return_signout', { p_request: id, p_reason: reason ?? '' })
  if (error) throw error
}

// ── meeting check-in ───────────────────────────────────────────────────────
// The team meeting on right now, if any (events.kind 'meeting').
export async function liveMeeting(client, now = new Date()) {
  const iso = now.toISOString()
  const { data, error } = await client.from('events')
    .select('id, title, starts_at, ends_at')
    .eq('kind', 'meeting')
    .lte('starts_at', iso)
    .gte('ends_at', iso)
    .order('starts_at', { ascending: true })
    .limit(1)
  if (error) return null
  return data?.[0] ?? null
}

// The member's check-in for that meeting, or null; legacy when 0014 is missing.
export async function myMeetingCheckin(client, eventId, uid) {
  const { data, error } = await client.from('meeting_checkins')
    .select('status, scanned_at').eq('event_id', eventId).eq('member_id', uid).limit(1)
  if (error) return isSchemaMissing(error) ? { legacy: true } : null
  return data?.[0] ?? null
}

// -> { status: 'present' | 'late', scanned_at } | null (legacy or refused)
export async function meetingCheckin(client, eventId) {
  const { data, error } = await client.rpc('meeting_checkin', { p_event: eventId })
  if (error) return null
  return Array.isArray(data) ? data[0] ?? null : data
}

// The 15-minute window, for the screen's wording only; the server decides.
export const MEETING_WINDOW_MS = 15 * 60 * 1000
export function meetingWindowOpen(meeting, now = Date.now()) {
  const start = Date.parse(meeting?.starts_at)
  return Number.isFinite(start) && now >= start && now <= start + MEETING_WINDOW_MS
}

// ── FLL ────────────────────────────────────────────────────────────────────
// Switch to FLL: one call closes the build session (with credit) and opens the
// volunteer one. -> { mode: 'switch' } | { mode: 'legacy' }
export async function switchToFll(client, { location, geoOk, note = null }) {
  const { error } = await client.rpc('switch_to_fll', { p_location: location ?? null, p_geo_ok: geoOk ?? null, p_note: note })
  if (error) {
    if (isSchemaMissing(error)) return { mode: 'legacy' }
    throw error
  }
  return { mode: 'switch' }
}

// A direct OUT carrying the note (FLL sessions, and staff). Before 0014 the
// columns are not there, so the row is written without them.
export async function insertOutWithNote(client, row, { note, cleanup }) {
  const withNote = { ...row, note: String(note ?? '').trim() || null, cleanup_confirmed: cleanup ?? null }
  let { error } = await client.from('attendance_events').insert(withNote)
  if (error && isSchemaMissing(error)) ({ error } = await client.from('attendance_events').insert(row))
  if (error) throw error
}

// Staff close their own session directly (the server lets them); everyone
// else asks. Read from the member's own role rows.
export async function isStaffMember(client, uid) {
  const { data, error } = await client.from('member_roles').select('role').eq('member_id', uid)
  if (error) return false
  return (data ?? []).some((r) => ['mentor', 'lead', 'admin'].includes(r.role))
}
