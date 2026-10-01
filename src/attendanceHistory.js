// One member's attendance history: the stored sessions behind their hours,
// grouped by day. Shared by the Team Hours drill-down (HoursBoard) and the staff
// name-click on the presence board (/display, PresenceBoard), so the two can
// never disagree about which sessions a day holds or what they add up to.
//
// Pure module: no React, no Supabase, so tests/attendance-history.test.js drives
// it directly. Every session comes from sessionsFromEvents, so each time shown
// is a stored attendance_events instant (only the duration is capped), never a
// recomputed or fabricated one.

import { sessionsFromEvents, emptyBreakdown, isSessionCounted, laDateKey } from './hoursUtils'
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
// The day a session belongs to: its IN instant's America/Los_Angeles calendar
// date (laDateKey, the one day rule in hoursUtils), so a check-in at 8 PM PDT
// files under the day it happened on, not the next UTC date, and a session that
// runs past 5 PM PDT (00:00 UTC) stays one session on one day. The Team Hours
// matrix buckets by THIS function too (hoursByDay below), which is what lets a
// matrix cell click open exactly the sessions behind that cell: the two cannot
// disagree because there is only one key. It is the same LA date the By member
// totals put a session's season by (breakdownFromSessions), so the matrix row
// total and the By member total count the same sessions.
export function sessionDayKey(session) {
  return laDateKey(session.inTime)
}

// Hours per day for one member, from the same sessions and the same day key as
// historyByDay: every counted session (not under a pending/voided review),
// open ones counted up to now, capped, all categories. The Team Hours matrix
// is a coach timesheet of physical presence, so the category split lives in the
// By member table and the drill-down, not here. Returns { 'YYYY-MM-DD': hours }.
export function hoursByDay(events, excluded = null) {
  const out = {}
  for (const s of sessionsFromEvents(events ?? [])) {
    if (!isSessionCounted(s, excluded)) continue
    const key = sessionDayKey(s)
    out[key] = (out[key] ?? 0) + s.ms / 3600000
  }
  return out
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
