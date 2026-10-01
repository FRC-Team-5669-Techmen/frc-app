// `src/myHoursModel.js` -- every number on /my-hours, and the session rows the
// page lists, from one pure computation.
//
// THE REPORT (feedback, 2026-09-23 3:53 PM America/Los_Angeles, /my-hours,
// Android Chrome 384x692): "In my category it only shows I have 2 hours for
// service hours but in recent sessions it shows I have a lot more hours."
//
// THE CAUSE: `buildBreakdown` (src/hoursUtils.js) paired IN/OUT events inside
// groups keyed by `event_time.slice(0, 10)` -- the UTC calendar date of the
// stored instant, because PostgREST hands a timestamptz back as
// "2026-09-15T22:30:00+00:00". Any session that spans 00:00 UTC (5 PM PDT /
// 4 PM PST) put its IN in one group and its OUT in the next, so neither half
// ever paired and the session was DROPPED from every category total. The
// recent-sessions list pairs with `sessionsFromEvents`, which sorts the whole
// ledger and never splits it, so it showed those sessions in full. An
// after-school session at the shop or the FLL room ends after 5 PM, so it is
// precisely the common session that vanished; a Saturday-morning one did not.
//
// Every fixture below is a stored instant, written the way the client receives
// it, with the America/Los_Angeles wall time beside it.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { myHoursModel, laMidnightMs } from '../src/myHoursModel.js'
import { buildBreakdown, laDateKey, CATEGORIES } from '../src/hoursUtils.js'

const H = 3600_000
const ME = 'c1'
const ev = (id, type, time, over = {}) => ({ id, type, event_time: time, manual_entry: false, ...over })

const SEASONS = [
  { id: 'off26', name: 'Offseason 2026', start_date: '2026-05-01', end_date: '2027-01-06' },
  { id: 'bio27', name: 'Biocore 2027',   start_date: '2027-01-07', end_date: '2027-06-30' },
]

// The student's September. Categories are on the IN, exactly as /checkin and
// /checkin-volunteer write them.
const SEPTEMBER = [
  // Sat 9/12  9:00-11:00 AM PDT, volunteer (FLL room)        -- one UTC date
  ev('in-0912', 'in',  '2026-09-12T16:00:00+00:00', { category: 'volunteer' }),
  ev('out-0912', 'out', '2026-09-12T18:00:00+00:00', { category: 'build' }),
  // Mon 9/14  3:30-6:00 PM PDT, build (shop)                  -- crosses 00:00 UTC
  ev('in-0914', 'in',  '2026-09-14T22:30:00+00:00', { category: 'build' }),
  ev('out-0914', 'out', '2026-09-15T01:00:00+00:00', { category: 'build' }),
  // Tue 9/15  3:30-6:30 PM PDT, volunteer                     -- crosses
  ev('in-0915', 'in',  '2026-09-15T22:30:00+00:00', { category: 'volunteer' }),
  ev('out-0915', 'out', '2026-09-16T01:30:00+00:00', { category: 'build' }),
  // Wed 9/16  3:30-4:45 PM PDT, build                         -- one UTC date
  ev('in-0916', 'in',  '2026-09-16T22:30:00+00:00', { category: 'build' }),
  ev('out-0916', 'out', '2026-09-16T23:45:00+00:00', { category: 'build' }),
  // Thu 9/17  build at 3:00 PM, then a /checkin-volunteer tap at 3:20 PM: the
  // auto-switch writes an OUT for the build session and a volunteer IN, and the
  // volunteer session runs to 6:20 PM.                        -- the volunteer half crosses
  ev('in-0917b', 'in',  '2026-09-17T22:00:00+00:00', { category: 'build' }),
  ev('out-0917b', 'out', '2026-09-17T22:20:00.000+00:00', { category: 'build' }),
  ev('in-0917v', 'in',  '2026-09-17T22:20:00.500+00:00', { category: 'volunteer' }),
  ev('out-0917v', 'out', '2026-09-18T01:20:00.500+00:00', { category: 'build' }),
  // Sat 9/19  1:00-5:30 PM PDT, volunteer                     -- crosses
  ev('in-0919', 'in',  '2026-09-19T20:00:00+00:00', { category: 'volunteer' }),
  ev('out-0919', 'out', '2026-09-20T00:30:00+00:00', { category: 'build' }),
  // Tue 9/22  3:45-6:15 PM PDT, volunteer                     -- crosses
  ev('in-0922', 'in',  '2026-09-22T22:45:00+00:00', { category: 'volunteer' }),
  ev('out-0922', 'out', '2026-09-23T01:15:00+00:00', { category: 'build' }),
]

// What the list shows for each session, in hours, by its IN id.
const LISTED = {
  'in-0912': ['volunteer', 2], 'in-0914': ['build', 2.5], 'in-0915': ['volunteer', 3],
  'in-0916': ['build', 1.25], 'in-0917b': ['build', 1 / 3], 'in-0917v': ['volunteer', 3],
  'in-0919': ['volunteer', 4.5], 'in-0922': ['volunteer', 2.5],
}

// The instant the report was filed: 3:53 PM PDT on 9/23.
const FILED = '2026-09-23T22:53:00Z'

function model(over = {}) {
  return myHoursModel({
    seasons: SEASONS, events: SEPTEMBER, logged: [], reviews: [], goals: [],
    adjustments: [], corrections: [], memberId: ME, now: Date.parse(FILED), ...over,
  })
}

// Hours of one category in the session rows the page lists, skipping any row a
// pending/voided review excludes. Computed HERE from the reviews, not from any
// annotation on the row, so this sum is independent of the module under test.
function listedHours(m, cat, reviews = []) {
  const excluded = new Set(reviews.map(r => r.checkout_id))
  return m.sessions
    .filter(s => s.category === cat && !(s.outId && excluded.has(s.outId)))
    .reduce((h, s) => h + s.ms / H, 0)
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(FILED)) })
afterEach(() => { vi.useRealTimers() })

describe('THE REPORT: the by-category totals agree with the recent-sessions list', () => {
  test('volunteer ("service") hours on the By category card equal the volunteer sessions listed', () => {
    const m = model()
    const listedVolunteer = m.recent.filter(s => s.category === 'volunteer').reduce((h, s) => h + s.ms / H, 0)
    // POSITIVE CONTROL on the fixture itself: the list really does show 15h of
    // volunteer sessions, so the equality below is not 0 == 0.
    expect(listedVolunteer).toBeCloseTo(15, 6)
    expect(m.allTime.volunteer).toBeCloseTo(listedVolunteer, 6)
  })

  test('every category reconciles: total = listed sessions + verified logged + adjustments', () => {
    const logged = [{ type: 'volunteer', hours: '1.50', date: '2026-09-05' }]
    const adjustments = [{ id: 'a1', category: 'build', hours: '-0.5', reason: 'duplicate tap', created_at: '2026-09-20T18:00:00+00:00' }]
    const m = model({ logged, adjustments })
    for (const { key } of CATEGORIES) {
      const expected = listedHours(m, key)
        + logged.filter(l => l.type === key).reduce((h, l) => h + parseFloat(l.hours), 0)
        + adjustments.filter(a => a.category === key).reduce((h, a) => h + parseFloat(a.hours), 0)
      expect(m.allTime[key], key).toBeCloseTo(expected, 6)
    }
    expect(m.allTime.volunteer).toBeCloseTo(16.5, 6)
    expect(m.allTime.build).toBeCloseTo(2.5 + 1.25 + 1 / 3 - 0.5, 6)
  })

  test('This Week can never exceed All Time', () => {
    // Before the fix the page showed This Week 10h 20m beside All Time 3h 35m:
    // the trend was summed from the session list, All Time from the dropped one.
    const m = model()
    expect(m.trend.thisWeek).toBeCloseTo(1 / 3 + 3 + 4.5 + 2.5, 6)
    expect(m.trend.thisWeek).toBeLessThanOrEqual(m.grandTotal + 1e-9)
    expect(m.grandTotal).toBeCloseTo(m.allTime.total, 6)
  })

  test('Team Hours reads the same totals: buildBreakdown agrees with the page', () => {
    // HoursBoard's by-member table, category strip and Goals view call
    // buildBreakdown per member; the page and the board must not disagree.
    const m = model()
    expect(buildBreakdown(SEASONS, SEPTEMBER, [], new Set(), [])).toEqual(m.breakdown)
  })
})

describe('which rows were dropped: each listed session counts, alone, in its own category', () => {
  // One case per session. Before the fix, exactly the five whose IN and OUT
  // fall on different UTC dates fail; the three that stay inside one UTC date
  // pass, which is the positive control inside the same fixture.
  const pairs = []
  for (let i = 0; i < SEPTEMBER.length; i++) {
    const e = SEPTEMBER[i]
    if (e.type !== 'in') continue
    const out = SEPTEMBER[i + 1]
    pairs.push([`${e.id} ${e.event_time.slice(0, 10)} -> ${out.event_time.slice(0, 10)} UTC`, e, out])
  }
  test.each(pairs)('%s', (_label, inEv, outEv) => {
    const [cat, hours] = LISTED[inEv.id]
    const m = model({ events: [inEv, outEv] })
    expect(m.sessions).toHaveLength(1)
    expect(m.sessions[0].ms / H).toBeCloseTo(hours, 6)
    expect(m.allTime[cat]).toBeCloseTo(hours, 6)
    expect(m.allTime.total).toBeCloseTo(hours, 6)
  })
})

describe('a session belongs to the season of its LOS ANGELES date, not its UTC date', () => {
  test('6-8 PM PST on the last day of Offseason 2026 stays in Offseason 2026', () => {
    // 2027-01-06 18:00 PST is 2027-01-07T02:00Z -- the next season by UTC date.
    const m = model({ events: [
      ev('i', 'in', '2027-01-07T02:00:00+00:00', { category: 'build' }),
      ev('o', 'out', '2027-01-07T04:00:00+00:00'),
    ], now: Date.parse('2027-01-08T00:00:00Z') })
    expect(m.breakdown.off26?.build ?? 0).toBeCloseTo(2, 6)
    expect(m.breakdown.bio27?.build ?? 0).toBe(0)
  })

  test('POSITIVE CONTROL: the same wall time one day later lands in Biocore 2027', () => {
    const m = model({ events: [
      ev('i', 'in', '2027-01-08T02:00:00+00:00', { category: 'build' }),
      ev('o', 'out', '2027-01-08T04:00:00+00:00'),
    ], now: Date.parse('2027-01-09T00:00:00Z') })
    expect(m.breakdown.bio27?.build ?? 0).toBeCloseTo(2, 6)
    expect(m.breakdown.off26?.build ?? 0).toBe(0)
  })

  test('a staff adjustment made at 6 PM PST on the last day stays in that season too', () => {
    const at = (iso) => model({ events: [], adjustments: [{ id: 'a', category: 'outreach', hours: '1', reason: 'x', created_at: iso }] })
    expect(at('2027-01-07T02:00:00+00:00').breakdown.off26.outreach).toBeCloseTo(1, 6)
    expect(at('2027-01-08T02:00:00+00:00').breakdown.bio27.outreach).toBeCloseTo(1, 6)
  })
})

describe('sessions under mentor review: shown in the list, marked, and out of EVERY total', () => {
  // The 9/22 session was auto-closed / voided. The list still shows the row; the
  // row has to say it does not count, and no total on the page may count it.
  const pending = [{ checkout_id: 'out-0922', status: 'pending' }]
  const voided  = [{ checkout_id: 'out-0922', status: 'voided' }]

  test('a pending session is excluded from the totals AND from This Week, and flagged for review', () => {
    const counted = model()
    const m = model({ reviews: pending })
    expect(m.allTime.volunteer).toBeCloseTo(counted.allTime.volunteer - 2.5, 6)
    expect(m.trend.thisWeek).toBeCloseTo(counted.trend.thisWeek - 2.5, 6)
    const row = m.recent.find(s => s.outId === 'out-0922')
    expect(row.pending).toBe(true)
    expect(row.counted).toBe(false)
    expect(m.pendingCount).toBe(1)
    expect(m.pendingMs / H).toBeCloseTo(2.5, 6)
  })

  test('a voided session is excluded the same way and its row says so', () => {
    const m = model({ reviews: voided })
    expect(m.allTime.volunteer).toBeCloseTo(15 - 2.5, 6)
    const row = m.recent.find(s => s.outId === 'out-0922')
    expect(row.voided).toBe(true)
    expect(row.pending).toBe(false)
    expect(row.counted).toBe(false)
    // A voided session is not "pending mentor review".
    expect(m.pendingCount).toBe(0)
  })

  test('POSITIVE CONTROL: with no review row the same session counts and is unmarked', () => {
    const m = model()
    const row = m.recent.find(s => s.outId === 'out-0922')
    expect(row.counted).toBe(true)
    expect(row.pending).toBe(false)
    expect(row.voided).toBe(false)
    expect(m.allTime.volunteer).toBeCloseTo(15, 6)
  })
})

describe('the open session and the goal read the same rows', () => {
  test('a session checked in at 3:30 PM and still open at 3:53 PM counts its 23 minutes once', () => {
    const open = [...SEPTEMBER, ev('in-0923', 'in', '2026-09-23T22:30:00+00:00', { category: 'volunteer' })]
    const m = model({ events: open })
    const row = m.recent[0]
    expect(row.open).toBe(true)
    expect(row.ms / H).toBeCloseTo(23 / 60, 6)
    expect(m.allTime.volunteer).toBeCloseTo(15 + 23 / 60, 6)
  })

  test('goal progress is the counted total of the goal categories this season', () => {
    const goals = [{ member_id: null, season_id: 'off26', target_hours: 20, categories: ['volunteer', 'outreach'] }]
    const m = model({ goals })
    expect(m.goalProgress.season.id).toBe('off26')
    expect(m.goalProgress.hours).toBeCloseTo(15, 6)
    expect(m.goalProgress.met).toBe(false)
    // POSITIVE CONTROL: a build-only goal reads the build sessions instead.
    const b = model({ goals: [{ ...goals[0], categories: ['build'] }] })
    expect(b.goalProgress.hours).toBeCloseTo(2.5 + 1.25 + 1 / 3, 6)
  })
})

describe('the two date helpers, across both 2026 DST transitions', () => {
  test('laDateKey is the Los Angeles date, not the UTC date', () => {
    expect(laDateKey('2026-09-15T22:30:00+00:00')).toBe('2026-09-15')   // 3:30 PM PDT
    expect(laDateKey('2026-09-16T01:30:00+00:00')).toBe('2026-09-15')   // 6:30 PM PDT, next UTC day
    expect(laDateKey('2026-09-16T07:00:00+00:00')).toBe('2026-09-16')   // midnight PDT
    expect(laDateKey('2026-12-02T07:59:59+00:00')).toBe('2026-12-01')   // 11:59 PM PST
    expect(laDateKey('2026-12-02T08:00:00+00:00')).toBe('2026-12-02')   // midnight PST
    expect(laDateKey(new Date('2026-11-01T08:30:00Z'))).toBe('2026-11-01') // 1:30 AM PDT, fall-back day
  })

  test('laMidnightMs is the instant a Los Angeles day begins', () => {
    expect(laMidnightMs('2026-09-15')).toBe(Date.parse('2026-09-15T07:00:00Z'))
    expect(laMidnightMs('2026-12-01')).toBe(Date.parse('2026-12-01T08:00:00Z'))
    expect(laMidnightMs('2026-03-08')).toBe(Date.parse('2026-03-08T08:00:00Z')) // spring-forward day starts in PST
    expect(laMidnightMs('2026-11-01')).toBe(Date.parse('2026-11-01T07:00:00Z')) // fall-back day starts in PDT
  })

  test('verified logged hours count in This Week by their date; one from last month does not', () => {
    const recent = model({ events: [], logged: [{ type: 'outreach', hours: '1.25', date: '2026-09-21' }] })
    expect(recent.trend.thisWeek).toBeCloseTo(1.25, 6)
    expect(recent.allTime.outreach).toBeCloseTo(1.25, 6)
    const old = model({ events: [], logged: [{ type: 'outreach', hours: '1.25', date: '2026-08-21' }] })
    expect(old.trend.thisWeek).toBe(0)
    expect(old.allTime.outreach).toBeCloseTo(1.25, 6)
  })
})
