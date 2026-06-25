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
// the six categories (legacy 'normal'/null → 'build'). manual mirrors the IN
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
// now. Shared by HomePage and ParentHomePage (was HomePage-local). Sorts
// defensively so callers can pass events in any order.
export function computeHoursMs(events) {
  let total = 0
  let inTime = null
  for (const e of [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))) {
    if (e.type === 'in') {
      inTime = new Date(e.event_time)
    } else if (e.type === 'out' && inTime) {
      total += cappedSession(inTime, new Date(e.event_time)).ms
      inTime = null
    }
  }
  if (inTime) total += cappedSession(inTime, null).ms
  return total
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

/**
 * Build a per-season breakdown map for one member.
 *
 * @param {object[]} seasons            - rows from the seasons table
 * @param {object[]} attendanceEvents   - { id, type, event_time, category } for this member, any order
 * @param {object[]} loggedHoursRows    - { type, hours, date } verified entries for this member
 * @param {Set<string>} [excludedCheckoutIds] - checkout event IDs to skip (auto-closed, pending/voided review)
 * @returns {{ [seasonId|'other']: { build, outreach, volunteer, competition, total } }}
 *
 * Attendance sessions are attributed by the IN event's category (normalized;
 * legacy 'normal'/null → 'build'). Attributing by the IN side keeps it robust to
 * the auto-close 'out' event, which need not carry the matching category. Logged
 * hours fold into the same category buckets (volunteering → volunteer).
 */
export function buildBreakdown(seasons, attendanceEvents, loggedHoursRows, excludedCheckoutIds = null) {
  const raw = {} // sid → { [category]: hours }
  const addHours = (sid, cat, hours) => {
    const b = (raw[sid] ??= {})
    b[cat] = (b[cat] ?? 0) + hours
  }

  // --- Attendance: group events by calendar date, attribute each closed pair's
  //     duration to its IN category. ---
  const byDate = {}
  for (const e of attendanceEvents) {
    ;(byDate[e.event_time.slice(0, 10)] ??= []).push(e)
  }
  for (const [date, evts] of Object.entries(byDate)) {
    evts.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
    let inTime = null, inCat = null
    for (const e of evts) {
      if (e.type === 'in') {
        inTime = new Date(e.event_time)
        inCat  = normAttendanceCategory(e.category)
      } else if (e.type === 'out' && inTime) {
        // Always close the pair; only count it if not excluded (pending/voided review)
        if (!excludedCheckoutIds || !excludedCheckoutIds.has(e.id)) {
          addHours(sidFor(date, seasons), inCat, cappedSession(inTime, new Date(e.event_time)).ms / 3600000)
        }
        inTime = null; inCat = null
      }
    }
  }

  // Open session: find the last unmatched 'in' (member is currently checked in)
  // Auto-close checkouts clear inTime, so this only fires for genuinely open sessions.
  const sorted = [...attendanceEvents].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  let openIn = null, openDate = null, openCat = null
  for (const e of sorted) {
    if (e.type === 'in') { openIn = new Date(e.event_time); openDate = e.event_time.slice(0, 10); openCat = normAttendanceCategory(e.category) }
    else if (e.type === 'out' && openIn) { openIn = null; openDate = null; openCat = null }
  }
  if (openIn) addHours(sidFor(openDate, seasons), openCat, cappedSession(openIn, null).ms / 3600000)

  // --- Logged hours (verified only, already filtered by caller) ---
  for (const row of loggedHoursRows) {
    addHours(sidFor(row.date, seasons), loggedTypeToCategory(row.type), parseFloat(row.hours))
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
  let total = 0
  let inTime = null
  const sorted = [...attendanceEvents].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  for (const e of sorted) {
    if (e.type === 'in') {
      inTime = new Date(e.event_time)
    } else if (e.type === 'out' && inTime) {
      if (pendingCheckoutIds.has(e.id)) {
        total += cappedSession(inTime, new Date(e.event_time)).ms
      }
      inTime = null
    }
  }
  return total
}
