import { describe, it, expect } from 'vitest'
import { eventDayKeys, isMultiDay } from '../src/eventDays'

describe('eventDayKeys', () => {
  it('a three-day competition across the DST change covers all three LA days', () => {
    const ev = { starts_at: '2026-10-31T00:00:00Z', ends_at: '2026-11-02T01:30:00Z' } // Oct 30 5 PM to Nov 1 5:30 PM LA
    expect(eventDayKeys(ev)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
    expect(isMultiDay(ev)).toBe(true)
  })
  it('an evening session stays on one day (positive control for the single-day path)', () => {
    const ev = { starts_at: '2026-10-23T22:05:00Z', ends_at: '2026-10-24T01:00:00Z' } // 3:05 to 6:00 PM LA
    expect(eventDayKeys(ev)).toEqual(['2026-10-23'])
    expect(isMultiDay(ev)).toBe(false)
  })
  it('an event ending exactly at LA midnight does not spill into the next day', () => {
    const ev = { starts_at: '2026-10-24T02:00:00Z', ends_at: '2026-10-24T07:00:00Z' } // Oct 23 7 PM to midnight
    expect(eventDayKeys(ev)).toEqual(['2026-10-23'])
  })
  it('an event with no end is its start day', () => {
    expect(eventDayKeys({ starts_at: '2026-10-23T22:05:00Z', ends_at: null })).toEqual(['2026-10-23'])
  })
})
