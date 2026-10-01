// Shared bucketing logic for MyHoursPage and HoursBoard.

import {
  CATEGORIES, DEFAULT_CATEGORY, categoryLabel, categoryColor,
  normAttendanceCategory, loggedTypeToCategory, emptyBreakdown,
} from './categories'

// Re-export so the hours displays keep importing everything from one module.
export { CATEGORIES, DEFAULT_CATEGORY, categoryLabel, categoryColor, loggedTypeToCategory, emptyBreakdown }

// ── Forgot-to-sign-out cap ──────────────────────────────────────────────────
// Sessions are DERIVED (IN/OUT pairing), so we cap at derivation time rather
// than writing synthetic events. A session is clamped to a maximum duration; a
// still-active session UNDER the cap stays live and uncapped (someone who is
// legitimately checked in right now). The cap only bites once a session goes
// stale (open past the cap) or a closed pair exceeds it.
// The one knob to change: the max hours a single derived session can bank. A
// forgotten/missing sign-out is clamped to this so it can't run away.
export const MAX_SESSION_HOURS = 10                          // config constant — change here
export const MAX_SESSION_MS    = MAX_SESSION_HOURS * 60 * 60 * 1000

/**
 * Apply the forgot-to-sign-out cap to one session.
 * @param {Date}   inTime  - the IN event time
 * @param {Date?}  outTime - the OUT event time, or null for a still-open session
 * @param {{maxMs?:number, eventEnd?:Date|null}} [opts]
 *        eventEnd: if the session ties to a calendar event, the clamp end is
 *        min(eventEnd, IN + maxMs) — so a short event can't credit a full cap.
 * @returns {{ ms, wasCapped, effectiveEnd }} effectiveEnd is the clamped end
 *        used for ms (the real outTime when uncapped, null for a live open one).
 */
export function cappedSession(inTime, outTime, { maxMs = MAX_SESSION_MS, eventEnd = null } = {}) {
  const start  = inTime.getTime()
  const rawEnd = (outTime ?? new Date()).getTime()
  let capEnd = start + maxMs
  if (eventEnd) capEnd = Math.min(capEnd, eventEnd.getTime())
  if (rawEnd > capEnd) {
    return { ms: Math.max(0, capEnd - start), wasCapped: true, effectiveEnd: new Date(capEnd) }
  }
  return { ms: Math.max(0, rawEnd - start), wasCapped: false, effectiveEnd: outTime ?? null }
}

// Pair a member's raw in/out events into discrete sessions, newest concerns
// handled by the caller. Returns
// [{ inTime, outTime|null, ms, open, inId, outId, inLoc, outLoc, category,
//    manual, wasCapped, effectiveOut }] in chronological order. inLoc/outLoc are
// the entrance/exit used (attendance_events.location); null when absent. ms is
// the CAPPED duration (see cappedSession); wasCapped flags a clamped session.
// category is the IN event's attendance_events.category, normalized to one of
// the four categories (legacy 'normal'/null → 'build'). manual mirrors the IN
// event's manual_entry. An unmatched trailing 'in' is an open session counted up
// to now (still live + uncapped while under the cap).
export function sessionsFromEvents(events) {
  const sorted = [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  const sessions = []
  let openIn = null
  for (const e of sorted) {
    if (e.type === 'in') {
      openIn = e
    } else if (e.type === 'out' && openIn) {
      const cap = cappedSession(new Date(openIn.event_time), new Date(e.event_time))
      sessions.push({
        inTime:  new Date(openIn.event_time),
        outTime: new Date(e.event_time),
        ms:      cap.ms,
        open:    false,
        inId:    openIn.id,
        outId:   e.id,
        inLoc:   openIn.location ?? null,
        outLoc:  e.location ?? null,
        category: normAttendanceCategory(openIn.category),
        manual:  !!openIn.manual_entry,
        wasCapped: cap.wasCapped,
        effectiveOut: cap.effectiveEnd,
      })
      openIn = null
    }
  }
  if (openIn) {
    const cap = cappedSession(new Date(openIn.event_time), null)
    sessions.push({
      inTime: new Date(openIn.event_time), outTime: null,
      ms: cap.ms, open: true, inId: openIn.id, outId: null,
      inLoc: openIn.location ?? null, outLoc: null,
      category: normAttendanceCategory(openIn.category),
      manual: !!openIn.manual_entry,
      wasCapped: cap.wasCapped,
      effectiveOut: cap.effectiveEnd,
    })
  }
  return sessions
}

// Prettify an entrance/exit code ("main-door" → "main door"); '—' when absent.
export function fmtLocation(loc) {
  if (!loc || loc === 'unknown') return '—'
  return loc.replace(/[-_]/g, ' ')
}

export function fmtHours(h) {
  if (!h || h < 0.01) return '—'
  const totalMins = Math.round(h * 60)
  const hrs  = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hrs  === 0) return `${mins}m`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}m`
}

// Total worked milliseconds from in/out pairs, counting an open session up to
// now. Shared by HomePage and ParentHomePage (was HomePage-local). Sums the
// sessions `sessionsFromEvents` derives rather than pairing a second time, so
// there is one pairing rule in this module (sorted there, any order in).
export function computeHoursMs(events) {
  return sessionsFromEvents(events).reduce((total, s) => total + s.ms, 0)
}

export function fmtDuration(ms) {
  const mins = Math.floor(ms / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

export function isCheckedIn(events) {
  if (!events?.length) return false
  return [...events]
    .sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
    .at(-1)?.type === 'in'
}

function sidFor(dateStr, seasons) {
  return seasons.find(s => dateStr >= s.start_date && dateStr <= s.end_date)?.id ?? 'other'
}

// THE DAY RULE. The America/Los_Angeles calendar date ('YYYY-MM-DD') of an
// instant. A stored timestamptz arrives from PostgREST as
// "2026-09-15T22:30:00+00:00", so `event_time.slice(0, 10)` is the UTC date,
// which is the NEXT day for anything after 5 PM PDT / 4 PM PST, and so is
// `new Date().toISOString().slice(0, 10)` as "today". Seasons, goals, the
// session list, the Team Hours matrix and its drill-down, days present and the
// reports are all in shop-local dates, so every date an instant is bucketed by,
// and every "today", comes from here -- whatever zone the viewing device is in.
// src/reporting.js re-exports this one rather than keeping its own. One cached
// formatter, read by parts: a `toLocaleDateString` with options builds a
// formatter per call, ~15x slower, and Team Hours calls this once per session
// for the whole roster.
const LA_DATE = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' })
export function laDateKey(t) {
  const p = {}
  for (const { type, value } of LA_DATE.formatToParts(new Date(t))) p[type] = value
  return `${p.year}-${p.month}-${p.day}`
}

// The instant (ms) a Los Angeles calendar date begins: midnight is 07:00Z in
// PDT, 08:00Z in PST, and on both 2026 transition days midnight is still on
// the old offset (DST moves at 2 AM). The inverse of laDateKey at the start of
// a day, for "since the start of today" reads and for placing a dated row
// (logged hours carry a date, not a time) on the timeline.
export function laMidnightMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  for (const hourUtc of [7, 8]) {
    const t = Date.UTC(y, m - 1, d, hourUtc)
    if (laDateKey(t) === dateStr && laDateKey(t - 1) !== dateStr) return t
  }
  return Date.UTC(y, m - 1, d, 8)
}

// Whether a derived session counts toward official hours: every session except
// one whose checkout is excluded (a pending or voided session_reviews row). An
// open session counts up to now, exactly as the list shows it.
export function isSessionCounted(session, excludedCheckoutIds = null) {
  return !(session.outId && excludedCheckoutIds?.has(session.outId))
}

/**
 * Build a per-season breakdown map for one member.
 *
 * @param {object[]} seasons            - rows from the seasons table
 * @param {object[]} attendanceEvents   - { id, type, event_time, category } for this member, any order
 * @param {object[]} loggedHoursRows    - { type, hours, date } verified entries for this member
 * @param {Set<string>} [excludedCheckoutIds] - checkout event IDs to skip (auto-closed, pending/voided review)
 * @param {object[]} [adjustments]      - { category, hours(signed), created_at } staff hour_adjustments
 * @returns {{ [seasonId|'other']: { build, outreach, volunteer, competition, total } }}
 *
 * The attendance half is `sessionsFromEvents` -- the SAME pairing every session
 * list (My Hours, the Team Hours drill-down, Reports) shows -- so a session a
 * member can see is a session their totals count. Each session is attributed by
 * its IN event's category (normalized; legacy 'normal'/null → 'build'), which
 * keeps it robust to the auto-close 'out' event, and to the season of its IN's
 * Los Angeles date. Logged hours fold into the same category buckets
 * (volunteering → volunteer) by their date column. Staff hour_adjustments fold
 * in too — signed (negative debits allowed), attributed to the season of their
 * created_at's Los Angeles date, so a labeled correction shows in the same split.
 *
 * This used to pair events itself, inside groups keyed by the UTC date of each
 * event, so any session spanning 00:00 UTC (checked in before and out after
 * 5 PM PDT / 4 PM PST, i.e. most after-school sessions) had its IN and OUT in
 * different groups and was dropped from every total while the session list
 * still showed it. tests/my-hours-model.test.js reproduces the report;
 * tests/my-hours-pairing.test.js pins that nothing else moved.
 */
export function buildBreakdown(seasons, attendanceEvents, loggedHoursRows, excludedCheckoutIds = null, adjustments = []) {
  return breakdownFromSessions(seasons, sessionsFromEvents(attendanceEvents), loggedHoursRows, excludedCheckoutIds, adjustments)
}

/**
 * `buildBreakdown` for a caller that already holds the derived sessions (My
 * Hours lists them), so the totals are summed from the very rows it shows.
 */
export function breakdownFromSessions(seasons, sessions, loggedHoursRows, excludedCheckoutIds = null, adjustments = []) {
  const raw = {} // sid → { [category]: hours }
  const addHours = (sid, cat, hours) => {
    const b = (raw[sid] ??= {})
    b[cat] = (b[cat] ?? 0) + hours
  }

  // --- Attendance: every counted session (closed, capped or open), by its IN ---
  for (const s of sessions) {
    if (!isSessionCounted(s, excludedCheckoutIds)) continue
    addHours(sidFor(laDateKey(s.inTime), seasons), s.category, s.ms / 3600000)
  }

  // --- Logged hours (verified only, already filtered by caller) ---
  for (const row of loggedHoursRows) {
    addHours(sidFor(row.date, seasons), loggedTypeToCategory(row.type), parseFloat(row.hours))
  }

  // --- Staff hour adjustments (signed; attributed to the season of created_at) ---
  for (const a of adjustments) {
    const date = a.created_at ? laDateKey(a.created_at) : ''
    addHours(sidFor(date, seasons), normAttendanceCategory(a.category), parseFloat(a.hours) || 0)
  }

  // --- Shape each season bucket as { ...allCategories, total } ---
  const result = {}
  for (const [sid, b] of Object.entries(raw)) {
    const out = emptyBreakdown()
    for (const c of CATEGORIES) { out[c.key] = b[c.key] ?? 0; out.total += out[c.key] }
    result[sid] = out
  }
  return result
}

/** Sum a breakdown map across all season buckets. */
export function sumBreakdown(map) {
  const r = emptyBreakdown()
  for (const b of Object.values(map)) {
    for (const c of CATEGORIES) r[c.key] += b[c.key] ?? 0
    r.total += b.total ?? 0
  }
  return r
}

/**
 * Total ms of sessions whose checkout ID is in pendingCheckoutIds.
 * Used to show "X hours pending mentor review" to the member.
 */
export function computePendingMs(attendanceEvents, pendingCheckoutIds) {
  if (!pendingCheckoutIds?.size) return 0
  return sessionsFromEvents(attendanceEvents)
    .filter(s => s.outId && pendingCheckoutIds.has(s.outId))
    .reduce((total, s) => total + s.ms, 0)
}
