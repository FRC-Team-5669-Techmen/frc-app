// `src/attendanceHistory.js` -- the one attendance-history derivation, shared by
// the Team Hours drill-down (HoursBoard) and the staff name-click on /display
// (PresenceBoard).
//
// Two things are worth pinning. The DERIVATION: which sessions a history holds,
// under which day, flagged or not, and what they total -- a wrong answer there
// is silent, a member's history simply reads short. And the GATE: who may open
// a history from /display. The gate is an absence for most viewers ("a student
// gets no button"), so every refusal below is paired with the same call driven
// the other way, and a function that refused everyone could not pass.
//
// All arithmetic is on stored ISO instants with known answers. "Now" is pinned,
// because an open session is counted up to now.

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import {
  STAFF_ROLES, canOpenHistory, defaultHistorySeason, seasonRange,
  sessionDayKey, dayInRange, historyByDay, historyTotals, fmtSessionTime, fmtDayKey,
} from '../src/attendanceHistory.js'
import { sessionsFromEvents } from '../src/hoursUtils.js'

const H = 3600_000
const NOW = '2026-10-01T23:00:00.000Z'   // 4:00 PM PDT, Thu Oct 1

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)) })
afterAll(() => { vi.useRealTimers() })

const ev = (id, type, time, over = {}) => ({ id, type, event_time: time, ...over })

// One member's ledger across two seasons. Every pair's length is stated.
const EVENTS = [
  // Summer season: 1h build.
  ev('i0', 'in', '2026-08-20T22:00:00.000Z', { category: 'build' }),
  ev('o0', 'out', '2026-08-20T23:00:00.000Z'),
  // 12.5h raw -> capped at 10h (a missed check-out).
  ev('i5', 'in', '2026-09-23T15:00:00.000Z', { category: 'build' }),
  ev('o5', 'out', '2026-09-24T03:30:00.000Z'),
  // 6.5h build whose check-out is under review (the auto-close).
  ev('i4', 'in', '2026-09-25T22:30:00.000Z', { category: 'build' }),
  ev('o4', 'out', '2026-09-26T05:00:00.000Z'),
  // 3h volunteer, entered by staff.
  ev('i3', 'in', '2026-09-27T16:00:00.000Z', { category: 'volunteer', manual_entry: true, location: 'manual' }),
  ev('o3', 'out', '2026-09-27T19:00:00.000Z', { location: 'manual' }),
  // 2.5h build, legacy 'normal' category, in and out the same door.
  ev('i1', 'in', '2026-09-28T22:30:00.000Z', { category: 'normal', location: 'main-door' }),
  ev('o1', 'out', '2026-09-29T01:00:00.000Z', { location: 'main-door' }),
  // 1.5h outreach, in one door and out another.
  ev('i2', 'in', '2026-09-29T22:45:00.000Z', { category: 'outreach', location: 'shop' }),
  ev('o2', 'out', '2026-09-30T00:15:00.000Z', { location: 'side-door' }),
  // A double IN: the first is overwritten by the second (sessionsFromEvents'
  // documented behaviour), so this day holds ONE 2h session from 23:00.
  ev('i6a', 'in', '2026-09-30T22:00:00.000Z', { category: 'build' }),
  ev('i6b', 'in', '2026-09-30T23:00:00.000Z', { category: 'build' }),
  ev('o6', 'out', '2026-10-01T01:00:00.000Z'),
  // Still checked in: 21:00 to NOW = 2h, open.
  ev('i7', 'in', '2026-10-01T21:00:00.000Z', { category: 'build' }),
]

// Ordered start_date DESC, as HoursBoard and the /display loader read them.
const SEASONS = [
  { id: 's-off', name: 'Offseason 2026', start_date: '2026-09-01', end_date: '2027-01-06' },
  { id: 's-sum', name: 'Summer 2026', start_date: '2026-06-01', end_date: '2026-08-31' },
]
const OFFSEASON = seasonRange(SEASONS[0])
const REVIEWED = new Set(['o4'])

const days = (groups) => groups.map(g => g.day)
const hours = (s) => s.ms / H

describe('who may open a history from /display', () => {
  const as = (...roles) => (r) => roles.includes(r)

  test('each staff role may', () => {
    for (const r of STAFF_ROLES) expect(canOpenHistory(as(r))).toBe(true)
    expect(STAFF_ROLES).toEqual(['mentor', 'lead', 'admin'])
  })

  test('a student and a parent may not; the same parent holding a staff role may', () => {
    expect(canOpenHistory(as('student'))).toBe(false)
    expect(canOpenHistory(as('parent'))).toBe(false)
    // Positive control on the parent: a parent who is also a mentor is staff
    // (the architecture's parent-vs-staff rule).
    expect(canOpenHistory(as('parent', 'mentor'))).toBe(true)
    expect(canOpenHistory(as('student', 'lead'))).toBe(true)
  })

  test('no hasRole at all -- the board App.jsx mounts today -- is the non-staff board', () => {
    expect(canOpenHistory(undefined)).toBe(false)
    expect(canOpenHistory(null)).toBe(false)
    expect(canOpenHistory('admin')).toBe(false)
    expect(canOpenHistory(() => false)).toBe(false)
    // Only a literal true counts: a role check that returns a truthy non-boolean
    // is a bug upstream, not a grant.
    expect(canOpenHistory(() => 'yes')).toBe(false)
    // Positive control: the same shape of argument, answering true, opens.
    expect(canOpenHistory(() => true)).toBe(true)
  })
})

describe('the period a history opens on', () => {
  test('the season spanning today', () => {
    expect(defaultHistorySeason(SEASONS)?.id).toBe('s-off')
  })

  test('the season spanning today, even when a future season sorts first', () => {
    // The live table's shape on 2026-10-01: Biocore 2027 already exists and,
    // ordered start_date DESC, comes before the Offseason that is running.
    const withFuture = [
      { id: 's-bio', name: 'Biocore 2027', start_date: '2027-01-07', end_date: '2027-05-31' },
      ...SEASONS,
    ]
    expect(defaultHistorySeason(withFuture)?.id).toBe('s-off')
  })

  test('no season spans today -> the most recent; none at all -> all time', () => {
    const past = [SEASONS[1], { id: 's-old', name: 'Old', start_date: '2025-01-01', end_date: '2025-05-01' }]
    expect(defaultHistorySeason(past)?.id).toBe('s-sum')
    expect(defaultHistorySeason([])).toBe(null)
    expect(defaultHistorySeason(undefined)).toBe(null)
    expect(seasonRange(null)).toBe(null)
  })

  test('an open-ended season (null end_date) still spans today', () => {
    const open = [{ id: 's-open', name: 'Open', start_date: '2026-09-15', end_date: null }, SEASONS[1]]
    expect(defaultHistorySeason(open)?.id).toBe('s-open')
    expect(seasonRange(open[0])).toEqual({ start: '2026-09-15', end: null })
  })
})

describe('grouping sessions by day', () => {
  test('a season history: newest day first, nothing from another season', () => {
    const g = historyByDay(EVENTS, { range: OFFSEASON })
    expect(days(g)).toEqual([
      '2026-10-01', '2026-09-30', '2026-09-29', '2026-09-28', '2026-09-27', '2026-09-25', '2026-09-23',
    ])
    expect(g.flatMap(x => x.sessions)).toHaveLength(7)
  })

  test('all time (null range) keeps the summer session the season range dropped', () => {
    const g = historyByDay(EVENTS, { range: null })
    expect(days(g)).toContain('2026-08-20')
    expect(days(historyByDay(EVENTS, { range: OFFSEASON }))).not.toContain('2026-08-20')
  })

  test('range bounds are inclusive at both ends, and an open end runs forward', () => {
    expect(days(historyByDay(EVENTS, { range: { start: '2026-09-25', end: '2026-09-28' } })))
      .toEqual(['2026-09-28', '2026-09-27', '2026-09-25'])
    expect(days(historyByDay(EVENTS, { range: { start: '2026-09-30', end: null } })))
      .toEqual(['2026-10-01', '2026-09-30'])
    expect(dayInRange('2026-09-25', { start: '2026-09-25', end: '2026-09-25' })).toBe(true)
    expect(dayInRange('2026-09-26', { start: '2026-09-25', end: '2026-09-25' })).toBe(false)
  })

  test('a single day (a matrix cell) ignores the range and holds only that day', () => {
    const g = historyByDay(EVENTS, { day: '2026-09-28', range: { start: '2027-01-07', end: null } })
    expect(days(g)).toEqual(['2026-09-28'])
    expect(g[0].sessions).toHaveLength(1)
    expect(g[0].sessions[0].inId).toBe('i1')
    expect(historyByDay(EVENTS, { day: '2026-09-26' })).toEqual([])
  })

  test('sessions within a day stay in chronological order', () => {
    const twoInOneDay = [
      ev('b', 'in', '2026-09-28T20:00:00.000Z'), ev('bo', 'out', '2026-09-28T21:00:00.000Z'),
      ev('a', 'in', '2026-09-28T16:00:00.000Z'), ev('ao', 'out', '2026-09-28T17:00:00.000Z'),
    ]
    const [only] = historyByDay(twoInOneDay)
    expect(only.sessions.map(s => s.inId)).toEqual(['a', 'b'])
  })

  test('each row carries what the view prints, straight from the stored events', () => {
    const byIn = Object.fromEntries(historyByDay(EVENTS, { range: OFFSEASON }).flatMap(g => g.sessions).map(s => [s.inId, s]))
    expect(byIn.i1.inTime.toISOString()).toBe('2026-09-28T22:30:00.000Z')
    expect(byIn.i1.outTime.toISOString()).toBe('2026-09-29T01:00:00.000Z')
    expect(byIn.i1.category).toBe('build')                       // legacy 'normal' normalized
    expect([byIn.i2.inLoc, byIn.i2.outLoc]).toEqual(['shop', 'side-door'])
    expect(byIn.i3.manual).toBe(true)
    expect(byIn.i1.manual).toBe(false)                            // positive control
    expect(byIn.i5.wasCapped).toBe(true)
    expect(hours(byIn.i5)).toBe(10)
    expect(byIn.i1.wasCapped).toBe(false)                         // positive control
    expect(byIn.i7.open).toBe(true)
    expect(byIn.i7.outTime).toBe(null)
    expect(hours(byIn.i7)).toBe(2)
    // The orphaned first IN of the double IN produces no row; the second does.
    expect(byIn.i6a).toBeUndefined()
    expect(hours(byIn.i6b)).toBe(2)
  })
})

describe('the day a session files under', () => {
  test('is the IN instant\'s UTC date -- the key the Team Hours matrix uses', () => {
    // A check-in at 6:30 PM PDT on Mon Sep 28 is 01:30Z on the 29th. The matrix
    // (attendanceHoursByDate) files it under event_time.slice(0, 10), so the
    // history must too, or a matrix cell click would open an empty day. If this
    // is ever moved to an America/Los_Angeles day, move the matrix with it.
    const evening = [ev('e', 'in', '2026-09-29T01:30:00.000Z'), ev('eo', 'out', '2026-09-29T03:00:00.000Z')]
    const [s] = sessionsFromEvents(evening)
    expect(sessionDayKey(s)).toBe(evening[0].event_time.slice(0, 10))
    expect(sessionDayKey(s)).toBe('2026-09-29')
    expect(days(historyByDay(evening, { day: '2026-09-29' }))).toEqual(['2026-09-29'])
    expect(historyByDay(evening, { day: '2026-09-28' })).toEqual([])
  })
})

describe('review flags and totals', () => {
  test('only a session whose check-out is under review is flagged', () => {
    const all = historyByDay(EVENTS, { range: OFFSEASON, excluded: REVIEWED }).flatMap(g => g.sessions)
    expect(all.filter(s => s.flagged).map(s => s.inId)).toEqual(['i4'])
    // Positive control: the same ledger with nothing under review flags nothing,
    // and a Set naming every check-out flags every closed session.
    expect(historyByDay(EVENTS, { range: OFFSEASON }).flatMap(g => g.sessions).some(s => s.flagged)).toBe(false)
    const everyOut = new Set(EVENTS.filter(e => e.type === 'out').map(e => e.id))
    const flagged = historyByDay(EVENTS, { range: OFFSEASON, excluded: everyOut }).flatMap(g => g.sessions).filter(s => s.flagged)
    expect(flagged).toHaveLength(6)
  })

  test('an open session is never flagged, even against a Set that holds null', () => {
    const open = historyByDay(EVENTS, { day: '2026-10-01', excluded: new Set([null, undefined]) })[0].sessions[0]
    expect(open.open).toBe(true)
    expect(open.flagged).toBe(false)
  })

  test('totals count by the IN category and leave a flagged session out', () => {
    const t = historyTotals(historyByDay(EVENTS, { range: OFFSEASON, excluded: REVIEWED }))
    // build: 2.5 (i1) + 10 capped (i5) + 2 (i6b) + 2 open (i7); i4's 6.5 is under review
    expect(t.build).toBeCloseTo(16.5, 10)
    expect(t.outreach).toBeCloseTo(1.5, 10)
    expect(t.volunteer).toBeCloseTo(3, 10)
    expect(t.competition).toBe(0)
    expect(t.total).toBeCloseTo(21, 10)
    // Positive control: the same history with nothing under review counts i4.
    const all = historyTotals(historyByDay(EVENTS, { range: OFFSEASON }))
    expect(all.build).toBeCloseTo(23, 10)
    expect(all.total).toBeCloseTo(27.5, 10)
  })

  test('an empty history totals zero in every bucket', () => {
    expect(historyTotals([])).toEqual({ total: 0, build: 0, outreach: 0, volunteer: 0, competition: 0 })
    expect(historyTotals(null).total).toBe(0)
    expect(historyByDay([], {})).toEqual([])
    expect(historyByDay(undefined)).toEqual([])
  })
})

describe('formatting', () => {
  const ws = (s) => s.replace(/\s/g, ' ')   // ICU may put U+202F before AM/PM
  // Put TZ back exactly as found. Assigning undefined to process.env stores the
  // STRING 'undefined', which would leave every later test in this file running
  // in a zone named 'undefined' rather than the runner's own.
  const restoreTz = (prior) => { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior }

  test('times read in the shop\'s zone whatever zone the device is in', () => {
    const prior = process.env.TZ
    try {
      for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles']) {
        process.env.TZ = tz
        expect(ws(fmtSessionTime(new Date('2026-09-28T22:30:00.000Z')))).toBe('3:30 PM')
      }
      // Positive control: an unpinned formatter in a UTC device reads 10:30 PM,
      // which is what pinning the zone is for.
      process.env.TZ = 'UTC'
      expect(ws(new Date('2026-09-28T22:30:00.000Z').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))).toBe('10:30 PM')
    } finally {
      restoreTz(prior)
    }
    expect(fmtSessionTime(null)).toBe('—')
    expect(process.env.TZ).toBe(prior)
  })

  test('a day key names its own calendar date in any zone', () => {
    const prior = process.env.TZ
    try {
      for (const tz of ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles', 'Pacific/Pago_Pago']) {
        process.env.TZ = tz
        expect(fmtDayKey('2026-10-01')).toBe('Thu, Oct 1')
        expect(fmtDayKey('2026-09-28')).toBe('Mon, Sep 28')
      }
    } finally {
      restoreTz(prior)
    }
  })
})
