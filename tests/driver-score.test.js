// The Driver Score (src/driverScore.js, migration 0029, ledger 0020). Every
// "counts for nothing" claim is paired with the same fixture counting for
// something, so a function that returned zeros everywhere fails here.
import { describe, expect, it } from 'vitest'
import { driverScore, leaderboard, ratingMean, latestPerCoach, inSeason, SCORE_RULES, fmtMinutes, sessionProblem } from '../src/driverScore.js'

const S = (member, date, minutes, kind, extra = {}) => ({ id: `${member}-${date}-${kind}-${minutes}`, member_id: member, session_date: date, minutes, kind, sim_score: null, voided_at: null, ...extra })
const R = (driver, coach, at, v, extra = {}) => ({ id: `${driver}-${coach}-${at}`, driver_id: driver, coach_id: coach, rated_at: at, control: v, awareness: v, scoring: v, defense: v, consistency: v, ...extra })
const FALL = { id: 'fall', name: 'Offseason 2026', start_date: '2026-05-01', end_date: '2027-01-06' }

describe('driverScore', () => {
  it('scores real hours with diminishing returns: 10 practice hours is 1 - 1/e of the experience half', () => {
    const r = driverScore({ sessions: [S('a', '2026-10-01', 600, 'practice_field')] })
    expect(r.realHours).toBe(10)
    expect(r.experience).toBeCloseTo(1 - Math.exp(-1), 6)
    expect(r.score).toBe(Math.round(100 * 0.5 * (1 - Math.exp(-1))))
    // Diminishing: the second 10 hours add less than the first 10.
    const twenty = driverScore({ sessions: [S('a', '2026-10-01', 600, 'match'), S('a', '2026-10-02', 600, 'test')] })
    expect(twenty.experience - r.experience).toBeLessThan(r.experience)
    expect(twenty.experience).toBeGreaterThan(r.experience)
  })

  it('weighs MoSim lower than the real robot: the same minutes score less, but not zero', () => {
    const real = driverScore({ sessions: [S('a', '2026-10-01', 120, 'match')] })
    const sim = driverScore({ sessions: [S('a', '2026-10-01', 120, 'mosim', { sim_score: 1400 })] })
    expect(sim.simHours).toBe(2)
    expect(sim.practiceHours).toBeCloseTo(2 * SCORE_RULES.SIM_WEIGHT, 6)
    expect(sim.experience).toBeGreaterThan(0)
    expect(sim.experience).toBeLessThan(real.experience)
    expect(sim.bestSim).toBe(1400)
    expect(real.bestSim).toBeNull()
  })

  it('a voided session counts for nothing, against the same session counting when not voided', () => {
    const live = driverScore({ sessions: [S('a', '2026-10-01', 90, 'match')] })
    const dead = driverScore({ sessions: [S('a', '2026-10-01', 90, 'match', { voided_at: '2026-10-02T00:00:00Z' })] })
    expect(live.realHours).toBe(1.5)
    expect(live.sessions).toBe(1)
    expect(dead.realHours).toBe(0)
    expect(dead.sessions).toBe(0)
  })

  it('coach ratings: newest per coach counts, the mean across coaches, 1..5 mapped to 0..1', () => {
    const ratings = [R('a', 'c1', '2026-09-01T18:00:00Z', 2), R('a', 'c1', '2026-10-01T18:00:00Z', 5), R('a', 'c2', '2026-09-15T18:00:00Z', 3)]
    expect(latestPerCoach(ratings).map((r) => r.control).sort()).toEqual([3, 5])
    const r = driverScore({ ratings })
    expect(r.coachAvg).toBe(4)
    expect(r.coaches).toBe(2)
    expect(r.score).toBe(Math.round(100 * 0.5 * 0.75))
    const top = driverScore({ sessions: [S('a', '2026-10-01', 6000, 'match')], ratings: [R('a', 'c1', '2026-10-01T18:00:00Z', 5)] })
    expect(top.score).toBe(100)
  })

  it('a rating mean skips criteria not seen; a rating with none is not counted', () => {
    expect(ratingMean({ control: 4, awareness: null, scoring: 2, defense: undefined, consistency: null })).toBe(3)
    expect(ratingMean({ control: null })).toBeNull()
    expect(driverScore({ ratings: [R('a', 'c1', '2026-10-01T00:00:00Z', null)] }).coachAvg).toBeNull()
  })
})

describe('leaderboard', () => {
  const sessions = [
    S('a', '2026-10-01', 300, 'practice_field'),
    S('b', '2026-10-01', 600, 'mosim'),
    S('c', '2026-04-10', 900, 'match'), // before the fall season: All time only
    S('d', '2026-10-02', 60, 'match', { voided_at: '2026-10-03T00:00:00Z' }), // void: nowhere
  ]
  const ratings = [R('b', 'm', '2026-10-01T18:00:00Z', 4)]
  const names = { a: 'Sam', b: 'Riley', c: 'Casey', d: 'Dee' }

  it('scopes to the season and orders by Driver Score; a rated MoSim driver can lead an unrated real driver', () => {
    const rows = leaderboard(sessions, ratings, FALL, (id) => names[id])
    expect(rows.map((r) => r.name)).toEqual(['Riley', 'Sam'])
    expect(rows[0].rank).toBe(1)
    expect(rows[1].rank).toBe(2)
  })

  it('All time brings the old season back; a voided-only driver never appears (against three who do)', () => {
    const rows = leaderboard(sessions, ratings, null, (id) => names[id])
    expect(rows.map((r) => r.name).sort()).toEqual(['Casey', 'Riley', 'Sam'])
    expect(rows.find((r) => r.name === 'Casey').realHours).toBe(15)
    expect(rows.some((r) => r.name === 'Dee')).toBe(false)
  })

  it('ties share a rank and break on real hours for order', () => {
    const rows = leaderboard([S('x', '2026-10-01', 60, 'match'), S('y', '2026-10-01', 60, 'test')], [], FALL, (id) => id)
    expect(rows.map((r) => r.rank)).toEqual([1, 1])
  })

  it('inSeason and formatting', () => {
    expect(inSeason('2026-05-01', FALL)).toBe(true)
    expect(inSeason('2026-04-30', FALL)).toBe(false)
    expect(inSeason('2020-01-01', null)).toBe(true)
    expect(fmtMinutes(125)).toBe('2h 05m')
    expect(fmtMinutes(40)).toBe('40m')
    expect(sessionProblem({ kind: 'match', minutes: '30', date: '2026-10-01', score: '' })).toBeNull()
    expect(sessionProblem({ kind: 'match', minutes: '30', date: '2026-10-01', score: '50' })).toMatch(/MoSim/)
    expect(sessionProblem({ kind: 'mosim', minutes: '0', date: '2026-10-01', score: '' })).toMatch(/Minutes/)
  })
})
