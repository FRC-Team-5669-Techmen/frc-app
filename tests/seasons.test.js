import { describe, it, expect } from 'vitest'
import { resolveCurrentSeason } from '../src/seasons.js'
import { laDateKey } from '../src/hoursUtils.js'

const SEASONS = [
  { id: 'b27', name: 'Biocore 2027', start_date: '2027-01-07', end_date: null },
  { id: 'o26', name: 'Offseason 2026', start_date: '2026-05-01', end_date: '2027-01-06' },
]

describe('resolveCurrentSeason', () => {
  it('picks the season whose window holds the given LA date', () => {
    expect(resolveCurrentSeason(SEASONS, '2026-10-01')?.id).toBe('o26')
    expect(resolveCurrentSeason(SEASONS, '2027-01-06')?.id).toBe('o26')
    expect(resolveCurrentSeason(SEASONS, '2027-01-07')?.id).toBe('b27')
    expect(resolveCurrentSeason(SEASONS, '2026-04-30')).toBeNull()
    expect(resolveCurrentSeason([], '2026-10-01')).toBeNull()
  })

  // The defect: at 4 PM PST on 2027-01-06 the UTC date is already 2027-01-07,
  // so the old default turned the season over a day early.
  it('defaults to the LA date, not the UTC date', () => {
    const evening = Date.parse('2027-01-07T00:30:00Z') // 4:30 PM PST, Jan 6
    expect(laDateKey(evening)).toBe('2027-01-06')
    expect(new Date(evening).toISOString().slice(0, 10)).toBe('2027-01-07') // what the old rule read
    expect(resolveCurrentSeason(SEASONS, laDateKey(evening))?.id).toBe('o26')
    // Positive control: the UTC reading of the same instant really does pick
    // the next season, so the assertion above is not vacuous.
    expect(resolveCurrentSeason(SEASONS, new Date(evening).toISOString().slice(0, 10))?.id).toBe('b27')
  })
})
