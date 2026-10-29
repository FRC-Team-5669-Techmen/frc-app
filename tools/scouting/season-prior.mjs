#!/usr/bin/env node
// Each team's 2026 season prior for an event's pick board, from The Blue
// Alliance's public pages (no key): every 2026 event the team played, an OPR
// per event from its qualification matches, then a recency-weighted average.
// Statbotics skips offseason events and was answering 500/503 on 2026-10-28,
// so the board's starting estimate must not depend on it.
//
//   node tools/scouting/season-prior.mjs --event 2026cabl [--cache DIR] [--out src/scouting/priors/2026cabl.json]
//
// Repeatable: the same pages give the same file. Writes the generated time
// and the events used, so the board can say where the number came from.
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fetchEvent, fetchPage, parseTeamEvents } from './tba-pages.mjs'
import { solveRidge } from '../../src/scouting/pickRank.js'

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : dflt }
const event = arg('event', '2026cabl')
const cacheDir = arg('cache', null)
const out = arg('out', `src/scouting/priors/${event}.json`)
const year = Number(event.slice(0, 4))

/** OPR per team for one event's qualification matches (light pull to the mean). */
export function eventOpr(ev) {
  const rows = ev.matches.filter(m => m.level === 'qm' && Number.isFinite(m.red.score) && Number.isFinite(m.blue.score))
    .flatMap(m => [{ teams: m.red.teams, y: m.red.score }, { teams: m.blue.teams, y: m.blue.score }])
  return rows.length ? solveRidge(rows, { lambda: 0.5 }) : new Map()
}

/** Recency-weighted average: the latest event counts most. */
export function combine(entries) {
  const sorted = [...entries].filter(e => e.n >= 4).sort((a, b) => String(b.start).localeCompare(String(a.start)))
  let sw = 0, sv = 0
  sorted.forEach((e, k) => { const w = e.n * Math.pow(0.7, k); sw += w; sv += w * e.opr })
  return sw ? Math.round(sv / sw * 10) / 10 : null
}

async function main() {
  const home = await fetchPage(`https://www.thebluealliance.com/event/${event}`, { cacheDir })
  const teams = [...new Set([...home.matchAll(new RegExp(`/team/(\\d+)/${year}`, 'g'))].map(x => x[1]))]
  if (!teams.length) throw new Error(`No teams listed on ${event}`)
  const eventsByTeam = new Map()
  for (const t of teams) {
    const page = await fetchPage(`https://www.thebluealliance.com/team/${t}/${year}`, { cacheDir })
    eventsByTeam.set(t, parseTeamEvents(page, year).filter(k => k !== event))
  }
  const keys = [...new Set([...eventsByTeam.values()].flat())]
  const oprs = new Map(), meta = new Map()
  for (const k of keys) {
    try {
      const ev = await fetchEvent(k, { cacheDir })
      oprs.set(k, eventOpr(ev)); meta.set(k, { title: ev.title, start: ev.start, quals: ev.matches.filter(m => m.level === 'qm').length })
    } catch (e) { console.error(`skip ${k}: ${e.message}`) }
  }
  const result = {}
  for (const t of teams) {
    const entries = (eventsByTeam.get(t) ?? []).flatMap(k => { const r = oprs.get(k)?.get(t); return r ? [{ key: k, start: meta.get(k).start, opr: Math.round(r.value * 10) / 10, n: r.n }] : [] })
    result[t] = { total: combine(entries), events: entries.sort((a, b) => String(a.start).localeCompare(String(b.start))) }
  }
  const file = {
    event, generated_at: new Date().toISOString(), source: 'The Blue Alliance public event pages', method: 'OPR per event from qualification scores (ridge 0.5), averaged with the latest event weighted most (0.7 per older event, times matches played).',
    events: Object.fromEntries([...meta].sort((a, b) => String(a[1].start).localeCompare(String(b[1].start)))), teams: result,
  }
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(file, null, 1) + '\n')
  const withPrior = Object.values(result).filter(r => r.total !== null).length
  console.log(`${event}: ${teams.length} teams, ${withPrior} with a 2026 prior, from ${meta.size} events -> ${out}`)
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1) })
