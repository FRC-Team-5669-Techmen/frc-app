// Alliance selection as a log (src/scouting/draft.js, ledger 0032).
import { describe, expect, it } from 'vitest'
import { availability, availableTeams, mulberry32, onClock, pickable, picksUntilOurs, replay, slotOrder } from '../src/scouting/draft.js'

const SEEDS = Array.from({ length: 30 }, (_, i) => 101 + i) // 101 is seed 1
const setup = { seeds: SEEDS, rounds: 3, alliances: 8 }

describe('slotOrder', () => {
  it('Beach Blitz: round 1 is 1 to 8, round 2 is 8 to 1, round 3 is 1 to 8 again', () => {
    const s = slotOrder(3, 8)
    expect(s).toHaveLength(24)
    expect(s.slice(0, 8).map(x => x.position + 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(s.slice(8, 16).map(x => x.position + 1)).toEqual([8, 7, 6, 5, 4, 3, 2, 1])
    expect(s.slice(16).map(x => x.position + 1)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})

describe('replay', () => {
  it('a pick goes to the alliance on the clock and the clock moves', () => {
    const s = replay(setup, [{ type: 'pick', team: 120 }])
    expect(s.alliances[0]).toEqual([101, 120])
    expect(onClock(s)).toMatchObject({ number: 2, round: 1, captain: 102 })
  })
  it('a captain picking a lower captain dissolves that alliance and promotes seed 9', () => {
    const s = replay(setup, [{ type: 'pick', team: 104 }])
    expect(s.alliances[0]).toEqual([101, 104])
    expect(s.alliances.map(a => a[0])).toEqual([101, 102, 103, 105, 106, 107, 108, 109])
  })
  it('a higher captain cannot be picked, nor a team already on an alliance (positive control: a free team can)', () => {
    const s = replay(setup, [{ type: 'pick', team: 120 }])
    expect(pickable(s, 101)).toBe(false)
    expect(pickable(s, 120)).toBe(false)
    expect(pickable(s, 121)).toBe(true)
    expect(pickable(s, 103)).toBe(true) // lower captain, no pick yet
    const bad = replay(setup, [{ type: 'pick', team: 120 }, { type: 'pick', team: 120 }])
    expect(bad.errors).toHaveLength(1)
    expect(bad.slot).toBe(1)
  })
  it('a decline keeps the clock and the team can never be picked; undo is dropping the entry', () => {
    const log = [{ type: 'decline', team: 125 }]
    const s = replay(setup, log)
    expect(onClock(s).number).toBe(1)
    expect(pickable(s, 125)).toBe(false)
    expect(replay(setup, [...log, { type: 'pick', team: 125 }]).errors).toHaveLength(1)
    expect(pickable(replay(setup, log.slice(0, -1)), 125)).toBe(true)
  })
  it('24 picks fill eight four-team alliances and the selection is complete', () => {
    const log = Array.from({ length: 24 }, (_, i) => ({ type: 'pick', team: 109 + i }))
    const s = replay(setup, log)
    expect(s.alliances.every(a => a.length === 4)).toBe(true)
    expect(onClock(s)).toBeNull()
    expect(availableTeams(s, SEEDS)).toEqual([133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162].filter(t => SEEDS.includes(t)))
  })
})

describe('picksUntilOurs and availability', () => {
  it('captain 3 picks after 2 picks in round 1, then 10 picks later in round 2', () => {
    expect(picksUntilOurs(replay(setup, []), 103)).toBe(2)
    const after = replay(setup, [{ type: 'pick', team: 120 }, { type: 'pick', team: 121 }, { type: 'pick', team: 122 }])
    expect(picksUntilOurs(after, 103)).toBe(10)
    expect(picksUntilOurs(replay(setup, []), 130)).toBeNull()
  })
  it('the best free team is less likely to last than a weak one; on our own clock everything free is there', () => {
    const values = new Map(SEEDS.filter(t => t > 108).map((t, i) => [t, 200 * 0.8 ** i]))
    const odds = availability(replay(setup, []), values, 104, { runs: 400, rng: mulberry32(1) })
    expect(odds.get(109)).toBeLessThan(0.5)
    expect(odds.get(130)).toBeGreaterThan(0.9)
    const now = availability(replay(setup, [{ type: 'pick', team: 120 }, { type: 'pick', team: 121 }, { type: 'pick', team: 122 }]), values, 104, { runs: 50 })
    expect(now.get(109)).toBe(1)
  })
})
