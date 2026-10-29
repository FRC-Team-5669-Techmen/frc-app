#!/usr/bin/env node
// The pick board's outside judge (ledger 0032): replay real 2026 alliance
// selections from The Blue Alliance and measure where each team a captain
// actually picked sat in OUR ranking of the teams still available at that
// moment. Rank 1 means the board would have put that team on top.
//
//   node tools/scouting/replay.mjs [--events 2026catt,2026cass,...] [--cache DIR] [--json]
//
// Compared, on the same picks:
//   board   the board's data estimate (dataRatings: event OPR pulled toward
//           the season prior from that team's EARLIER events only)
//   opr     plain event OPR, no prior (what most teams look at)
//   prior   the season prior alone (the board before any match is played)
//   random  the expected rank of a random choice
// The pick order is rebuilt from the final alliances (round 1 alliance 1 to
// N, round 2 N to 1, round 3 1 to N), so a captain who was picked by another
// captain counts as an ordinary available team. Captains' real reasons
// (strategy, friendship, a robot that broke) are not in the data; this
// measures agreement, not truth.
import { fetchEvent } from './tba-pages.mjs'
import { eventOpr, combine } from './season-prior.mjs'
import { dataRatings, solveRidge } from '../../src/scouting/pickRank.js'
import { fetchPage, parseTeamEvents } from './tba-pages.mjs'

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt }
const EVENTS = arg('events', '2026catt,2026cass,2026cascmp,2026cc,2026casgv,2026calas,2026caoec').split(',')
const cacheDir = arg('cache', null)

export function pickSequence(alliances) {
  const n = alliances.length, rounds = Math.max(...alliances.map(a => a.length)) - 1
  const seq = []
  for (let r = 0; r < rounds; r++) for (let i = 0; i < n; i++) {
    const pos = r % 2 === 0 ? i : n - 1 - i
    const t = alliances[pos][r + 1]
    if (t) seq.push({ round: r + 1, alliance: pos + 1, team: t })
  }
  return seq
}

export function scorePicks(ev, values) {
  const teams = [...new Set(ev.matches.flatMap(m => [...m.red.teams, ...m.blue.teams]))]
  const placed = new Set(ev.alliances.map(a => a[0]))
  const out = []
  for (const p of pickSequence(ev.alliances)) {
    const avail = teams.filter(t => !placed.has(t))
    const order = [...avail].sort((a, b) => (values.get(b) ?? -1e9) - (values.get(a) ?? -1e9))
    out.push({ ...p, rank: order.indexOf(p.team) + 1, of: avail.length })
    placed.add(p.team)
  }
  return out
}

const summary = rows => {
  const r1 = rows.filter(r => r.round === 1)
  const f = (list, k) => (list.length ? Math.round(100 * list.filter(r => r.rank > 0 && r.rank <= k).length / list.length) : null)
  const m = list => (list.length ? Math.round(10 * list.reduce((s, r) => s + r.rank, 0) / list.length) / 10 : null)
  return { picks: rows.length, top1: f(rows, 1), top3: f(rows, 3), meanRank: m(rows), round1: { picks: r1.length, top1: f(r1, 1), top3: f(r1, 3), meanRank: m(r1) } }
}

async function priorBefore(ev, teams) {
  const prior = new Map()
  for (const t of teams.filter(x => /^\d+$/.test(x))) {
    let keys = []
    try { keys = parseTeamEvents(await fetchPage(`https://www.thebluealliance.com/team/${t}/2026`, { cacheDir }), 2026) } catch { continue }
    const entries = []
    for (const k of keys) {
      if (k === ev.key) continue
      let other
      try { other = await fetchEvent(k, { cacheDir }) } catch { continue }
      if (!other.start || !ev.start || other.start >= ev.start) continue
      const r = eventOpr(other).get(t)
      if (r) entries.push({ start: other.start, opr: r.value, n: r.n })
    }
    const total = combine(entries)
    if (total !== null) prior.set(t, { total })
  }
  return prior
}

async function main() {
  const all = { board: [], opr: [], prior: [], random: [] }
  const perEvent = []
  for (const key of EVENTS) {
    const ev = await fetchEvent(key, { cacheDir })
    if (!ev.alliances.length) { console.error(`${key}: no alliances, skipped`); continue }
    const teams = [...new Set(ev.matches.flatMap(m => [...m.red.teams, ...m.blue.teams]))]
    const prior = await priorBefore(ev, teams)
    const compact = ev.matches.map(m => ({ key: m.key, level: m.level, red: { ...m.red, fuel: null, tower: null, rp: null }, blue: { ...m.blue, fuel: null, tower: null, rp: null } }))
    const board = dataRatings(teams, compact, prior)
    const values = {
      board: new Map(teams.map(t => [t, board.get(t)?.points])),
      opr: new Map([...eventOpr(ev)].map(([t, r]) => [t, r.value])),
      prior: new Map(teams.map(t => [t, prior.get(t)?.total ?? null])),
    }
    const row = { event: key, title: ev.title, alliances: ev.alliances.length, teams: teams.length, withPrior: prior.size }
    for (const k of Object.keys(values)) { const s = scorePicks(ev, values[k]); all[k].push(...s); row[k] = summary(s) }
    const rnd = scorePicks(ev, new Map()).map(r => ({ ...r, rank: (r.of + 1) / 2 }))
    all.random.push(...rnd); row.random = summary(rnd)
    perEvent.push(row)
  }
  const total = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, summary(v)]))
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ measured_at: new Date().toISOString(), perEvent, total }, null, 1)); return }
  for (const r of perEvent) console.log(`${r.event} ${r.title}: ${r.teams} teams, ${r.alliances} alliances, prior for ${r.withPrior}\n  board ${fmt(r.board)}\n  opr   ${fmt(r.opr)}\n  prior ${fmt(r.prior)}\n  random mean rank ${r.random.meanRank}`)
  console.log(`ALL\n  board ${fmt(total.board)}\n  opr   ${fmt(total.opr)}\n  prior ${fmt(total.prior)}\n  random mean rank ${total.random.meanRank} (round 1 ${total.random.round1.meanRank})`)
}
const fmt = s => `picks ${s.picks}: top1 ${s.top1}% top3 ${s.top3}% mean rank ${s.meanRank} | round 1: top1 ${s.round1.top1}% top3 ${s.round1.top3}% mean ${s.round1.meanRank}`

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1) })
// solveRidge is re-exported for tests that build a tiny event by hand.
export { solveRidge }
