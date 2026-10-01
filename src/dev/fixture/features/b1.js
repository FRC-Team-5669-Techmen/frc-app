// Fixture: the My Hours category bug (lane b1), for the `student` persona.
//
// Seeds the shape of the 2026-09-23 report: after-school sessions that cross
// 00:00 UTC (5 PM PDT / 4 PM PST), which the old buildBreakdown dropped from the
// By category card while Recent sessions still listed them, beside a
// Saturday-morning session that never crossed and so was always counted. Also
// one auto-closed session pending mentor review and one voided one, so the
// list's "review" and "not counted" markers and the pending notice render.
//
// No migration: every table here is frozen foundation, so the page reads the
// same in `mig:all` and `mig:none`.
//
// Times are UTC arithmetic on the fixture clock's UTC date. Wall times in the
// comments are PDT; in PST each is an hour earlier and still crosses 00:00 UTC.

const H = 3_600_000

export default {
  migration: null,
  creates: {},
  seed: ({ ids, now }) => {
    const me = ids.student
    const t0 = new Date(now ?? Date.now())
    // 00:00 UTC on the UTC date `k` days before the clock; `h` may run past 24.
    const day = k => Date.UTC(t0.getUTCFullYear(), t0.getUTCMonth(), t0.getUTCDate() - k)
    const at = (k, h) => new Date(day(k) + h * H).toISOString()
    const date = k => new Date(day(k)).toISOString().slice(0, 10)
    const id = n => `00000000-0000-4000-b100-${String(n).padStart(12, '0')}`

    let n = 0
    const events = []
    // One session: IN carries the category (as /checkin and /checkin-volunteer
    // write it); the OUT carries the column default, which the math ignores.
    const session = (k, inH, outH, category, out = {}) => {
      const inId = id(++n), outId = id(++n)
      events.push(
        { id: inId, user_id: me, type: 'in', event_time: at(k, inH), category, method: 'nfc', location: category === 'volunteer' ? 'fll-room' : 'shop', manual_entry: false, geo_ok: true, verified: false },
        { id: outId, user_id: me, type: 'out', event_time: at(k, outH), category: 'build', method: 'nfc', location: category === 'volunteer' ? 'fll-room' : 'shop', manual_entry: false, geo_ok: null, verified: false, ...out },
      )
      return { inId, outId }
    }

    session(12, 16, 18, 'volunteer')                 // Sat  9:00-11:00 AM, 2h, one UTC date
    session(11, 22.5, 25, 'build')                   // 3:30-6:00 PM, 2h 30m, crosses
    session(10, 22.5, 25.5, 'volunteer')             // 3:30-6:30 PM, 3h, crosses
    session(9, 22.5, 23.75, 'build')                 // 3:30-4:45 PM, 1h 15m, one UTC date
    // A /checkin-volunteer tap at 3:20 PM auto-switches a build session.
    session(8, 22, 22 + 1 / 3, 'build')              // 3:00-3:20 PM, 20m
    session(8, 22 + 1 / 3 + 0.5 / 3600, 25 + 1 / 3 + 0.5 / 3600, 'volunteer') // 3:20-6:20 PM, 3h, crosses
    session(5, 20, 24.5, 'volunteer')                // Sat 1:00-5:30 PM, 4h 30m, crosses
    session(3, 22.75, 25.25, 'volunteer')            // 3:45-6:15 PM, 2h 30m, crosses
    // Forgot to check out: closed by the 10 PM auto-close, pending review.
    const pending = session(2, 23, 29, 'build', { method: 'auto_close', location: 'auto' }) // 4:00-10:00 PM, 6h
    // A morning session a mentor voided.
    const voided = session(1, 16, 18, 'volunteer')   // 9:00-11:00 AM, 2h

    return {
      attendance_events: events,
      session_reviews: [
        { id: id(901), user_id: me, checkin_id: pending.inId, checkout_id: pending.outId, status: 'pending', reviewed_by: null, reviewed_at: null, created_at: at(1, 8) },
        { id: id(902), user_id: me, checkin_id: voided.inId, checkout_id: voided.outId, status: 'voided', reviewed_by: ids.mentor ?? null, reviewed_at: at(0, 1), created_at: at(1, 19) },
      ],
      logged_hours: [
        // Verified: counts (Volunteer). Pending: counts nowhere on My Hours.
        { id: id(911), member_id: me, date: date(20), hours: '1.50', type: 'volunteer', description: 'FLL scrimmage judging', status: 'verified', created_at: at(19, 18) },
        { id: id(912), member_id: me, date: date(4), hours: '2.00', type: 'outreach', description: 'Library demo', status: 'pending', created_at: at(4, 3) },
      ],
      hour_adjustments: [
        { id: id(921), member_id: me, category: 'outreach', hours: 1, reason: 'Booth setup before the check-in tag was posted', created_by: ids.mentor ?? null, created_at: at(6, 19) },
      ],
    }
  },
}
