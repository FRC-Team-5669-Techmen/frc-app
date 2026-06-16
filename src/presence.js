// Shared "who is present" derivation. A member is PRESENT when their most recent
// attendance event today is an 'in' with no later 'out' — i.e. an open check-in.
// This reuses the exact attendance_events shape and the today-boundary used by
// the personal check-in flow (HomePage/CheckinPage); it adds no new tables.

// Local midnight, matching HomePage's startOfToday.
export function startOfTodayISO() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// events: [{ user_id, type, event_time }] for today (any order).
// Returns Map<user_id, sinceISO> of members with an open check-in.
export function computePresence(events) {
  const latest = new Map() // user_id -> most recent event
  for (const e of events) {
    const prev = latest.get(e.user_id)
    if (!prev || new Date(e.event_time) > new Date(prev.event_time)) {
      latest.set(e.user_id, e)
    }
  }
  const present = new Map()
  for (const [uid, e] of latest) {
    if (e.type === 'in') present.set(uid, e.event_time)
  }
  return present
}

export function fmtClock(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
