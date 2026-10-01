// Lane d: attendance history from /display (src/PresenceBoard.jsx name-click,
// src/AttendanceHistory.jsx). No migration: everything read here already exists
// live (attendance_events, session_reviews, seasons), so "migration applied" and
// "not applied" are the same state for this feature.
//
// Seeds one member (persona `student2`, else `student`) with a varied history so
// the shared history view has something to show in each of its row kinds:
// a plain session, a door change, a staff manual entry, an auto-close under
// review, a capped 12.5h session, and a competition session, on separate earlier
// days. Rows are APPENDED to the core attendance_events / session_reviews.
// Times are offsets from the fixture clock, so the history always falls inside
// the season that spans `now`.
//
// Plain data only: no imports, no side effects, nothing read but the arguments.

const H = 3600_000
const D = 24 * H

export default {
  migration: null,
  creates: {},
  seed: ({ ids, now }) => {
    const who = ids?.student2 ?? ids?.student
    const t0 = now == null ? NaN : new Date(now).getTime()
    if (!who || !Number.isFinite(t0)) return {}

    const at = (daysAgo, hoursEarlier) => new Date(t0 - daysAgo * D - hoursEarlier * H).toISOString()
    const ev = (id, type, time, over = {}) => ({
      id: `fx-d-${id}`, user_id: who, type, event_time: time,
      method: type === 'in' ? 'nfc' : null, location: null, category: null,
      manual_entry: false, geo_ok: null, ...over,
    })

    return {
      attendance_events: [
        // 2.5h build, in and out the main door.
        ev('a-in', 'in', at(1, 6), { category: 'build', location: 'main-door', geo_ok: true }),
        ev('a-out', 'out', at(1, 3.5), { location: 'main-door' }),
        // 1.5h outreach, in one door and out another: "Shop → Side Door".
        ev('b-in', 'in', at(2, 6), { category: 'outreach', location: 'shop', geo_ok: true }),
        ev('b-out', 'out', at(2, 4.5), { location: 'side-door' }),
        // 3h volunteer entered by staff: the MANUAL tag.
        ev('c-in', 'in', at(3, 8), { category: 'volunteer', method: 'manual', location: 'manual', manual_entry: true }),
        ev('c-out', 'out', at(3, 5), { method: 'manual', location: 'manual', manual_entry: true }),
        // 6.5h build closed by the 10 PM auto-checkout, under review: the REVIEW tag.
        ev('d-in', 'in', at(5, 8), { category: 'build', geo_ok: true }),
        ev('d-out', 'out', at(5, 1.5), { method: 'auto_close' }),
        // 12.5h build: clamped to 10h, the CAPPED tag. Every check-in here is at
        // least 24h after the one before it, so each lands on its own UTC date
        // (the history's day key) whatever time of day the fixture clock reads;
        // at 8 days back this one sat 17h from the next and shared a day with it
        // whenever the clock read 06:00-12:59 UTC.
        ev('e-in', 'in', at(7, 13), { category: 'build', geo_ok: true }),
        ev('e-out', 'out', at(7, 0.5)),
        // 40m competition.
        ev('f-in', 'in', at(9, 6), { category: 'competition', geo_ok: true }),
        ev('f-out', 'out', at(9, 6 - 40 / 60)),
      ],
      session_reviews: [
        { id: 'fx-d-review', user_id: who, checkin_id: 'fx-d-d-in', checkout_id: 'fx-d-d-out', status: 'pending', created_at: at(5, 1.5) },
      ],
    }
  },
}
