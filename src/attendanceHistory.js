// One member's attendance history: the stored sessions behind their hours,
// grouped by day. Shared by the Team Hours drill-down (HoursBoard) and the staff
// name-click on the presence board (/display, PresenceBoard), so the two can
// never disagree about which sessions a day holds or what they add up to.
//
// Pure module: no React, no Supabase, so tests/attendance-history.test.js drives
// it directly. Every session comes from sessionsFromEvents, so each time shown
// is a stored attendance_events instant (only the duration is capped), never a
// recomputed or fabricated one.

import { sessionsFromEvents, emptyBreakdown } from './hoursUtils'
import { resolveCurrentSeason } from './seasons'

// ── Who may open a history from /display ─────────────────────────────────────
// A UI RULE, NOT A DATA BOUNDARY. The "attendance read all members" policy
// (platform_migration.sql) is `select to authenticated using (true)`, so every
// signed-in member can already read every attendance_events row, and the Team
// Hours drill-down already shows any member's sessions to any member. /display
// limits the name-click to staff because the board may be a shared screen in
// the shop; nothing about the data changes. Same role set as is_staff() and
// App.jsx's isStaffUser -- a parent who also holds a staff role is staff.
export const STAFF_ROLES = Object.freeze(['mentor', 'lead', 'admin'])

export function canOpenHistory(hasRole) {
  if (typeof hasRole !== 'function') return false
  return STAFF_ROLES.some(r => hasRole(r) === true)
}

// ── The period a history covers ──────────────────────────────────────────────
// The season Team Hours opens on: the season spanning today, else the most
// recent one (callers pass seasons ordered start_date DESC, as HoursBoard
// loads them), else none (null = all time). HoursBoard's default tab and the
// /display history both read this, so they open on the same period.
export function defaultHistorySeason(seasons) {
  if (!seasons?.length) return null
  return resolveCurrentSeason(seasons) ?? seasons[0]
}

// A season row → the { start, end } window historyByDay filters on. end may be
// null (an open-ended season); null season → null range (all time).
export function seasonRange(season) {
  return season ? { start: season.start_date, end: season.end_date } : null
}

// ── Grouping ─────────────────────────────────────────────────────────────────
// The day a session belongs to: its IN instant's UTC calendar date. This is the
// SAME key the Team Hours matrix buckets by (attendanceHoursByDate reads
// event_time.slice(0, 10)), which is what lets a matrix cell click find exactly
// the sessions behind it. It is a UTC date, not an America/Los_Angeles one, so a
// check-in after 5 PM PDT (4 PM PST) files under the next calendar day; fixing
// that means moving the matrix and this key together, never this one alone.
export function sessionDayKey(session) {
  return session.inTime.toISOString().slice(0, 10)
}

export function dayInRange(day, range) {
  return !range || (day >= range.start && (range.end == null || day <= range.end))
}

/**
 * A member's sessions grouped by day.
 * @param {object[]} events  one member's attendance_events rows, any order
 *                           ({ id, type, event_time, location, category, manual_entry })
 * @param {{ day?: string|null, range?: {start,end}|null, excluded?: Set|null }} [opts]
 *        day      'YYYY-MM-DD' → only that day (a matrix cell); null → every day in range
 *        range    season window, ignored when day is set; null → all time
 *        excluded checkout ids under pending/voided session review
 * @returns {{ day: string, sessions: object[] }[]} newest day first; sessions in
 *          chronological order, each carrying `flagged` (its check-out is under review)
 */
export function historyByDay(events, { day = null, range = null, excluded = null } = {}) {
  const byDay = new Map()
  for (const s of sessionsFromEvents(events ?? [])) {
    const key = sessionDayKey(s)
    if (day ? key !== day : !dayInRange(key, range)) continue
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key).push({ ...s, flagged: !!(s.outId && excluded?.has(s.outId)) })
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([d, sessions]) => ({ day: d, sessions }))
}

// Category breakdown (+ grand total, in hours) of the sessions in a history,
// counting only those that count toward official hours (not flagged).
export function historyTotals(groups) {
  const t = emptyBreakdown()
  for (const { sessions } of groups ?? []) {
    for (const s of sessions) {
      if (s.flagged) continue
      const h = s.ms / 3600000
      t[s.category] = (t[s.category] ?? 0) + h
      t.total += h
    }
  }
  return t
}

// ── Formatting ───────────────────────────────────────────────────────────────
// A session instant as a wall-clock time in the shop's zone, whatever zone the
// viewing device is set to.
export function fmtSessionTime(d) {
  return d
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
    : '—'
}

// A 'YYYY-MM-DD' day key as "Thu, Oct 1". Parsed as local midnight and printed
// in local time, so it names the key's own calendar date in any zone.
export function fmtDayKey(key) {
  return new Date(key + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}
