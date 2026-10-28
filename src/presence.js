// Shared "who is present" derivation. A member is PRESENT when the shared rule
// in attendanceState.js says they are checked in: their newest event is an 'in'
// from today or still inside the session cap. The dashboard and both tag routes
// read the same rule, so the board agrees with a member's own tile on every
// event the caller's query returns. PresenceBoard, useGlance and
// ParentHomePage all query from presenceSinceISO(), so a session open across
// midnight reads present there too. It adds no new tables.

import { currentStatus, statusWindowStartISO } from './attendanceState'
import { sessionKind } from './categories'

// Local midnight, matching HomePage's startOfToday.
export function startOfTodayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// Where a presence query should start to see every open session the rule
// counts, a session open across midnight included. startOfTodayISO() misses
// that one case; it remains right for "today's events" (the glance's schedule).
export function presenceSinceISO() {
  return statusWindowStartISO(Date.now())
}

// events: [{ user_id, type, event_time, category? }] (any order, any window
// that ends now). Returns Map<user_id, { since, kind }> of members with an open
// check-in, where kind (categories.js sessionKind) is what the open session is
// counting: FRC build or FLL volunteer, read off its IN event's category. A
// query that did not select `category` reads every session as FRC, so callers
// that show the kind must select it.
export function computePresenceDetail(events, now = Date.now()) {
  const byUser = new Map() // user_id -> that member's events
  for (const e of events) {
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, [])
    byUser.get(e.user_id).push(e)
  }
  const present = new Map()
  for (const [uid, evs] of byUser) {
    const s = currentStatus(evs, now)
    if (s.checkedIn) present.set(uid, { since: s.since, kind: sessionKind(s.last.category) })
  }
  return present
}

// The same rule, as Map<user_id, sinceISO>.
export function computePresence(events, now = Date.now()) {
  return new Map([...computePresenceDetail(events, now)].map(([uid, d]) => [uid, d.since]))
}

export function fmtClock(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export const UNASSIGNED = 'UNASSIGNED'

// A member's primary subteam (subteams is text[]), or UNASSIGNED. Accepts any
// object with a `subteams` array (profile row or an embedded profile join).
export function subteamOf(m) {
  return (m && m.subteams && m.subteams.length) ? m.subteams[0] : UNASSIGNED
}

// Group members by primary subteam. Returns [[name, members[]], ...] ordered
// A→Z with the UNASSIGNED catch-all last. Shared by PresenceBoard and the
// HomePage Team Status so the two stay consistent.
export function groupBySubteam(members) {
  const groups = new Map()
  for (const m of members) {
    const key = subteamOf(m)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(m)
  }
  return [...groups.keys()]
    .sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : a.localeCompare(b)))
    .map(name => [name, groups.get(name)])
}
