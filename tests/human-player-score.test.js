// The Human Player Score (src/humanPlayerScore.js, ledger 0025). Every
// refusal or absence below has a positive control on the same fixture.
import { describe, expect, it } from 'vitest'
import { HP_RULES, attemptValue, drillSummary, leaderboard, isFullRun, attemptProblem, needsText, fmtValue } from '../src/humanPlayerScore.js'
import { MATCH_SECONDS } from '../src/matchSim.js'

let n = 0
const at = (member, drill, made, extra = {}) => {
  n += 1
  const base = drill === 'accuracy' ? { attempted: 20 } : drill === 'rate' ? { attempted: 40, seconds: 30 } : { attempted: made + 10, seconds: MATCH_SECONDS, made_inactive: 2 }
  return { id: `a${n}`, member_id: member, drill, made, attempt_date: extra.attempt_date ?? `2026-10-${String(10 + (n % 15)).padStart(2, '0')}`, created_at: `2026-10-${String(10 + (n % 15)).padStart(2, '0')}T20:00:00Z`, voided_at: null, ...base, ...extra }
}
const three = (member, drill, vals, extra) => vals.map((v) => at(member, drill, v, extra))
const full = (member, acc, rate, match) => [...three(member, 'accuracy', acc), ...three(member, 'rate', rate), ...three(member, 'match', match)]
const SEASON = { start_date: '2026-05-01', end_date: '2027-01-06' }
const names = { a: 'Ana', b: 'Ben', c: 'Cy', d: 'Dee' }
const nameOf = (id) => names[id]

describe('attempt values', () => {
  it('accuracy is made/attempted, rate made/second, match the active makes only', () => {
    expect(attemptValue(at('a', 'accuracy', 15))).toBe(0.75)
    expect(attemptValue(at('a', 'rate', 15))).toBe(0.5)
    expect(attemptValue(at('a', 'match', 31))).toBe(31)
  })
  it('a void counts for nothing (against the same attempt unvoided)', () => {
    const x = at('a', 'match', 31)
    expect(attemptValue(x)).toBe(31)
    expect(attemptValue({ ...x, voided_at: '2026-10-11T00:00:00Z' })).toBeNull()
  })
  it('a partial match run does not count; a full one and one with no clock recorded do', () => {
    expect(isFullRun({ seconds: MATCH_SECONDS })).toBe(true)
    expect(isFullRun({ seconds: null })).toBe(true)
    expect(isFullRun({ seconds: Math.floor(MATCH_SECONDS * 0.5) })).toBe(false)
    expect(attemptValue(at('a', 'match', 40, { seconds: 60 }))).toBeNull()
  })
})

describe('recent best', () => {
  it('is the mean of the best 3 of the last 5, so one lucky old run is out of the window', () => {
    const list = [
      at('a', 'match', 90, { attempt_date: '2026-09-01' }), // lucky, but sixth newest
      ...[10, 20, 30, 40, 50].map((v, i) => at('a', 'match', v, { attempt_date: `2026-10-0${i + 1}` })),
    ]
    const s = drillSummary(list, 'match')
    expect(s.value).toBe(40) // (50 + 40 + 30) / 3
    expect(s.personalBest).toBe(90)
    expect(s.attempts).toBe(6)
  })
  it('one great run among weak ones does not carry a player: best 3 averages it down', () => {
    const lucky = drillSummary([at('a', 'match', 60), at('a', 'match', 10), at('a', 'match', 10)], 'match')
    const steady = drillSummary([at('b', 'match', 30), at('b', 'match', 30), at('b', 'match', 30)], 'match')
    expect(steady.value).toBeGreaterThan(lucky.value)
  })
  it('counts how many more attempts are needed', () => {
    expect(drillSummary([at('a', 'rate', 10)], 'rate').needs).toBe(HP_RULES.MIN_ATTEMPTS - 1)
    expect(drillSummary(three('a', 'rate', [1, 2, 3]), 'rate').needs).toBe(0)
  })
})

describe('the leaderboard', () => {
  const data = [
    ...full('a', [18, 18, 18], [24, 24, 24], [40, 40, 40]), // best everywhere
    ...full('b', [20, 20, 20], [12, 12, 12], [20, 20, 20]), // most accurate, slower, half the match FUEL
    ...three('c', 'match', [50, 50]), ...three('c', 'rate', [30]), // unranked: needs 1 match, 2 rate, 3 accuracy
  ]
  const board = leaderboard(data, SEASON, nameOf)

  it('ranks qualified players only; the unqualified are listed with what they need', () => {
    expect(board.ranked.map((r) => r.name)).toEqual(['Ana', 'Ben'])
    expect(board.unranked.map((r) => r.name)).toEqual(['Cy'])
    expect(needsText(board.unranked[0].needs)).toBe('needs 1 more match run, 2 more rate, 3 more accuracy')
  })
  it('scores 0 to 100 against the team best: Ana tops rate and match, Ben tops accuracy', () => {
    const [ana, ben] = board.ranked
    // Ana: 0.5 x 1 + 0.3 x 1 + 0.2 x 0.9 = 0.98
    expect(ana.score).toBe(98)
    // Ben: 0.5 x 0.5 + 0.3 x 0.5 + 0.2 x 1 = 0.6
    expect(ben.score).toBe(60)
    expect(board.teamBest.match).toBe(40)
  })
  it('an unqualified player does not set the team best (Cy 50 match FUEL against Ana 40)', () => {
    expect(board.teamBest.match).toBe(40)
    // positive control: give Cy one more full run and the third accuracy and rate sets, and Cy sets it
    const more = leaderboard([...data, at('c', 'match', 50), ...three('c', 'accuracy', [10, 10, 10]), ...three('c', 'rate', [30, 30])], SEASON, nameOf)
    expect(more.teamBest.match).toBe(50)
    expect(more.ranked.map((r) => r.name)).toContain('Cy')
  })
  it('the match run outweighs accuracy: a perfect shooter with half the match FUEL ranks below', () => {
    expect(HP_RULES.MATCH_WEIGHT).toBeGreaterThan(HP_RULES.RATE_WEIGHT)
    expect(HP_RULES.RATE_WEIGHT).toBeGreaterThan(HP_RULES.ACCURACY_WEIGHT)
    expect(HP_RULES.MATCH_WEIGHT + HP_RULES.RATE_WEIGHT + HP_RULES.ACCURACY_WEIGHT).toBeCloseTo(1)
  })
  it('season scoping drops attempts outside the season (against All time keeping them)', () => {
    const old = full('d', [20, 20, 20], [30, 30, 30], [60, 60, 60]).map((x) => ({ ...x, attempt_date: '2025-02-01' }))
    expect(leaderboard([...data, ...old], SEASON, nameOf).ranked.map((r) => r.name)).not.toContain('Dee')
    const all = leaderboard([...data, ...old], null, nameOf)
    expect(all.ranked[0].name).toBe('Dee')
    expect(all.ranked[0].score).toBe(100)
  })
  it('voided attempts leave the board (against the same rows unvoided)', () => {
    const voided = data.map((x) => (x.member_id === 'a' && x.drill === 'match' ? { ...x, voided_at: '2026-10-20T00:00:00Z' } : x))
    const b2 = leaderboard(voided, SEASON, nameOf)
    expect(b2.ranked.map((r) => r.name)).toEqual(['Ben'])
    expect(b2.unranked.map((r) => r.name)).toContain('Ana')
  })
  it('ties share a rank', () => {
    const tie = leaderboard([...full('a', [10, 10, 10], [10, 10, 10], [10, 10, 10]), ...full('b', [10, 10, 10], [10, 10, 10], [10, 10, 10])], SEASON, nameOf)
    expect(tie.ranked.map((r) => r.rank)).toEqual([1, 1])
    expect(tie.ranked[0].score).toBe(100)
  })
  it('a team that made nothing scores 0, not NaN', () => {
    const z = leaderboard(full('a', [0, 0, 0], [0, 0, 0], [0, 0, 0]), SEASON, nameOf)
    expect(z.ranked[0].score).toBe(0)
  })
})

describe('the form check', () => {
  it('accepts a sound attempt of each drill and refuses the broken ones', () => {
    expect(attemptProblem({ drill: 'accuracy', date: '2026-10-20', made: '15', attempted: '20' })).toBeNull()
    expect(attemptProblem({ drill: 'rate', date: '2026-10-20', made: '15', attempted: '22', seconds: '30' })).toBeNull()
    expect(attemptProblem({ drill: 'match', date: '2026-10-20', made: '30', madeInactive: '4', attempted: '40', seconds: '163' })).toBeNull()
    expect(attemptProblem({ drill: 'accuracy', date: '2026-10-20', made: '21', attempted: '20' })).toMatch(/More made/)
    expect(attemptProblem({ drill: 'match', date: '2026-10-20', made: '30', madeInactive: '11', attempted: '40', seconds: '163' })).toMatch(/More made/)
    expect(attemptProblem({ drill: 'rate', date: '2026-10-20', made: '1', attempted: '2', seconds: '' })).toMatch(/Seconds/)
  })
  it('formats values', () => {
    expect(fmtValue('accuracy', 0.75)).toBe('75%')
    expect(fmtValue('rate', 0.5)).toBe('0.50/s')
    expect(fmtValue('match', 33.333)).toBe('33.3')
    expect(fmtValue('match', null)).toBe('--')
  })
})
