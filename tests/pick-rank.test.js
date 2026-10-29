// The pick board's ranking (src/scouting/pickRank.js, ledger 0032). Each
// claim is driven both ways on the same fixture, so a function that returned
// nothing or ignored its input would fail.
import { describe, expect, it } from 'vitest'
import { boardOrder, compactMatches, dataRatings, rankingFromMatches, roleScore, scoutSignals, solveRidge, teamValue } from '../src/scouting/pickRank.js'
import prior from '../src/scouting/priors/2026cabl.json'

// Six teams with known strengths; every alliance score is the exact sum.
const TRUE = { 1: 60, 2: 45, 3: 30, 4: 20, 5: 10, 6: 5 }
const SCHEDULE = [[1, 2, 3, 4, 5, 6], [1, 4, 5, 2, 3, 6], [1, 3, 6, 2, 4, 5], [1, 5, 6, 2, 3, 4], [1, 2, 6, 3, 4, 5], [1, 3, 4, 2, 5, 6], [2, 4, 6, 1, 3, 5], [3, 5, 6, 1, 2, 4]]
const sum = list => list.reduce((s, t) => s + TRUE[t], 0)
const rows = SCHEDULE.flatMap(m => [{ teams: m.slice(0, 3), y: sum(m.slice(0, 3)) }, { teams: m.slice(3), y: sum(m.slice(3)) }])

describe('solveRidge', () => {
  it('recovers exact contributions with almost no pull', () => {
    const r = solveRidge(rows, { lambda: 1e-6 })
    for (const [t, v] of Object.entries(TRUE)) expect(r.get(Number(t)).value).toBeCloseTo(v, 3)
    expect(r.get(1).n).toBe(8)
  })
  it('a strong pull holds a team near its prior; a weak pull lets the data win (both directions)', () => {
    const p = new Map([[1, 0]])
    expect(solveRidge(rows, { lambda: 1000, prior: p }).get(1).value).toBeLessThan(10)
    expect(solveRidge(rows, { lambda: 0.01, prior: p }).get(1).value).toBeGreaterThan(55)
  })
})

const tbaMatch = (n, red, blue, rs, bs, rbd, bbd) => ({ key: `2026cabl_qm${n}`, alliances: { red: { teams: red, score: rs, score_breakdown: rbd }, blue: { teams: blue, score: bs, score_breakdown: bbd } } })
const bd = (fuel, ends, autos = ['None', 'None', 'None'], rp = 0) => ({ hubScore: { totalPoints: fuel }, rp, foulPoints: 0, ...Object.fromEntries(ends.map((e, i) => [`endGameTowerRobot${i + 1}`, e])), ...Object.fromEntries(autos.map((e, i) => [`autoTowerRobot${i + 1}`, e])) })

describe('compactMatches', () => {
  it('reads per-robot TOWER points exactly, in robot order, and HUB points', () => {
    const [m] = compactMatches([tbaMatch(1, [11, 12, 13], [14, 15, 16], 125, 40, bd(70, ['Level3', 'Level1', 'None'], ['Level1', 'None', 'None'], 4), bd(30, ['None', 'None', 'Level2']))])
    expect(m.level).toBe('qm')
    expect(m.red).toMatchObject({ teams: [11, 12, 13], score: 125, fuel: 70, tower: [45, 10, 0], rp: 4 })
    expect(m.blue.tower).toEqual([0, 0, 20])
  })
  it('a match without a breakdown keeps its score and has no fuel or tower (never zero)', () => {
    const [m] = compactMatches([tbaMatch(2, [1, 2, 3], [4, 5, 6], 99, 50, null, null)])
    expect(m.red).toMatchObject({ score: 99, fuel: null, tower: null, rp: null })
    expect(compactMatches([{ key: '2026cabl_sf1m1', alliances: { red: { teams: [1] }, blue: { teams: [2] } } }])[0].level).toBe('po')
  })
})

describe('dataRatings', () => {
  const teams = [1, 2, 3, 4, 5, 6]
  const scoreOnly = SCHEDULE.map((m, i) => ({ key: `x_qm${i + 1}`, level: 'qm', red: { teams: m.slice(0, 3), score: sum(m.slice(0, 3)), fuel: null, tower: null }, blue: { teams: m.slice(3), score: sum(m.slice(3)), fuel: null, tower: null } }))
  it('orders teams by their true contribution from scores alone', () => {
    const r = dataRatings(teams, scoreOnly, new Map())
    const order = [...teams].sort((a, b) => r.get(b).points - r.get(a).points)
    expect(order).toEqual([1, 2, 3, 4, 5, 6])
    expect(r.get(1).source).toBe('event')
  })
  it('before any match, the season prior is the number; with no prior, there is none', () => {
    const r = dataRatings([1, 2], [], new Map([[1, { total: 80 }]]))
    expect(r.get(1)).toMatchObject({ points: 80, source: 'prior' })
    expect(r.get(2)).toMatchObject({ points: null, source: 'none' })
  })
  it('with breakdowns, climbs are exact per robot and FUEL is split by least squares', () => {
    const ms = compactMatches(SCHEDULE.map((m, i) => tbaMatch(i + 1, m.slice(0, 3), m.slice(3), 0, 0,
      bd(sum(m.slice(0, 3)), m.slice(0, 3).map(t => (t === 1 ? 'Level3' : 'None'))), bd(sum(m.slice(3)), m.slice(3).map(t => (t === 1 ? 'Level3' : 'None'))))))
    for (const m of ms) { m.red.score = 1; m.blue.score = 1 }
    const r = dataRatings(teams, ms, new Map())
    expect(r.get(1).climbs).toBe(8)
    expect(r.get(1).tower).toBeGreaterThan(20)
    expect(r.get(2).climbs).toBe(0)
    expect(r.get(2).tower).toBeLessThan(10)
    expect(r.get(1).fuel).toBeGreaterThan(r.get(2).fuel)
    expect(r.get(2).fuel).toBeGreaterThan(r.get(6).fuel)
  })
})

describe('teamValue and scoutSignals', () => {
  const data = { points: 50, fuel: 40, tower: 10, source: 'event', matches: 8, climbs: 4, towerExact: true }
  it('breakdowns our scouts saw lower the value; a clean record keeps it high (both directions)', () => {
    const broke = teamValue(data, scoutSignals({ match: { troubleRate: { n: 6, bad: 4 } } }))
    const clean = teamValue(data, scoutSignals({ match: { troubleRate: { n: 6, bad: 0 } } }))
    expect(broke.value).toBeLessThan(clean.value)
    expect(clean.value).toBeGreaterThan(45)
    expect(broke.reasons.join(' ')).toMatch(/broke down in 4 of 6/)
  })
  it('hand counts move FUEL by at most 30 percent, and not at all with one match', () => {
    const many = teamValue(data, scoutSignals({ match: { totalFuel: { median: 140, n: 50 } } }))
    expect(many.fuel).toBeGreaterThan(40)
    expect(many.fuel).toBeLessThanOrEqual(40 + 0.3 * 100 + 0.01)
    const one = teamValue(data, scoutSignals({ match: { totalFuel: { median: 140, n: 1 } } }))
    expect(one.fuel).toBe(40)
  })
  it('scouts tiers move it a few percent; most scouts saying do not pick lowers it more', () => {
    const t1 = teamValue(data, scoutSignals({ vote: { tier: 1, rankedVotes: 3, support: 3, dnpFraction: 0 } })).value
    const t3 = teamValue(data, scoutSignals({ vote: { tier: 3, rankedVotes: 3, support: 3, dnpFraction: 0 } })).value
    const dnp = teamValue(data, scoutSignals({ vote: { tier: 'dnp', rankedVotes: 0, support: 3, dnpFraction: 1 } })).value
    expect(t1).toBeGreaterThan(t3)
    expect(t1 / t3).toBeLessThan(1.2)
    expect(dnp).toBeLessThan(t3)
  })
  it('with no TBA data and no season, the scouts are all there is; with nothing, null', () => {
    expect(teamValue({ points: null, source: 'none' }, scoutSignals({ match: { totalFuel: { median: 30, n: 2 }, tower: { median: 2, n: 2 } } })).points).toBe(50)
    expect(teamValue({ points: null, source: 'none' }, scoutSignals()).value).toBeNull()
  })
})

describe('roleScore and boardOrder', () => {
  it('a team that would be our fourth robot adds less than one that would be our third', () => {
    expect(roleScore(30, [100, 90])).toBeGreaterThan(roleScore(30, [100, 90, 80]))
    expect(roleScore(30, [100, 90, 80])).toBeGreaterThan(0)
  })
  it('asking for a defender raises a defender', () => {
    expect(roleScore(20, [100, 90, 80], { defense: 1, wantDefense: true })).toBeGreaterThan(roleScore(20, [100, 90, 80], { defense: 1 }))
  })
  it('Must pick on top, Avoid at the bottom, bumps between, the rest by score', () => {
    const rs = [{ id: 1, score: 90 }, { id: 2, score: 80 }, { id: 3, score: 70 }, { id: 4, score: 60 }]
    expect(boardOrder(rs).map(r => r.id)).toEqual([1, 2, 3, 4])
    expect(boardOrder(rs, { 4: { flag: 'must' }, 1: { flag: 'avoid' }, 3: { bump: 15 } }).map(r => r.id)).toEqual([4, 3, 2, 1])
  })
})

describe('rankingFromMatches', () => {
  it('ranks by average RP from the breakdown, then by average score', () => {
    const ms = compactMatches([tbaMatch(1, [1, 2, 3], [4, 5, 6], 100, 50, bd(1, [], [], 4), bd(1, [], [], 0)), tbaMatch(2, [1, 4, 5], [2, 3, 6], 90, 80, bd(1, [], [], 3), bd(1, [], [], 1))])
    expect(rankingFromMatches(ms).map(r => r.team).slice(0, 2)).toEqual([1, 2])
  })
})

describe('the shipped Beach Blitz prior', () => {
  it('covers the 2026cabl teams with 2026 numbers and says where they came from', () => {
    expect(prior.event).toBe('2026cabl')
    expect(Object.keys(prior.teams).length).toBeGreaterThanOrEqual(40)
    expect(Object.values(prior.teams).filter(t => typeof t.total === 'number').length).toBeGreaterThanOrEqual(40)
    expect(prior.teams['5669']).toBeTruthy()
    expect(prior.source).toMatch(/Blue Alliance/)
  })
})
