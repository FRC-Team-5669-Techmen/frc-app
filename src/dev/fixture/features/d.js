// Lane d: attendance history from /display (src/PresenceBoard.jsx name-click,
// src/AttendanceHistory.jsx). No migration: everything read here already exists
// live (attendance_events, session_reviews, seasons), so "migration applied" and
// "not applied" are the same state for this feature.
//
// Seeds one member with a varied history so the shared history view has
// something to show in each of its row kinds: a plain session, a door change,
// a staff manual entry, an auto-close under review, a capped 12.5h session, and
// a competition session, on separate earlier days. Rows are APPENDED to the
// core attendance_events / session_reviews. Times are offsets from the fixture
// clock, so the history always falls inside the season that spans `now`.
//
// The member is this file's OWN fictional student (D_IDS.member, Emerson Vale),
// not a persona. The history used to sit on Riley, and the core seed's build
// generator, which only avoids its own sessions, put Riley's ordinary sessions
// inside the 12.5h and auto-closed ones below; paired in time order, the later
// IN won, and the CAPPED and REVIEW rows never formed on the merged seed.
// Nobody signs in as Emerson, so no application row is needed (App.jsx's gate
// only ever reads the signed-in member's). tools/e2e/features/display-history.mjs
// finds this member as the owner of the one OUT at 'side-door', which stays the
// only one in the store.
//
// Plain data only: no imports, no side effects, nothing read but the arguments.

const H = 3600_000
const D = 24 * H

// Fixed row ids, one per short key. attendance_events.id, session_reviews.id
// and its checkin_id / checkout_id are uuid columns, so a readable label such
// as 'fx-d-a-in' is a row Postgres refuses (22P02) and a seed problem on
// /_fixture.
const KEYS = ['a-in', 'a-out', 'b-in', 'b-out', 'c-in', 'c-out', 'd-in', 'd-out', 'e-in', 'e-out', 'f-in', 'f-out', 'review']
const fxId = (key) => {
  const n = KEYS.indexOf(key) + 1
  if (n === 0) throw new Error(`fixture d: no id for ${key}`)
  return `0d0d0d0d-0000-4000-8000-${String(n).padStart(12, '0')}`
}

// Lane d's member. A uuid outside every other seed's namespace (the core
// roster is 00000000-...-0000000000xx, lane hd's Harper is 0d000000-...).
export const D_IDS = Object.freeze({ member: '0d0d0d0d-0000-4000-8000-0000000d0001' })

export default {
  migration: null,
  creates: {},
  seed: ({ now }) => {
    const who = D_IDS.member
    const t0 = now == null ? NaN : new Date(now).getTime()
    if (!Number.isFinite(t0)) return {}

    const at = (daysAgo, hoursEarlier) => new Date(t0 - daysAgo * D - hoursEarlier * H).toISOString()
    // No category key unless a row names one: attendance_events.category is
    // NOT NULL DEFAULT 'build', and an explicit null never takes the default
    // (23502, in Postgres and in the fixture). An OUT leaves it to the default;
    // the hours math attributes a session by its IN.
    const ev = (key, type, time, over = {}) => ({
      id: fxId(key), user_id: who, type, event_time: time,
      method: type === 'in' ? 'nfc' : null, location: null,
      manual_entry: false, geo_ok: null, ...over,
    })

    // An active, approved, onboarded student, as the board and Team Hours list
    // them (the same profile shape as the core roster and lane hd's Harper).
    const joined = new Date(t0 - 120 * D).toISOString()
    return {
      profiles: [{
        id: who, full_name: 'Emerson Vale', nickname: 'Emerson', bio: null, approved: true,
        created_at: joined, grad_year: 2028, status: 'active', shirt_size: null,
        subteams: ['Fabrication'], disciplines: [], onboarded_at: joined, geofence_exempt: false,
      }],
      member_roles: [{ member_id: who, role: 'student' }],
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
        // least 24h after the one before it, so each lands on its own Los Angeles date
        // (the history's day key, laDateKey; the 25h fall-back day excepted) whatever
        // time of day the fixture clock reads;
        // at 8 days back this one sat 17h from the next and shared a day with it
        // whenever the clock read 06:00-12:59 UTC.
        ev('e-in', 'in', at(7, 13), { category: 'build', geo_ok: true }),
        ev('e-out', 'out', at(7, 0.5)),
        // 40m competition.
        ev('f-in', 'in', at(9, 6), { category: 'competition', geo_ok: true }),
        ev('f-out', 'out', at(9, 6 - 40 / 60)),
      ],
      session_reviews: [
        { id: fxId('review'), user_id: who, checkin_id: fxId('d-in'), checkout_id: fxId('d-out'), status: 'pending', created_at: at(5, 1.5) },
      ],
    }
  },
}
