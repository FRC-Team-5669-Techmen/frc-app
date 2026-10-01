// What the My Hours fix changed for every OTHER page that reads src/hoursUtils.js,
// stated as properties over many generated ledgers rather than a few examples.
//
// The fix made `buildBreakdown` sum `sessionsFromEvents` instead of running its
// own pairing inside UTC-date groups, and rebased `computeHoursMs` (HomePage,
// ParentHomePage, RosterPage) and `computePendingMs` on that same pairing. The
// three implementations as they stood at 89896ca are copied below VERBATIM as
// oracles, and the properties are:
//
//   1. computeHoursMs and computePendingMs return exactly what they returned
//      before, on every ledger -- those pages do not change at all.
//   2. buildBreakdown's per-category totals differ from before by EXACTLY the
//      closed, counted sessions whose IN and OUT fall on different UTC dates --
//      the rows the old grouping dropped, and nothing else.
//   3. On ledgers where no session crosses 00:00 UTC (and so no instant's LA
//      date differs from its UTC date), the per-season maps are identical.
//
// Positive controls: (2) is asserted alongside a count of ledgers where the
// dropped set was non-empty, so it cannot pass on a generator that never
// produces a crossing session; and the oracle is shown to disagree with the
// shipped function on the one-session fixture from the report.

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  buildBreakdown, sumBreakdown, sessionsFromEvents, computeHoursMs, computePendingMs,
  cappedSession, CATEGORIES,
} from '../src/hoursUtils.js'
import { normAttendanceCategory, loggedTypeToCategory, emptyBreakdown } from '../src/categories.js'

const H = 3600_000
const NOW = Date.parse('2026-10-01T19:00:00Z')

// ── The oracles: src/hoursUtils.js at 89896ca, verbatim ─────────────────────

function oldComputeHoursMs(events) {
  let total = 0
  let inTime = null
  for (const e of [...events].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))) {
    if (e.type === 'in') {
      inTime = new Date(e.event_time)
    } else if (e.type === 'out' && inTime) {
      total += cappedSession(inTime, new Date(e.event_time)).ms
      inTime = null
    }
  }
  if (inTime) total += cappedSession(inTime, null).ms
  return total
}

function oldComputePendingMs(attendanceEvents, pendingCheckoutIds) {
  if (!pendingCheckoutIds?.size) return 0
  let total = 0
  let inTime = null
  const sorted = [...attendanceEvents].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  for (const e of sorted) {
    if (e.type === 'in') {
      inTime = new Date(e.event_time)
    } else if (e.type === 'out' && inTime) {
      if (pendingCheckoutIds.has(e.id)) {
        total += cappedSession(inTime, new Date(e.event_time)).ms
      }
      inTime = null
    }
  }
  return total
}

function oldSidFor(dateStr, seasons) {
  return seasons.find(s => dateStr >= s.start_date && dateStr <= s.end_date)?.id ?? 'other'
}

function oldBuildBreakdown(seasons, attendanceEvents, loggedHoursRows, excludedCheckoutIds = null, adjustments = []) {
  const raw = {}
  const addHours = (sid, cat, hours) => {
    const b = (raw[sid] ??= {})
    b[cat] = (b[cat] ?? 0) + hours
  }
  const byDate = {}
  for (const e of attendanceEvents) {
    ;(byDate[e.event_time.slice(0, 10)] ??= []).push(e)
  }
  for (const [date, evts] of Object.entries(byDate)) {
    evts.sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
    let inTime = null, inCat = null
    for (const e of evts) {
      if (e.type === 'in') {
        inTime = new Date(e.event_time)
        inCat  = normAttendanceCategory(e.category)
      } else if (e.type === 'out' && inTime) {
        if (!excludedCheckoutIds || !excludedCheckoutIds.has(e.id)) {
          addHours(oldSidFor(date, seasons), inCat, cappedSession(inTime, new Date(e.event_time)).ms / 3600000)
        }
        inTime = null; inCat = null
      }
    }
  }
  const sorted = [...attendanceEvents].sort((a, b) => new Date(a.event_time) - new Date(b.event_time))
  let openIn = null, openDate = null, openCat = null
  for (const e of sorted) {
    if (e.type === 'in') { openIn = new Date(e.event_time); openDate = e.event_time.slice(0, 10); openCat = normAttendanceCategory(e.category) }
    else if (e.type === 'out' && openIn) { openIn = null; openDate = null; openCat = null }
  }
  if (openIn) addHours(oldSidFor(openDate, seasons), openCat, cappedSession(openIn, null).ms / 3600000)
  for (const row of loggedHoursRows) {
    addHours(oldSidFor(row.date, seasons), loggedTypeToCategory(row.type), parseFloat(row.hours))
  }
  for (const a of adjustments) {
    const date = (a.created_at ?? '').slice(0, 10)
    addHours(oldSidFor(date, seasons), normAttendanceCategory(a.category), parseFloat(a.hours) || 0)
  }
  const result = {}
  for (const [sid, b] of Object.entries(raw)) {
    const out = emptyBreakdown()
    for (const c of CATEGORIES) { out[c.key] = b[c.key] ?? 0; out.total += out[c.key] }
    result[sid] = out
  }
  return result
}

// ── Generated ledgers ──────────────────────────────────────────────────────
// A seeded PRNG, so a failure names a reproducible ledger index.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const CATS = ['build', 'outreach', 'volunteer', 'competition', null, 'normal', 'fundraising']
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', '+00:00')

// One member's ledger: mostly well-formed IN/OUT sessions, with double INs,
// stray OUTs, forgotten check-outs that the next day closes, a few marked for
// review, and sometimes a trailing open IN. `sameUtcDay` keeps every event
// between 08:00 and 23:59 UTC on its session's day, where LA date = UTC date.
function ledger(rand, { sameUtcDay = false } = {}) {
  const events = []
  const reviews = []
  let id = 0
  const nextId = (p) => `${p}${id++}`
  const day0 = Date.parse('2026-08-01T00:00:00Z')
  const days = 4 + Math.floor(rand() * 20)
  for (let d = 0; d < days; d++) {
    const base = day0 + d * 2 * 86_400_000
    const r = rand()
    const startH = sameUtcDay ? 8 + rand() * 10 : 14 + rand() * 9     // 14:00-23:00Z = 7 AM-4 PM PDT
    const lenH = sameUtcDay ? rand() * (23.9 - startH) : 0.25 + rand() * 6
    const inMs = base + startH * H
    const outMs = inMs + lenH * H
    const cat = CATS[Math.floor(rand() * CATS.length)]
    if (r < 0.06) {                                   // a stray OUT with nothing open
      events.push({ id: nextId('o'), type: 'out', event_time: iso(inMs) })
      continue
    }
    if (r < 0.14) {                                   // a double IN
      events.push({ id: nextId('i'), type: 'in', event_time: iso(inMs - 0.5 * H), category: cat })
    }
    events.push({ id: nextId('i'), type: 'in', event_time: iso(inMs), category: cat })
    if (r > 0.95 && !sameUtcDay) {                    // forgotten: closed the next day (capped)
      events.push({ id: nextId('o'), type: 'out', event_time: iso(inMs + 26 * H) })
      continue
    }
    const outId = nextId('o')
    events.push({ id: outId, type: 'out', event_time: iso(outMs), category: 'build' })
    if (rand() < 0.1) reviews.push(outId)
  }
  if (rand() < 0.3) {                                 // a member checked in right now
    const t = sameUtcDay ? Date.parse('2026-10-01T18:00:00Z') : NOW - rand() * 3 * H
    events.push({ id: nextId('i'), type: 'in', event_time: iso(t), category: CATS[Math.floor(rand() * 4)] })
  }
  // Shuffle: callers may pass events in any order.
  for (let i = events.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)); [events[i], events[j]] = [events[j], events[i]]
  }
  return { events, excluded: new Set(reviews) }
}

const SEASONS = [{ id: 'all', name: 'All', start_date: '2026-01-01', end_date: '2027-12-31' }]
const N = 400

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)) })
afterEach(() => { vi.useRealTimers() })

describe('pages that only read computeHoursMs / computePendingMs do not change', () => {
  test(`computeHoursMs equals the 89896ca implementation on ${N} ledgers`, () => {
    const rand = mulberry32(5669)
    let nonzero = 0
    for (let i = 0; i < N; i++) {
      const { events } = ledger(rand)
      const want = oldComputeHoursMs(events)
      expect(computeHoursMs(events), `ledger ${i}`).toBe(want)
      if (want > 0) nonzero++
    }
    expect(nonzero).toBeGreaterThan(N * 0.9)  // positive control: not 0 === 0
  })

  test(`computePendingMs equals the 89896ca implementation on ${N} ledgers`, () => {
    const rand = mulberry32(2026)
    let nonzero = 0
    for (let i = 0; i < N; i++) {
      const { events, excluded } = ledger(rand)
      const want = oldComputePendingMs(events, excluded)
      expect(computePendingMs(events, excluded), `ledger ${i}`).toBe(want)
      if (want > 0) nonzero++
    }
    expect(nonzero).toBeGreaterThan(N * 0.2)
  })
})

describe('buildBreakdown changed by exactly the rows the UTC-date grouping dropped', () => {
  test(`on ${N} ledgers: new - old = the closed, counted sessions spanning 00:00 UTC, per category`, () => {
    const rand = mulberry32(17)
    let withDropped = 0
    for (let i = 0; i < N; i++) {
      const { events, excluded } = ledger(rand)
      const now = sumBreakdown(buildBreakdown(SEASONS, events, [], excluded))
      const was = sumBreakdown(oldBuildBreakdown(SEASONS, events, [], excluded))
      const dropped = emptyBreakdown()
      for (const s of sessionsFromEvents(events)) {
        if (s.open || excluded.has(s.outId)) continue
        if (s.inTime.toISOString().slice(0, 10) === s.outTime.toISOString().slice(0, 10)) continue
        dropped[s.category] += s.ms / H
        dropped.total += s.ms / H
      }
      if (dropped.total > 0) withDropped++
      for (const key of [...CATEGORIES.map(c => c.key), 'total']) {
        expect(now[key] - was[key], `ledger ${i} ${key}`).toBeCloseTo(dropped[key], 9)
      }
    }
    // POSITIVE CONTROL: the property was exercised, not satisfied by 0 = 0.
    expect(withDropped).toBeGreaterThan(N * 0.5)
  })

  test(`on ${N} ledgers with no session crossing 00:00 UTC, the per-season maps are identical`, () => {
    const rand = mulberry32(42)
    const seasons = [
      { id: 'aug', name: 'Aug', start_date: '2026-08-01', end_date: '2026-08-20' },
      { id: 'late', name: 'Late', start_date: '2026-08-21', end_date: '2026-12-31' },
    ]
    for (let i = 0; i < N; i++) {
      const { events, excluded } = ledger(rand, { sameUtcDay: true })
      const now = buildBreakdown(seasons, events, [], excluded)
      const was = oldBuildBreakdown(seasons, events, [], excluded)
      expect(Object.keys(now).sort(), `ledger ${i}`).toEqual(Object.keys(was).sort())
      for (const sid of Object.keys(was)) {
        for (const key of [...CATEGORIES.map(c => c.key), 'total']) {
          expect(now[sid][key], `ledger ${i} ${sid} ${key}`).toBeCloseTo(was[sid][key], 9)
        }
      }
    }
  })

  test('POSITIVE CONTROL: the oracle really is the old behaviour -- it drops the reported session', () => {
    const events = [
      { id: 'i', type: 'in', event_time: '2026-09-15T22:30:00+00:00', category: 'volunteer' },
      { id: 'o', type: 'out', event_time: '2026-09-16T01:30:00+00:00', category: 'build' },
    ]
    expect(sumBreakdown(oldBuildBreakdown(SEASONS, events, [])).volunteer).toBe(0)
    expect(sumBreakdown(buildBreakdown(SEASONS, events, [])).volunteer).toBeCloseTo(3, 9)
  })
})
