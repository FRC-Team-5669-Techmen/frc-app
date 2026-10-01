// `src/reporting.js` kept its own `laDateKey` -- `toLocaleDateString('en-CA',
// { timeZone })`, leaning on the en-CA locale printing ISO order -- beside the
// one in src/hoursUtils.js, which every other hours surface buckets by. Two
// copies of the day rule is the thing that quietly stops matching (CLAUDE.md,
// working convention 7), so reporting now re-exports the hoursUtils one.
//
// Before the copy went, the two were compared here on every quarter hour of
// 2026 and every minute of both DST transition days, in each input shape a
// caller hands them (a PostgREST timestamptz string, a Date, epoch ms). The old
// copy is kept below VERBATIM as the oracle. Positive control: the comparison
// covers thousands of instants whose UTC date differs from their LA date, so
// agreement is not two functions that both just slice the UTC date.

import { describe, expect, test } from 'vitest'
import { laDateKey as reportingLaDateKey, buildRows, filterRows, rowsToCsv } from '../src/reporting.js'
import { laDateKey } from '../src/hoursUtils.js'

// src/reporting.js at 3d9dd54, verbatim.
const LA = 'America/Los_Angeles'
const oldLaDateKey = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: LA })

const MIN = 60_000
const utcDate = (ms) => new Date(ms).toISOString().slice(0, 10)
const pgrst = (ms) => new Date(ms).toISOString().replace('Z', '+00:00')   // "…T22:30:00.000+00:00"

function* instants() {
  // Every quarter hour of 2026.
  for (let t = Date.parse('2026-01-01T00:00:00Z'); t < Date.parse('2027-01-01T00:00:00Z'); t += 15 * MIN) yield t
  // Every minute of the two transition days, through the hour either side:
  // spring forward 2026-03-08 2 AM PST (10:00Z), fall back 2026-11-01 2 AM PDT (09:00Z).
  for (const day of ['2026-03-08', '2026-11-01']) {
    const start = Date.parse(`${day}T06:00:00Z`) - 24 * 60 * MIN
    for (let t = start; t < start + 48 * 60 * MIN; t += MIN) yield t
  }
  // The last millisecond of a day and the first of the next, in PDT and PST.
  for (const edge of ['2026-09-30T07:00:00Z', '2026-12-02T08:00:00Z', '2026-03-08T08:00:00Z', '2026-11-01T07:00:00Z', '2026-11-02T08:00:00Z']) {
    yield Date.parse(edge) - 1
    yield Date.parse(edge)
  }
}

describe('the day rule reporting uses', () => {
  test('is the hoursUtils function itself, not a copy', () => {
    expect(reportingLaDateKey).toBe(laDateKey)
  })

  test('matches the old reporting copy on every instant tried, in every input shape', () => {
    let n = 0, lateEvening = 0
    for (const t of instants()) {
      const want = oldLaDateKey(new Date(t).toISOString())
      expect(laDateKey(new Date(t).toISOString()), new Date(t).toISOString()).toBe(want)
      expect(laDateKey(pgrst(t))).toBe(want)
      expect(laDateKey(new Date(t))).toBe(want)
      expect(laDateKey(t)).toBe(want)
      if (want !== utcDate(t)) lateEvening++
      n++
    }
    expect(n).toBeGreaterThan(35_000)
    // POSITIVE CONTROL: 7 or 8 hours of every day have an LA date that is not
    // their UTC date; both functions had to get each of those right.
    expect(lateEvening).toBeGreaterThan(10_000)
  })

  test('PostgREST microsecond timestamps read the same as their millisecond form', () => {
    expect(laDateKey('2026-10-01T03:00:00.123456+00:00')).toBe('2026-09-30')
    expect(oldLaDateKey('2026-10-01T03:00:00.123456+00:00')).toBe('2026-09-30')
    expect(laDateKey('2026-10-01T07:00:00.000001+00:00')).toBe('2026-10-01')
  })
})

describe('a report row is dated by the session\'s Los Angeles day', () => {
  const nameById = { m1: 'Sam' }
  const att = [
    // Wed Sep 30, 8:00 to 9:30 PM PDT: 03:00Z to 04:30Z on Oct 1.
    { id: 'i1', user_id: 'm1', type: 'in', event_time: '2026-10-01T03:00:00+00:00', category: 'outreach' },
    { id: 'o1', user_id: 'm1', type: 'out', event_time: '2026-10-01T04:30:00+00:00' },
    // Wed Sep 30, 3:30 to 6:30 PM PDT: crosses 00:00 UTC.
    { id: 'i2', user_id: 'm1', type: 'in', event_time: '2026-09-30T22:30:00+00:00', category: 'build' },
    { id: 'o2', user_id: 'm1', type: 'out', event_time: '2026-10-01T01:30:00+00:00' },
  ]

  test('both sessions file under Sep 30, with their full hours', () => {
    const rows = buildRows(nameById, att, [], {})
    expect(rows.map(r => [r.date, r.hours]).sort()).toEqual([['2026-09-30', 1.5], ['2026-09-30', 3]])
    expect(filterRows(rows, { from: '2026-09-30', to: '2026-09-30' })).toHaveLength(2)
    // Positive control: the UTC date of either check-out (and of the evening
    // check-in) is Oct 1, and a filter on Oct 1 finds neither.
    expect(att[0].event_time.slice(0, 10)).toBe('2026-10-01')
    expect(filterRows(rows, { from: '2026-10-01', to: '2026-10-01' })).toHaveLength(0)
  })

  test('the CSV\'s Check In / Check Out are on the row\'s Date, in the shop\'s zone', () => {
    // The locale is the runner's own (the export keeps the device's format);
    // only the zone is pinned, so compare in whatever locale this is.
    const read = (t, timeZone) => new Date(t).toLocaleString(undefined, { timeZone })
    const csv = rowsToCsv(buildRows(nameById, att, [], {})).split('\r\n')
    const evening = csv.find(l => l.includes('Outreach'))
    expect(evening).toContain('"2026-09-30"')
    expect(evening).toContain(`"${read('2026-10-01T03:00:00Z', LA)}"`)
    expect(evening).toContain(`"${read('2026-10-01T04:30:00Z', LA)}"`)
    expect(evening).not.toContain(read('2026-10-01T03:00:00Z', 'UTC'))
    // Positive control: the two zones really print that instant differently.
    expect(read('2026-10-01T03:00:00Z', LA)).not.toBe(read('2026-10-01T03:00:00Z', 'UTC'))
  })
})
