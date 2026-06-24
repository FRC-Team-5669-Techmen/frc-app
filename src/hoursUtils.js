// Shared bucketing logic for MyHoursPage and HoursBoard.

// Hour types in display order, each with its theme color token. Used to color
// the breakdowns consistently across My Hours and Team Hours.
export const HOUR_TYPES = [
  { key: 'regular',      label: 'Regular',      color: 'var(--hr-regular)' },
  { key: 'volunteering', label: 'Volunteering', color: 'var(--hr-volunteer)' },
  { key: 'outreach',     label: 'Outreach',     color: 'var(--hr-outreach)' },
  { key: 'competition',  label: 'Competition',  color: 'var(--hr-competition)' },
]

// Pair a member's raw in/out events into discrete sessions, newest concerns
// handled by the caller. Returns
// [{ inTime, outTime|null, ms, open, outId, inLoc, outLoc, category }] in
// chronological order. inLoc/outLoc are the entrance/exit used
// (attendance_events.location); null when the source rows don't carry it.
// category is the in event's attendance_events.category ('normal' | 'volunteer'),
// defaulting to 'normal' when the source rows don't carry it. An unmatched
// trailing 'in' is an open session counted up to now.
export function sessionsFromEvents(events) {
  const sorted = [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  const sessions = []
  let openIn = null
  for (const e of sorted) {
    if (e.type === 'in') {
      openIn = e
    } else if (e.type === 'out' && openIn) {
      sessions.push({
        inTime:  new Date(openIn.event_time),
        outTime: new Date(e.event_time),
        ms:      new Date(e.event_time) - new Date(openIn.event_time),
        open:    false,
        outId:   e.id,
        inLoc:   openIn.location ?? null,
        outLoc:  e.location ?? null,
        category: openIn.category ?? 'normal',
      })
      openIn = null
    }
  }
  if (openIn) {
    sessions.push({
      inTime: new Date(openIn.event_time), outTime: null,
      ms: Date.now() - new Date(openIn.event_time), open: true, outId: null,
      inLoc: openIn.location ?? null, outLoc: null,
      category: openIn.category ?? 'normal',
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
      total += new Date(e.event_time) - inTime
      inTime = null
    }
  }
  if (inTime) total += Date.now() - inTime
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
 * @returns {{ [seasonId|'other']: { regular, volunteering, outreach, competition, total } }}
 *
 * Attendance sessions are attributed by the IN event's category: a 'volunteer'
 * check-in (the /checkin-volunteer route) lands in `volunteering`, everything
 * else in `regular`. Attributing by the IN side keeps it robust to the auto-
 * close 'out' event, which need not carry the matching category.
 */
export function buildBreakdown(seasons, attendanceEvents, loggedHoursRows, excludedCheckoutIds = null) {
  const raw = {} // sid → { regularMs, volunteerMs, volunteering, outreach, competition }

  // --- Attendance: group events by calendar date, compute closed session ms ---
  const byDate = {}
  for (const e of attendanceEvents) {
    ;(byDate[e.event_time.slice(0, 10)] ??= []).push(e)
  }
  for (const [date, evts] of Object.entries(byDate)) {
    evts.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
    let inTime = null, inCat = null, msReg = 0, msVol = 0
    for (const e of evts) {
      if (e.type === 'in') {
        inTime = new Date(e.event_time)
        inCat  = e.category
      } else if (e.type === 'out' && inTime) {
        // Always close the pair; only count it if not excluded (pending/voided review)
        if (!excludedCheckoutIds || !excludedCheckoutIds.has(e.id)) {
          const dur = new Date(e.event_time) - inTime
          if (inCat === 'volunteer') msVol += dur; else msReg += dur
        }
        inTime = null; inCat = null
      }
    }
    if (msReg > 0 || msVol > 0) {
      const sid = sidFor(date, seasons)
      const b = (raw[sid] ??= {})
      b.regularMs   = (b.regularMs   ?? 0) + msReg
      b.volunteerMs = (b.volunteerMs ?? 0) + msVol
    }
  }

  // Open session: find the last unmatched 'in' (member is currently checked in)
  // Auto-close checkouts clear inTime, so this only fires for genuinely open sessions.
  const sorted = [...attendanceEvents].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  let openIn = null, openDate = null, openCat = null
  for (const e of sorted) {
    if (e.type === 'in') { openIn = new Date(e.event_time); openDate = e.event_time.slice(0, 10); openCat = e.category }
    else if (e.type === 'out' && openIn) { openIn = null; openDate = null; openCat = null }
  }
  if (openIn) {
    const sid = sidFor(openDate, seasons)
    const b = (raw[sid] ??= {})
    const dur = Date.now() - openIn
    if (openCat === 'volunteer') b.volunteerMs = (b.volunteerMs ?? 0) + dur
    else b.regularMs = (b.regularMs ?? 0) + dur
  }

  // --- Logged hours (verified only, already filtered by caller) ---
  for (const row of loggedHoursRows) {
    const sid = sidFor(row.date, seasons)
    const b   = (raw[sid] ??= {})
    b[row.type] = (b[row.type] ?? 0) + parseFloat(row.hours)
  }

  // --- Convert ms → decimal hours and compute totals ---
  const result = {}
  for (const [sid, b] of Object.entries(raw)) {
    const regular      = (b.regularMs ?? 0) / 3600000
    // Volunteer attendance (FLL-room check-ins) + any verified logged volunteering.
    const volunteering = (b.volunteering ?? 0) + (b.volunteerMs ?? 0) / 3600000
    const outreach     = b.outreach     ?? 0
    const competition  = b.competition  ?? 0
    result[sid] = { regular, volunteering, outreach, competition, total: regular + volunteering + outreach + competition }
  }
  return result
}

/** Sum a breakdown map across all season buckets. */
export function sumBreakdown(map) {
  const r = { regular: 0, volunteering: 0, outreach: 0, competition: 0, total: 0 }
  for (const b of Object.values(map)) {
    r.regular      += b.regular
    r.volunteering += b.volunteering
    r.outreach     += b.outreach
    r.competition  += b.competition
    r.total        += b.total
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
        total += new Date(e.event_time) - inTime
      }
      inTime = null
    }
  }
  return total
}
