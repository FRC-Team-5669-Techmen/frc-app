// Fixture plugin for the check-out fix (lane b2). Contract: ../README.md.
//
// Seeds the state the 2026-09-08 report was filed from: the `student` persona
// checked in by tag earlier today with no check-out yet, so /dashboard shows
// "Checked in" with a Check Out button and a fresh /checkin tap checks out.
// `student2` carries a session opened before Los Angeles midnight that is still
// inside the 10 h session cap whenever the fixture clock allows one (the
// cross-midnight case); otherwise their only open IN is two days old (stale),
// which must read as NOT checked in.
//
// This lane adds no migration: nothing here depends on one, so the UI must
// behave identically under `mig:all` and `mig:none`.
//
// Plain data only: no imports, no side effects.

const HOUR = 60 * 60 * 1000

// PostgREST returns timestamptz with microseconds and a +00:00 offset; the
// seeds use the same shape so the pages parse what production sends them.
const pg = (ms) => new Date(ms).toISOString().replace('Z', '000+00:00')

// Los Angeles midnight before `ms`, without a date library: walk back to the
// hour where the LA wall clock reads 00, then trim minutes/seconds.
function laMidnightBefore(ms) {
  const hourOf = (t) => Number(new Date(t).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false })) % 24
  let t = Math.floor(ms / HOUR) * HOUR
  for (let i = 0; i < 26 && hourOf(t) !== 0; i++) t -= HOUR
  return t
}

export default {
  migration: null,
  creates: {},
  seed: ({ ids, now }) => {
    const nowMs = typeof now === 'number' ? now : new Date(now).getTime()
    const student = ids.student
    const student2 = ids.student2
    const ev = (id, user_id, type, ms, over = {}) => ({
      id, user_id, type, event_time: pg(ms), location: 'front-door', method: 'nfc',
      category: 'build', verified: false, manual_entry: false, geo_ok: type === 'in' ? true : null,
      overridden_by: null, job_id: null, ...over,
    })

    const rows = [
      // student: a closed session two days ago (so Season hours are non-zero) ...
      ev('b2-s1-in-old', student, 'in', nowMs - 50 * HOUR),
      ev('b2-s1-out-old', student, 'out', nowMs - 47 * HOUR),
      // ... and the open session the report is about: checked in 2h45m ago.
      ev('b2-s1-in-open', student, 'in', nowMs - 2.75 * HOUR),
    ]

    if (student2) {
      // A forgotten check-out two days ago: stale, so NOT checked in.
      rows.push(ev('b2-s2-in-stale', student2, 'in', nowMs - 49 * HOUR))
      // Opened 20 minutes before LA midnight, if that is still inside the cap.
      const crossMidnight = laMidnightBefore(nowMs) - 20 * 60 * 1000
      if (nowMs - crossMidnight <= 10 * HOUR) {
        rows.push(ev('b2-s2-in-midnight', student2, 'in', crossMidnight))
      }
    }
    return { attendance_events: rows }
  },
}
