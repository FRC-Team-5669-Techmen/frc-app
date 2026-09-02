// `src/hoursResolve.js` -- the shared duration math both anomaly-resolve
// surfaces call (the inline cards on /verify-hours and the per-member EventRow
// block in MemberHoursAdmin).
//
// THE RULE THIS MODULE EXISTS TO ENFORCE is that an hours ledger never offers a
// plausible check-out time. The model is an OFFSET IN MINUTES where `null`
// means nothing entered, so there is no zero-ish instant a caller could render
// by accident, and exactly one function turns an offset into a timestamp.
// Every test below is one edge of that rule.
//
// Rebuilt as a real test rather than referenced: the log records these
// properties as measured inside a headless harness that was deleted after the
// run, so nothing has re-checked them since.

import { describe, expect, test } from 'vitest'
import {
  STEP_MINUTES, DURATION_PRESETS,
  fmtSpanMins, stepMinutes, setPreset, endInstantMs, minutesFromInstant, resolveReadout,
} from '../src/hoursResolve.js'

const IN_MS = new Date('2026-09-02T15:00:00Z').getTime()

describe('the null-means-nothing-entered model', () => {
  test('stepping up from nothing entered gives one step, not zero', () => {
    expect(stepMinutes(null, STEP_MINUTES)).toBe(30)
  })

  test('stepping down to or past the check-in CLEARS the field', () => {
    expect(stepMinutes(30, -STEP_MINUTES)).toBe(null)
    expect(stepMinutes(15, -STEP_MINUTES)).toBe(null)
    expect(stepMinutes(null, -STEP_MINUTES)).toBe(null)
  })

  test('a zero-length session is unreachable from any step or preset', () => {
    for (let cur = 0; cur <= 240; cur += 15) {
      for (const d of [-120, -60, -30, 30, 60]) {
        const next = stepMinutes(cur || null, d)
        expect(next === null || next > 0).toBe(true)
      }
    }
    for (const m of [-60, -1, 0]) expect(setPreset(m)).toBe(null)
  })

  test('the high end is deliberately unclamped', () => {
    // An implausibly long session is still a thing that can have happened, and
    // the readout says so. Clamping it would silently rewrite what staff typed.
    expect(stepMinutes(60 * 40, 30)).toBe(2430)
  })

  test('a preset REPLACES the offset rather than adding to it', () => {
    expect(setPreset(90)).toBe(90)
    for (const p of DURATION_PRESETS) expect(setPreset(p)).toBe(p)
  })

  test('endInstantMs is the only place an offset becomes a timestamp', () => {
    expect(endInstantMs(IN_MS, null)).toBe(null)
    expect(endInstantMs(IN_MS, 90)).toBe(IN_MS + 90 * 60000)
  })

  test('POSITIVE CONTROL: an entered offset does produce a real instant', () => {
    // Without this the null assertions above are satisfied by a module that
    // returns null for everything, which is the failure they cannot see.
    const out = endInstantMs(IN_MS, 30)
    expect(out).toBeGreaterThan(IN_MS)
    expect(new Date(out).toISOString()).toBe('2026-09-02T15:30:00.000Z')
  })
})

describe('minutesFromInstant: the datetime-field bridge', () => {
  test('a null check-out is nothing entered', () => {
    expect(minutesFromInstant(IN_MS, null)).toBe(null)
  })

  test('a check-out at or before the check-in is nothing entered, never a negative', () => {
    expect(minutesFromInstant(IN_MS, IN_MS)).toBe(null)
    expect(minutesFromInstant(IN_MS, IN_MS - 60000)).toBe(null)
  })

  test('a real check-out round-trips through the offset', () => {
    const outMs = IN_MS + 135 * 60000
    const mins = minutesFromInstant(IN_MS, outMs)
    expect(mins).toBe(135)
    expect(endInstantMs(IN_MS, mins)).toBe(outMs)
  })
})

describe('the readout', () => {
  test('says nothing entered when nothing is entered', () => {
    expect(resolveReadout(IN_MS, null)).toBe('No check-out entered')
  })

  test('names the span and the ending clock time', () => {
    const line = resolveReadout(IN_MS, 90)
    expect(line).toMatch(/Session length: 1h 30m/)
    expect(line).toMatch(/ending/)
  })

  test('names the DATE too when the session crosses midnight', () => {
    // A stepped session can run past midnight, and "1:00 AM" alone would not
    // say which day. Measured in this process's own timezone so the assertion
    // is about the branch, not about a hardcoded offset.
    const lateIn = new Date('2026-09-02T00:00:00Z').getTime()
    const sameDay = resolveReadout(lateIn, 60)
    const nextDay = resolveReadout(lateIn, 60 * 30) // +30h is always another day
    expect(nextDay.split('ending')[1]).toMatch(/,/)
    expect(sameDay.split('ending')[1]).not.toMatch(/,/)
  })

  test('fmtSpanMins drops the empty half rather than printing 1h 0m', () => {
    expect(fmtSpanMins(30)).toBe('30m')
    expect(fmtSpanMins(60)).toBe('1h')
    expect(fmtSpanMins(90)).toBe('1h 30m')
    expect(fmtSpanMins(150)).toBe('2h 30m')
  })
})

describe('the presets are the durations a session actually tends to be', () => {
  test('every preset is positive, ascending, and survives setPreset unchanged', () => {
    expect(DURATION_PRESETS.length).toBeGreaterThan(0)
    let prev = 0
    for (const p of DURATION_PRESETS) {
      expect(p).toBeGreaterThan(prev)
      expect(setPreset(p)).toBe(p)
      prev = p
    }
  })

  test('STEP_MINUTES is the half-hour the two surfaces share', () => {
    expect(STEP_MINUTES).toBe(30)
  })
})
