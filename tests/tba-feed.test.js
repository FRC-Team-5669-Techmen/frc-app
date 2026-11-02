// The zero-setup event feed (ledger 0035): src/scouting/tbaPages.js parsing
// The Blue Alliance's public pages (pinned against saved Beach Blitz 2026
// pages), api/tba.js, and src/scouting/eventLink.js choosing the event by
// date and driving the scouts' match picker.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseEvent, parseMatchBreakdown, toImportShape } from '../src/scouting/tbaPages.js'
import { compactMatches } from '../src/scouting/pickRank.js'
import handler, { eventFeed } from '../api/tba.js'
import { covered, currentMatch, eventTeams, pickEventKey, scheduleFrom } from '../src/scouting/eventLink.js'

const page = name => readFileSync(new URL(`./fixtures/tba/${name}.html`, import.meta.url), 'utf8')
const EVENT = page('2026cabl'), QM1 = page('2026cabl_qm1')

describe('parseEvent on the real Beach Blitz page', () => {
  const ev = parseEvent(EVENT, '2026cabl')
  it('42 teams with nicknames, 85 matches (70 quals), 8 alliances of four, the dates', () => {
    expect(ev.teams).toHaveLength(42)
    expect(ev.teams.find(t => t.n === '6995')).toEqual({ n: '6995', name: 'NOMAD' })
    expect(ev.matches).toHaveLength(85)
    expect(ev.matches.filter(m => m.level === 'qm')).toHaveLength(70)
    expect(ev.alliances).toHaveLength(8)
    expect(ev.alliances[0]).toEqual(['6995', '498', '3309', '2102'])
    expect([ev.start, ev.end]).toEqual(['2026-10-30', '2026-11-01'])
    expect(ev.title).toMatch(/^Beach Blitz/)
  })
  it('qm1 is 4079 6560 399 (164) against 4619 5669 5199 (259)', () => {
    expect(ev.matches.find(m => m.key === '2026cabl_qm1')).toMatchObject({ red: { teams: ['4079', '6560', '399'], score: 164 }, blue: { teams: ['4619', '5669', '5199'], score: 259 } })
  })
  it('a disqualified robot is still one of the six (qm2: 599 marked DQ)', () => {
    expect(ev.matches.find(m => m.key === '2026cabl_qm2').blue.teams).toEqual(['4141', '599', '5474'])
  })
  it('a page with no event on it gives nothing (positive control above: 85 matches)', () => {
    const empty = parseEvent('<html><title>Page not found</title></html>', '2026zzzz')
    expect([empty.teams.length, empty.matches.length, empty.alliances.length]).toEqual([0, 0, 0])
  })
})

describe('parseMatchBreakdown on the real qm1 page', () => {
  const bd = parseMatchBreakdown(QM1)
  it('FUEL by period and the totals, in the API field names', () => {
    expect(bd.red.hubScore).toMatchObject({ autoCount: 24, teleopPoints: 140, totalPoints: 164, endgameCount: 40 })
    expect(bd.blue.hubScore).toMatchObject({ autoCount: 11, teleopPoints: 248, totalPoints: 259, shift1Count: 84 })
    expect([bd.red.totalPoints, bd.blue.totalPoints, bd.blue.rp]).toEqual([164, 259, 4])
    expect(bd.red.endGameTowerRobot1).toBe('None')
    expect(bd.red.autoTowerRobot3).toBe('None')
  })
  it('a level is read as a level (positive control for the TOWER row)', () => {
    const lvl = QM1.replace(/(<span rel="tooltip" title="4079">)None(<\/span>)/, '$1Level 2$2')
    expect(parseMatchBreakdown(lvl).red.endGameTowerRobot1).toBe('Level2')
  })
  it('an unplayed match page has no breakdown', () => {
    expect(parseMatchBreakdown(QM1.replace(/Total Score/g, 'Nothing'))).toBe(null)
  })
  it('compactMatches reads the page breakdown like the API one: FUEL and TOWER per alliance', () => {
    const shape = toImportShape(parseEvent(EVENT, '2026cabl'), { '2026cabl_qm1': bd })
    const qm1 = compactMatches(shape.matches).find(m => m.key === '2026cabl_qm1')
    expect(qm1.red).toMatchObject({ teams: [4079, 6560, 399], score: 164, fuel: 164, tower: [0, 0, 0], rp: 0 })
    const qm2 = compactMatches(shape.matches).find(m => m.key === '2026cabl_qm2')
    expect(qm2.red.fuel).toBe(null) // no breakdown fetched for it: totals only
  })
})

describe('api/tba.js', () => {
  const fetchPage = async path => (path === '/event/2026cabl' ? EVENT : path === '/match/2026cabl_qm1' ? QM1 : path.startsWith('/match/') ? '' : null)
  it('detail=1 attaches each played match page it could read', async () => {
    const feed = await eventFeed('2026cabl', { detail: true, fetchPage })
    const withBd = feed.matches.filter(m => m.alliances.red.score_breakdown)
    expect(withBd.map(m => m.key)).toEqual(['2026cabl_qm1'])
    expect(feed.teams).toHaveLength(42)
    expect(feed.source).toBe('tba-pages')
  })
  it('without detail no match page is read', async () => {
    const asked = []
    await eventFeed('2026cabl', { fetchPage: async p => { asked.push(p); return fetchPage(p) } })
    expect(asked).toEqual(['/event/2026cabl'])
  })
  it('an unknown event is null', async () => { expect(await eventFeed('2026zzzz', { fetchPage })).toBe(null) })
  const call = async query => {
    const res = { code: 0, body: '', headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, send(b) { this.body = b } }
    await handler({ query }, res)
    return res
  }
  it('refuses anything that is not an event key or a team and year, before any fetch', async () => {
    for (const q of [{ event: '../admin' }, { event: '2026cabl/../../x' }, { event: 'https://evil' }, { team: 'abc' }, {}]) expect((await call(q)).code, JSON.stringify(q)).toBe(400)
  })
})

describe('eventLink', () => {
  const ours = [
    { key: '2026calas', title: 'CA District Los Angeles Event (2026)', start: '2026-03-20', end: '2026-03-22' },
    { key: '2026casgv', title: 'CA District San Gabriel Valley Event (2026)', start: '2026-03-27', end: '2026-03-29' },
    { key: '2026cabl', title: 'Beach Blitz presented by the Gene Haas Foundation (2026)', start: '2026-10-30', end: '2026-11-01' },
  ]
  const blitz = { title: 'Beach Blitz 2026', starts_at: '2026-10-31T00:00:00Z', ends_at: '2026-11-02T01:30:00Z' }
  it('the calendar competition finds its event by date', () => {
    expect(pickEventKey(ours, blitz)).toBe('2026cabl')
    expect(pickEventKey(ours, { title: 'SGV district', starts_at: '2026-03-27T15:00:00Z', ends_at: '2026-03-30T02:00:00Z' })).toBe('2026casgv')
  })
  it('no overlapping event, no key; two overlapping with nothing to tell them apart, no guess', () => {
    expect(pickEventKey(ours, { title: 'Beach Blitz 2026', starts_at: '2026-12-05T16:00:00Z', ends_at: '2026-12-06T01:00:00Z' })).toBe(null)
    const twins = [{ key: '2026xa', title: 'Alpha Cup', start: '2026-10-30', end: '2026-11-01' }, { key: '2026xb', title: 'Bravo Cup', start: '2026-10-31', end: '2026-11-01' }]
    expect(pickEventKey(twins, { ...blitz, title: 'Fall event' })).toBe(null)
    expect(pickEventKey(twins, { ...blitz, title: 'Bravo Cup 2026' })).toBe('2026xb')
  })
  const feed = toImportShape(parseEvent(EVENT, '2026cabl'))
  const sched = scheduleFrom(feed)
  it('the schedule is the 70 quals in order with six robots each', () => {
    expect(sched).toHaveLength(70)
    expect(sched[0]).toEqual({ key: 'qm1', n: 1, red: [4079, 6560, 399], blue: [4619, 5669, 5199], played: true })
    expect(sched.every(m => m.red.length === 3 && m.blue.length === 3)).toBe(true)
    expect(eventTeams(feed).size).toBe(42)
  })
  it('the current match is the first not played; when all are played, the last', () => {
    expect(currentMatch(sched).key).toBe('qm70')
    const half = sched.map(m => ({ ...m, played: m.n < 13 }))
    expect(currentMatch(half).key).toBe('qm13')
  })
  it('coverage counts observations of that match only, under any spelling', () => {
    const recs = [{ kind: 'observation', match_key: 'Q1', team_number: 4079 }, { kind: 'observation', match_key: 'qm1', team_number: 5669 }, { kind: 'observation', match_key: 'qm2', team_number: 399 }, { kind: 'pit', match_key: null, team_number: 6560 }]
    expect([...covered(sched[0], recs)].sort()).toEqual([4079, 5669])
    expect(covered(sched[0], []).size).toBe(0)
  })
})
