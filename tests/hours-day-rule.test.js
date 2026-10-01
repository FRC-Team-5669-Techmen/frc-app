// One day rule for hours: every hours surface buckets a session by the
// America/Los_Angeles date of its check-in (laDateKey in src/hoursUtils.js).
//
// After the My Hours fix (lane b1) the By member totals on Team Hours summed
// `sessionsFromEvents` by LA date, while three other places still keyed on the
// UTC date: the Matrix (HoursBoard's private attendanceHoursByDate, which also
// paired events inside UTC-date groups and so DROPPED every session spanning
// 00:00 UTC), the drill-down's day key (attendanceHistory sessionDayKey), and
// days present (accountability daysPresent). Measured on an exported ledger:
// By member 12h, Matrix 2h, for the same member.
//
// The three implementations as they stood at 3d9dd54 (unchanged at a55d574)
// are copied below VERBATIM as oracles. The properties, over many generated
// ledgers that cross 00:00 UTC, the spring-forward and fall-back days, and a
// season boundary:
//
//   1. AGREEMENT. Each season's Matrix row total equals that member's By member
//      attendance total for the season, and every Matrix cell equals the total
//      of the sessions a click on it opens. The old Matrix fails both.
//   2. NOTHING ELSE MOVED. The per-day numbers differ from the old ones by
//      EXACTLY the sessions that cross a date boundary (check-in after 00:00
//      UTC, so its LA date is the day before its UTC date, or check-out on a
//      later UTC date than check-in); with those taken out the two maps are
//      identical, and on ledgers where nothing crosses they are identical
//      outright. The same for the drill-down's day key and for days present.
//
// Positive controls: every property counts the ledgers on which it was actually
// exercised (a crossing session existed, the old answer differed), so none can
// pass on a generator that never produces the case, and the oracles are shown
// to reproduce the reported 12h / 2h on a hand-built ledger.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildBreakdown, sumBreakdown, sessionsFromEvents, cappedSession, isSessionCounted,
  laDateKey, laMidnightMs,
} from '../src/hoursUtils.js'
import { hoursByDay, historyByDay, historyTotals, sessionDayKey } from '../src/attendanceHistory.js'
import { daysPresent } from '../src/accountability.js'

const H = 3600_000
const NOW = Date.parse('2026-12-15T19:00:00Z')   // 11 AM PST, after every generated ledger

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)) })
afterEach(() => { vi.useRealTimers() })

// ── The oracles: 3d9dd54, verbatim ──────────────────────────────────────────

// src/HoursBoard.jsx
function oldAttendanceHoursByDate(events, excludedSet) {
  const byDate = {}
  for (const e of events) (byDate[e.event_time.slice(0, 10)] ??= []).push(e)
  const out = {}
  for (const [date, evts] of Object.entries(byDate)) {
    evts.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
    let inT = null, ms = 0
    for (const e of evts) {
      if (e.type === 'in') inT = new Date(e.event_time)
      else if (e.type === 'out' && inT) {
        if (!excludedSet?.has(e.id)) ms += cappedSession(inT, new Date(e.event_time)).ms
        inT = null
      }
    }
    if (ms > 0) out[date] = (out[date] ?? 0) + ms / 3600000
  }
  const sorted = [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  let openIn = null, openDate = null
  for (const e of sorted) {
    if (e.type === 'in') { openIn = new Date(e.event_time); openDate = e.event_time.slice(0, 10) }
    else if (e.type === 'out' && openIn) { openIn = null; openDate = null }
  }
  if (openIn) out[openDate] = (out[openDate] ?? 0) + cappedSession(openIn, null).ms / 3600000
  return out
}

// src/attendanceHistory.js
function oldSessionDayKey(session) {
  return session.inTime.toISOString().slice(0, 10)
}

// src/accountability.js
function oldDaysPresent(events, { since = null, until = null } = {}) {
  const days = new Set()
  for (const e of events) {
    if (e.type !== 'in') continue
    const day = e.event_time.slice(0, 10)
    if (since && day < since) continue
    if (until && day > until) continue
    days.add(day)
  }
  return days.size
}

// ── Generated ledgers ──────────────────────────────────────────────────────
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CATS = ['build', 'outreach', 'volunteer', 'competition', null, 'normal']
// PostgREST's own timestamptz form.
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', '+00:00')
const utcDate = (t) => new Date(t).toISOString().slice(0, 10)

// UTC dates the generator is drawn to: the two 2026 DST transition days and
// the evenings either side of the season boundary below, plus random days.
const PINNED_DAYS = ['2026-03-07', '2026-03-08', '2026-03-09', '2026-06-30', '2026-07-01', '2026-10-31', '2026-11-01', '2026-11-02']
const SEASONS = [
  { id: 'spring', name: 'Spring', start_date: '2026-01-01', end_date: '2026-06-30' },
  { id: 'fall', name: 'Fall', start_date: '2026-07-01', end_date: '2026-12-31' },
]

// One member's ledger, any order. Sessions start between 13:00Z and 06:00Z the
// next day (6 AM to 11 PM PDT), so many check in after 00:00 UTC and many
// cross it; plus double INs, stray OUTs, a forgotten check-out the next day
// closes (capped), review-excluded check-outs, and sometimes one open now.
// `noCross` keeps every event between 08:30Z and 23:59Z of its session's UTC
// day, where the LA date and the UTC date are the same day in PDT and in PST.
function ledger(rand, { noCross = false } = {}) {
  const events = []
  const reviews = []
  let id = 0
  const nextId = (p) => `${p}${id++}`
  const n = 3 + Math.floor(rand() * 18)
  for (let k = 0; k < n; k++) {
    const day = rand() < 0.35
      ? Date.parse(PINNED_DAYS[Math.floor(rand() * PINNED_DAYS.length)] + 'T00:00:00Z')
      : Date.parse('2026-02-01T00:00:00Z') + Math.floor(rand() * 290) * 86_400_000
    const startH = noCross ? 8.5 + rand() * 14 : 13 + rand() * 17
    const lenH = noCross ? rand() * (23.9 - startH) : 0.25 + rand() * 6
    const inMs = Math.round(day + startH * H)
    const outMs = Math.round(inMs + lenH * H)
    const cat = CATS[Math.floor(rand() * CATS.length)]
    const r = rand()
    if (r < 0.06) {                                   // a stray OUT with nothing open
      events.push({ id: nextId('o'), type: 'out', event_time: iso(inMs) })
      continue
    }
    if (r < 0.14) {                                   // a double IN
      events.push({ id: nextId('i'), type: 'in', event_time: iso(inMs - 0.5 * H), category: cat })
    }
    events.push({ id: nextId('i'), type: 'in', event_time: iso(inMs), category: cat })
    if (r > 0.95 && !noCross) {                       // forgotten: closed the next day (capped)
      events.push({ id: nextId('o'), type: 'out', event_time: iso(inMs + 26 * H) })
      continue
    }
    const outId = nextId('o')
    events.push({ id: outId, type: 'out', event_time: iso(outMs), category: 'build' })
    if (rand() < 0.1) reviews.push(outId)
  }
  if (rand() < 0.3) {                                 // checked in right now
    events.push({ id: nextId('i'), type: 'in', event_time: iso(NOW - Math.floor(rand() * 3 * H)), category: 'build' })
  }
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)); [events[i], events[j]] = [events[j], events[i]]
  }
  return { events, excluded: new Set(reviews) }
}

const N = 400
const seasonSum = (perDay, season) => Object.entries(perDay)
  .filter(([d]) => d >= season.start_date && d <= season.end_date)
  .reduce((h, [, v]) => h + v, 0)

// A counted session "crosses a date boundary" when its check-in's LA date is
// not its UTC date (checked in after 00:00 UTC) or its check-out falls on a
// later UTC date than its check-in. Everything else has one date in both rules.
function crosses(s) {
  const utcIn = utcDate(s.inTime)
  return laDateKey(s.inTime) !== utcIn || (!s.open && utcDate(s.outTime) !== utcIn)
}

describe('the Matrix agrees with By member and with the drill-down', () => {
  test(`on ${N} ledgers: each season's Matrix row total = its By member attendance total`, () => {
    const rand = mulberry32(5669)
    let oldDisagreed = 0
    for (let i = 0; i < N; i++) {
      const { events, excluded } = ledger(rand)
      const byMember = buildBreakdown(SEASONS, events, [], excluded)
      const now = hoursByDay(events, excluded)
      const was = oldAttendanceHoursByDate(events, excluded)
      let differs = false
      for (const s of SEASONS) {
        const want = byMember[s.id]?.total ?? 0
        expect(seasonSum(now, s), `ledger ${i} ${s.id}`).toBeCloseTo(want, 9)
        if (Math.abs(seasonSum(was, s) - want) > 1e-9) differs = true
      }
      // and across all time, the same as the All Time tab's attendance total
      expect(Object.values(now).reduce((a, b) => a + b, 0), `ledger ${i}`).toBeCloseTo(sumBreakdown(byMember).total, 9)
      if (differs) oldDisagreed++
    }
    // POSITIVE CONTROL: the old Matrix really did disagree, on most ledgers.
    expect(oldDisagreed).toBeGreaterThan(N * 0.5)
  })

  test(`on ${N} ledgers: every Matrix cell = the sessions a click on that cell opens`, () => {
    const rand = mulberry32(2026)
    let oldMismatched = 0
    for (let i = 0; i < N; i++) {
      const { events, excluded } = ledger(rand)
      const now = hoursByDay(events, excluded)
      const was = oldAttendanceHoursByDate(events, excluded)
      const days = new Set([...Object.keys(now), ...historyByDay(events, { excluded }).map(g => g.day)])
      for (const d of days) {
        const opened = historyTotals(historyByDay(events, { day: d, excluded })).total
        expect(now[d] ?? 0, `ledger ${i} ${d}`).toBeCloseTo(opened, 9)
      }
      // The old cell beside the old drill-down (UTC day key) for the same day.
      const oldOpened = {}
      for (const s of sessionsFromEvents(events)) {
        if (!isSessionCounted(s, excluded)) continue
        oldOpened[oldSessionDayKey(s)] = (oldOpened[oldSessionDayKey(s)] ?? 0) + s.ms / H
      }
      if (Object.keys(oldOpened).some(d => Math.abs((was[d] ?? 0) - oldOpened[d]) > 1e-9)) oldMismatched++
    }
    // POSITIVE CONTROL: before, a cell often held less than the day it opened.
    expect(oldMismatched).toBeGreaterThan(N * 0.5)
  })

  test('POSITIVE CONTROL: the reported shape, By member 12h against Matrix 2h, and the fix', () => {
    // Mon-Wed after school, each running past 5 PM PDT, and a Saturday morning.
    const s = (id, inT, outT) => [
      { id: `i${id}`, type: 'in', event_time: inT, category: 'build' },
      { id: `o${id}`, type: 'out', event_time: outT },
    ]
    const events = [
      ...s(1, '2026-09-21T22:30:00+00:00', '2026-09-22T01:30:00+00:00'),   // 3:30-6:30 PM, 3h
      ...s(2, '2026-09-22T22:30:00+00:00', '2026-09-23T02:00:00+00:00'),   // 3:30-7:00 PM, 3.5h
      ...s(3, '2026-09-23T23:00:00+00:00', '2026-09-24T02:30:00+00:00'),   // 4:00-7:30 PM, 3.5h
      ...s(4, '2026-09-26T16:00:00+00:00', '2026-09-26T18:00:00+00:00'),   // Sat 9-11 AM, 2h
    ]
    const fall = SEASONS[1]
    expect(buildBreakdown(SEASONS, events, []).fall.total).toBeCloseTo(12, 9)
    expect(seasonSum(oldAttendanceHoursByDate(events, null), fall)).toBeCloseTo(2, 9)
    expect(seasonSum(hoursByDay(events), fall)).toBeCloseTo(12, 9)
    expect(hoursByDay(events)).toEqual({ '2026-09-21': 3, '2026-09-22': 3.5, '2026-09-23': 3.5, '2026-09-26': 2 })
  })

  test('a session checked in on the last evening of a season stays in that season', () => {
    // 8 PM PDT on Jun 30 is 03:00Z on Jul 1: Spring's, not Fall's.
    const events = [
      { id: 'i', type: 'in', event_time: '2026-07-01T03:00:00+00:00', category: 'build' },
      { id: 'o', type: 'out', event_time: '2026-07-01T05:00:00+00:00' },
    ]
    expect(buildBreakdown(SEASONS, events, []).spring.total).toBeCloseTo(2, 9)
    expect(seasonSum(hoursByDay(events), SEASONS[0])).toBeCloseTo(2, 9)
    expect(seasonSum(hoursByDay(events), SEASONS[1])).toBe(0)
    // Positive control: the old Matrix put it in Fall, beside a Spring By member.
    expect(seasonSum(oldAttendanceHoursByDate(events, null), SEASONS[1])).toBeCloseTo(2, 9)
  })
})

describe('nothing moved but the sessions that cross a date boundary', () => {
  test(`on ${N} ledgers: per day, new - crossing = old - crossing the old counted`, () => {
    const rand = mulberry32(17)
    let withCrossing = 0, changed = 0
    for (let i = 0; i < N; i++) {
      const { events, excluded } = ledger(rand)
      const now = hoursByDay(events, excluded)
      const was = oldAttendanceHoursByDate(events, excluded)
      const newCross = {}, oldCross = {}
      for (const s of sessionsFromEvents(events)) {
        if (!isSessionCounted(s, excluded) || !crosses(s)) continue
        const h = s.ms / H
        newCross[laDateKey(s.inTime)] = (newCross[laDateKey(s.inTime)] ?? 0) + h
        // The old rule kept a crossing session only when it was still open or
        // its check-out shared its check-in's UTC date, on that UTC date.
        if (s.open || utcDate(s.outTime) === utcDate(s.inTime)) {
          oldCross[utcDate(s.inTime)] = (oldCross[utcDate(s.inTime)] ?? 0) + h
        }
      }
      if (Object.keys(newCross).length) withCrossing++
      const days = new Set([...Object.keys(now), ...Object.keys(was), ...Object.keys(newCross), ...Object.keys(oldCross)])
      for (const d of days) {
        const unaffectedNow = (now[d] ?? 0) - (newCross[d] ?? 0)
        const unaffectedWas = (was[d] ?? 0) - (oldCross[d] ?? 0)
        expect(unaffectedNow, `ledger ${i} ${d}`).toBeCloseTo(unaffectedWas, 9)
        if (Math.abs((now[d] ?? 0) - (was[d] ?? 0)) > 1e-9) changed++
      }
    }
    // POSITIVE CONTROLS: crossing sessions were generated, and the maps moved.
    expect(withCrossing).toBeGreaterThan(N * 0.8)
    expect(changed).toBeGreaterThan(N)
  })

  test(`on ${N} ledgers where nothing crosses, the per-day hours are identical`, () => {
    const rand = mulberry32(42)
    let nonEmpty = 0
    for (let i = 0; i < N; i++) {
      const { events, excluded } = ledger(rand, { noCross: true })
      expect(sessionsFromEvents(events).some(crosses), `ledger ${i}`).toBe(false)
      const now = hoursByDay(events, excluded)
      const was = oldAttendanceHoursByDate(events, excluded)
      const days = new Set([...Object.keys(now), ...Object.keys(was)])
      for (const d of days) expect(now[d] ?? 0, `ledger ${i} ${d}`).toBeCloseTo(was[d] ?? 0, 9)
      if (Object.values(was).some(h => h > 0)) nonEmpty++
    }
    expect(nonEmpty).toBeGreaterThan(N * 0.9)   // not {} = {}
  })

  test(`on ${N} ledgers: a session's drill-down day moved only if it was checked in after 00:00 UTC`, () => {
    const rand = mulberry32(7)
    let moved = 0, kept = 0
    for (let i = 0; i < N; i++) {
      for (const s of sessionsFromEvents(ledger(rand).events)) {
        const now = sessionDayKey(s), was = oldSessionDayKey(s)
        if (laDateKey(s.inTime) === utcDate(s.inTime)) {
          expect(now, `ledger ${i}`).toBe(was)
          kept++
        } else {
          // the day before its UTC date, never any other day
          expect(now, `ledger ${i}`).toBe(utcDate(Date.parse(was + 'T12:00:00Z') - 86_400_000))
          moved++
        }
      }
    }
    expect(moved).toBeGreaterThan(N)
    expect(kept).toBeGreaterThan(N)
  })

  test(`on ${N} ledgers: days present moved only for check-ins after 00:00 UTC`, () => {
    const rand = mulberry32(99)
    let differed = 0, compared = 0
    const ranges = [{}, { since: '2026-03-08' }, { until: '2026-07-01' }, { since: '2026-06-30', until: '2026-11-01' }]
    for (let i = 0; i < N; i++) {
      const { events } = ledger(rand)
      const late = events.filter(e => e.type === 'in' && laDateKey(e.event_time) !== utcDate(e.event_time))
      for (const range of ranges) {
        // The definition: distinct LA dates of check-ins in range.
        const want = new Set(events.filter(e => e.type === 'in').map(e => laDateKey(e.event_time))
          .filter(d => (!range.since || d >= range.since) && (!range.until || d <= range.until))).size
        expect(daysPresent(events, range), `ledger ${i}`).toBe(want)
        // With the late check-ins taken out, the old and new rules agree.
        const early = events.filter(e => !late.includes(e))
        expect(daysPresent(early, range), `ledger ${i}`).toBe(oldDaysPresent(early, range))
        compared++
        if (daysPresent(events, range) !== oldDaysPresent(events, range)) differed++
      }
    }
    expect(compared).toBe(N * ranges.length)
    expect(differed).toBeGreaterThan(N * 0.3)   // POSITIVE CONTROL: the rule did change
  })

  test('days present counts an 8 PM check-in on the day it happened', () => {
    const events = [
      { id: 'a', type: 'in', event_time: '2026-09-30T22:30:00+00:00' },   // Wed 3:30 PM PDT
      { id: 'b', type: 'out', event_time: '2026-10-01T01:00:00+00:00' },
      { id: 'c', type: 'in', event_time: '2026-10-01T03:00:00+00:00' },   // Wed 8:00 PM PDT
      { id: 'd', type: 'out', event_time: '2026-10-01T04:00:00+00:00' },
    ]
    expect(daysPresent(events)).toBe(1)
    expect(daysPresent(events, { until: '2026-09-30' })).toBe(1)
    // Positive control: the old rule counted two days, one of them tomorrow.
    expect(oldDaysPresent(events)).toBe(2)
    expect(oldDaysPresent(events, { until: '2026-09-30' })).toBe(1)
  })
})

describe('"today" is the shop\'s today', () => {
  test('after 5 PM PDT the UTC date is tomorrow; the LA date, and the start of the LA day, are not', () => {
    vi.setSystemTime(new Date('2026-10-01T01:30:00Z'))             // Wed Sep 30, 6:30 PM PDT
    expect(laDateKey(Date.now())).toBe('2026-09-30')
    expect(laMidnightMs(laDateKey(Date.now()))).toBe(Date.parse('2026-09-30T07:00:00Z'))
    // Positive control: what the pages read before, and a morning where both agree.
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-01')
    vi.setSystemTime(new Date('2026-10-01T16:00:00Z'))             // Thu Oct 1, 9 AM PDT
    expect(laDateKey(Date.now())).toBe('2026-10-01')
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-10-01')
  })

  test('an open session checked in this evening is on today\'s Matrix column', () => {
    vi.setSystemTime(new Date('2026-10-01T02:00:00Z'))             // Wed Sep 30, 7 PM PDT
    const events = [{ id: 'i', type: 'in', event_time: '2026-10-01T00:30:00+00:00', category: 'build' }]
    expect(hoursByDay(events)).toEqual({ [laDateKey(Date.now())]: 1.5 })
    expect(laDateKey(Date.now())).toBe('2026-09-30')
    // Positive control: the old Matrix filed it under the UTC date.
    expect(oldAttendanceHoursByDate(events, null)).toEqual({ '2026-10-01': 1.5 })
  })
})
