// `src/hoursUtils.js` -- the hours math every board, export and letter reads.
//
// A SESSION IS DERIVED, NEVER STORED. `attendance_events` holds in/out rows and
// `sessionsFromEvents` pairs them; nothing writes a session row. That makes this
// module the single place a wrong hour total can come from, and its failures are
// SILENT -- a member's total is simply wrong, on a board nobody cross-checks
// against a stopwatch. That is the test-worthy shape.
//
// Everything here is measured against fixtures with known arithmetic. Where a
// rule is an absence ("the auto-close OUT does not decide the category"), a
// positive control asserts the same fixture the other way round, so a module
// that had stopped attributing anything at all could not pass.

import { describe, expect, test } from 'vitest'
import {
  MAX_SESSION_HOURS, MAX_SESSION_MS,
  cappedSession, sessionsFromEvents, computeHoursMs, computePendingMs,
  buildBreakdown, sumBreakdown, isCheckedIn, fmtDuration, fmtHours, fmtLocation,
  CATEGORIES, emptyBreakdown,
} from '../src/hoursUtils.js'

const H = 3600_000
const at = (iso) => new Date(iso)
const ev = (id, type, time, over = {}) => ({ id, type, event_time: time, ...over })

// One shop day, 9am to 1pm local-agnostic (all arithmetic below is on the
// stored ISO instants, which is what the module reads).
const DAY = '2026-09-02'
const IN9 = `${DAY}T16:00:00.000Z`
const OUT1 = `${DAY}T20:00:00.000Z`

describe('the forgot-to-sign-out cap', () => {
  test('a normal closed pair is not capped', () => {
    const r = cappedSession(at(IN9), at(OUT1))
    expect(r.ms).toBe(4 * H)
    expect(r.wasCapped).toBe(false)
  })

  test('a closed pair longer than the cap is clamped, and says so', () => {
    const r = cappedSession(at(IN9), at(`${DAY}T23:59:00.000Z`), { maxMs: 4 * H })
    expect(r.ms).toBe(4 * H)
    expect(r.wasCapped).toBe(true)
    expect(r.effectiveEnd.toISOString()).toBe(OUT1)
  })

  test('an OPEN session under the cap stays live and uncapped', () => {
    // Somebody who is legitimately checked in right now.
    const r = cappedSession(new Date(Date.now() - 30 * 60000), null)
    expect(r.wasCapped).toBe(false)
    expect(r.ms).toBeGreaterThan(29 * 60000)
    expect(r.ms).toBeLessThan(31 * 60000)
  })

  test('an open session PAST the cap is clamped -- the stale case', () => {
    const r = cappedSession(new Date(Date.now() - (MAX_SESSION_HOURS + 3) * H), null)
    expect(r.wasCapped).toBe(true)
    expect(r.ms).toBe(MAX_SESSION_MS)
  })

  test('an eventEnd clamps tighter than the cap when it is earlier', () => {
    const r = cappedSession(at(IN9), at(`${DAY}T23:00:00.000Z`), { eventEnd: at(OUT1) })
    expect(r.ms).toBe(4 * H)
    expect(r.wasCapped).toBe(true)
  })

  test('MAX_SESSION_HOURS is the one knob and MAX_SESSION_MS derives from it', () => {
    expect(MAX_SESSION_MS).toBe(MAX_SESSION_HOURS * H)
  })
})

describe('sessionsFromEvents: pairing', () => {
  test('a closed pair carries both ids, both locations and the IN category', () => {
    const s = sessionsFromEvents([
      ev('i1', 'in', IN9, { location: 'main-door', category: 'outreach' }),
      ev('o1', 'out', OUT1, { location: 'shop-door', category: null }),
    ])
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({
      ms: 4 * H, open: false, inId: 'i1', outId: 'o1',
      inLoc: 'main-door', outLoc: 'shop-door', category: 'outreach', wasCapped: false,
    })
  })

  test('THE AUTO-CLOSE OUT DOES NOT DECIDE THE CATEGORY', () => {
    // The 10pm pg_cron auto-close writes an OUT that need not carry a matching
    // category. Attributing by the IN side is what makes the math robust to it.
    const s = sessionsFromEvents([
      ev('i1', 'in', IN9, { category: 'volunteer' }),
      ev('o1', 'out', OUT1, { category: 'build' }),
    ])
    expect(s[0].category).toBe('volunteer')
  })

  test('POSITIVE CONTROL: the IN category really is being read, not defaulted', () => {
    // If the module simply returned 'build' always, the assertion above would
    // still pass for a 'build' IN. Drive both directions on one fixture shape.
    const volunteer = sessionsFromEvents([ev('i', 'in', IN9, { category: 'volunteer' }), ev('o', 'out', OUT1)])
    const build = sessionsFromEvents([ev('i', 'in', IN9, { category: 'build' }), ev('o', 'out', OUT1)])
    expect(volunteer[0].category).toBe('volunteer')
    expect(build[0].category).toBe('build')
    expect(volunteer[0].category).not.toBe(build[0].category)
  })

  test('a legacy null / "normal" category normalizes to build', () => {
    const s = sessionsFromEvents([ev('i', 'in', IN9, { category: 'normal' }), ev('o', 'out', OUT1)])
    expect(s[0].category).toBe('build')
    const s2 = sessionsFromEvents([ev('i', 'in', IN9), ev('o', 'out', OUT1)])
    expect(s2[0].category).toBe('build')
  })

  test('events out of order are sorted before pairing', () => {
    const s = sessionsFromEvents([ev('o1', 'out', OUT1), ev('i1', 'in', IN9)])
    expect(s).toHaveLength(1)
    expect(s[0].ms).toBe(4 * H)
  })

  test('a trailing unmatched IN is one OPEN session', () => {
    const s = sessionsFromEvents([ev('i1', 'in', new Date(Date.now() - H).toISOString())])
    expect(s).toHaveLength(1)
    expect(s[0].open).toBe(true)
    expect(s[0].outId).toBe(null)
  })

  test('A SECOND IN OVERWRITES AN OPEN ONE, so the orphan yields NO session', () => {
    // This is exactly why MemberHoursAdmin cannot ask this module which INs are
    // unclosed, and why `unclosedInIds` exists (see anomaly-pairing.test.js).
    const s = sessionsFromEvents([
      ev('i1', 'in', `${DAY}T15:00:00.000Z`),
      ev('i2', 'in', IN9),
      ev('o1', 'out', OUT1),
    ])
    expect(s).toHaveLength(1)
    expect(s[0].inId).toBe('i2')
    expect(s.some((x) => x.inId === 'i1')).toBe(false)
  })

  test('an OUT with no open IN is ignored rather than counted', () => {
    const s = sessionsFromEvents([ev('o1', 'out', OUT1)])
    expect(s).toHaveLength(0)
  })
})

describe('computeHoursMs and computePendingMs', () => {
  test('sums every closed pair across days', () => {
    const ms = computeHoursMs([
      ev('i1', 'in', IN9), ev('o1', 'out', OUT1),
      ev('i2', 'in', '2026-09-03T16:00:00.000Z'), ev('o2', 'out', '2026-09-03T18:00:00.000Z'),
    ])
    expect(ms).toBe(6 * H)
  })

  test('counts an open session up to now', () => {
    const ms = computeHoursMs([ev('i', 'in', new Date(Date.now() - 2 * H).toISOString())])
    expect(ms).toBeGreaterThan(2 * H - 60000)
    expect(ms).toBeLessThan(2 * H + 60000)
  })

  test('pending counts ONLY the sessions whose checkout is flagged', () => {
    const events = [
      ev('i1', 'in', IN9), ev('o1', 'out', OUT1),
      ev('i2', 'in', '2026-09-03T16:00:00.000Z'), ev('o2', 'out', '2026-09-03T19:00:00.000Z'),
    ]
    expect(computePendingMs(events, new Set(['o2']))).toBe(3 * H)
    expect(computePendingMs(events, new Set())).toBe(0)
    expect(computePendingMs(events, null)).toBe(0)
  })

  test('POSITIVE CONTROL: flagging the other checkout moves the answer', () => {
    const events = [
      ev('i1', 'in', IN9), ev('o1', 'out', OUT1),
      ev('i2', 'in', '2026-09-03T16:00:00.000Z'), ev('o2', 'out', '2026-09-03T19:00:00.000Z'),
    ]
    expect(computePendingMs(events, new Set(['o1']))).toBe(4 * H)
  })
})

describe('buildBreakdown: the season and category split', () => {
  const seasons = [
    { id: 'off26', start_date: '2026-06-01', end_date: '2027-01-06' },
    { id: 'bio27', start_date: '2027-01-07', end_date: '2027-06-30' },
  ]

  test('attendance folds into its IN category, in the right season', () => {
    const map = buildBreakdown(seasons, [
      ev('i', 'in', IN9, { category: 'outreach' }), ev('o', 'out', OUT1),
    ], [])
    expect(map.off26.outreach).toBeCloseTo(4, 6)
    expect(map.off26.build).toBe(0)
    expect(map.off26.total).toBeCloseTo(4, 6)
  })

  test('verified logged hours fold into the same buckets, volunteering -> volunteer', () => {
    const map = buildBreakdown(seasons, [], [
      { type: 'volunteering', hours: '2.5', date: '2026-09-02' },
      { type: 'competition', hours: '6', date: '2027-02-01' },
    ])
    expect(map.off26.volunteer).toBeCloseTo(2.5, 6)
    expect(map.bio27.competition).toBeCloseTo(6, 6)
  })

  test('an excluded checkout is closed but NOT counted', () => {
    const events = [ev('i', 'in', IN9, { category: 'build' }), ev('o', 'out', OUT1)]
    const counted = buildBreakdown(seasons, events, [])
    const excluded = buildBreakdown(seasons, events, [], new Set(['o']))
    expect(counted.off26.build).toBeCloseTo(4, 6)
    // POSITIVE CONTROL is the line above: the same fixture counts 4h unexcluded,
    // so a zero here is the exclusion working rather than the fixture being empty.
    expect(excluded.off26?.build ?? 0).toBe(0)
  })

  test('staff adjustments fold in SIGNED, by the season of created_at', () => {
    const map = buildBreakdown(seasons, [], [], null, [
      { category: 'build', hours: '3', created_at: '2026-09-02T00:00:00Z' },
      { category: 'build', hours: '-1.5', created_at: '2026-09-02T00:00:00Z' },
    ])
    expect(map.off26.build).toBeCloseTo(1.5, 6)
  })

  test('a date in no season lands in the "other" bucket rather than vanishing', () => {
    const map = buildBreakdown(seasons, [], [{ type: 'outreach', hours: '1', date: '2025-01-01' }])
    expect(map.other.outreach).toBeCloseTo(1, 6)
  })

  test('sumBreakdown adds every season bucket', () => {
    const map = buildBreakdown(seasons, [], [
      { type: 'outreach', hours: '1', date: '2026-09-02' },
      { type: 'outreach', hours: '2', date: '2027-02-01' },
    ])
    const all = sumBreakdown(map)
    expect(all.outreach).toBeCloseTo(3, 6)
    expect(all.total).toBeCloseTo(3, 6)
  })

  test('every bucket carries every category key plus a total', () => {
    const map = buildBreakdown(seasons, [ev('i', 'in', IN9), ev('o', 'out', OUT1)], [])
    for (const c of CATEGORIES) expect(map.off26).toHaveProperty(c.key)
    expect(Object.keys(emptyBreakdown()).sort()).toEqual(Object.keys(map.off26).sort())
  })
})

describe('small display helpers', () => {
  test('isCheckedIn reads the LAST event chronologically, not the last in the array', () => {
    expect(isCheckedIn([ev('o', 'out', OUT1), ev('i', 'in', IN9)])).toBe(false)
    expect(isCheckedIn([ev('o', 'out', IN9), ev('i', 'in', OUT1)])).toBe(true)
    expect(isCheckedIn([])).toBe(false)
  })

  test('fmtDuration and fmtHours drop the empty half', () => {
    expect(fmtDuration(90 * 60000)).toBe('1h 30m')
    expect(fmtDuration(45 * 60000)).toBe('45m')
    expect(fmtHours(2)).toBe('2h')
    expect(fmtHours(0)).toBe('—')
  })

  test('fmtLocation prettifies a code and dashes an absent one', () => {
    expect(fmtLocation('main-door')).toBe('main door')
    expect(fmtLocation('unknown')).toBe('—')
    expect(fmtLocation(null)).toBe('—')
  })
})
