// Fixture: the hours day rule (lane hd). Contract: src/dev/fixture/README.md.
// Imports nothing, does nothing at import time.
//
// One extra member, Harper Lin, whose whole ledger is two sessions chosen so
// the UTC-date rule and the Los Angeles-date rule give different answers on
// every hours view:
//
//   day A (3 LA days before the fixture's today)  3:30 PM - 6:30 PM, Build, 3h
//       crosses 00:00 UTC (5 PM PDT / 4 PM PST): the old Matrix dropped it
//   day B (the LA day before A)                   7:00 PM - 9:00 PM, Outreach, 2h
//       checked in after 00:00 UTC: its UTC date is day A, so the old Matrix,
//       drill-down and Days put it on day A
//
// With the day rule: Matrix B = 2.0, A = 3.0, row Total 5.0, equal to By member
// (Build 3h, Outreach 2h, Total 5h); a click on cell A opens only the 3:30 PM
// session and on cell B only the 7:00 PM one; Days present = 2. Before it:
// Matrix A = 2.0, B = 0, Total 2.0 against By member 5h, and Days = 1.
//
// Harper has no logged hours and no adjustments on purpose, so By member's
// Total is attendance alone and must equal the Matrix row Total exactly.
//
// No migration: every table here is frozen foundation, so `mig:all` and
// `mig:none` render the same.

const HD_IDS = Object.freeze({
  member: '0d000000-0000-4000-8000-000000000001',
  aIn:    '0d000000-0000-4000-8000-000000000011',
  aOut:   '0d000000-0000-4000-8000-000000000012',
  bIn:    '0d000000-0000-4000-8000-000000000021',
  bOut:   '0d000000-0000-4000-8000-000000000022',
})

const TZ = 'America/Los_Angeles'
const LA_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})
function laParts(t) {
  const o = {}
  for (const { type, value } of LA_PARTS.formatToParts(new Date(t))) o[type] = Number(value)
  return o
}
// The LA calendar date `days` days from the LA date of `t`, as [y, m, d].
function laDayFrom(t, days) {
  const p = laParts(t)
  const u = new Date(Date.UTC(p.year, p.month - 1, p.day + days))
  return [u.getUTCFullYear(), u.getUTCMonth() + 1, u.getUTCDate()]
}
// The instant an LA wall clock reads `hh:mm` on [y, m, d]; two passes settle
// the offset across a DST change.
function laWall([y, m, d], hh, mm) {
  const want = Date.UTC(y, m - 1, d, hh, mm)
  let t = want
  for (let i = 0; i < 2; i += 1) {
    const p = laParts(t)
    t += want - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  }
  return new Date(t).toISOString()
}

export default {
  migration: null,
  creates: {},
  seed: ({ now }) => {
    const t0 = now == null ? NaN : new Date(now).getTime()
    if (!Number.isFinite(t0)) return {}
    const dayA = laDayFrom(t0, -3)
    const dayB = laDayFrom(t0, -4)
    const who = HD_IDS.member
    const ev = (id, type, at, category) => ({
      id, user_id: who, type, event_time: at, method: 'nfc', location: 'shop-main',
      category, manual_entry: false, geo_ok: type === 'in' ? true : null, verified: false,
    })
    return {
      profiles: [{
        id: who, full_name: 'Harper Lin', nickname: 'Harper', bio: null, approved: true,
        created_at: new Date(t0 - 120 * 86_400_000).toISOString(), grad_year: 2028,
        status: 'active', shirt_size: null, subteams: ['Programming'], disciplines: [],
        onboarded_at: new Date(t0 - 120 * 86_400_000).toISOString(), geofence_exempt: false,
      }],
      member_roles: [{ member_id: who, role: 'student' }],
      attendance_events: [
        ev(HD_IDS.bIn, 'in', laWall(dayB, 19, 0), 'outreach'),
        ev(HD_IDS.bOut, 'out', laWall(dayB, 21, 0), 'build'),
        ev(HD_IDS.aIn, 'in', laWall(dayA, 15, 30), 'build'),
        ev(HD_IDS.aOut, 'out', laWall(dayA, 18, 30), 'build'),
      ],
    }
  },
}
