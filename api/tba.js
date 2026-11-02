/**
 * The app's live event feed from The Blue Alliance's PUBLIC pages (ledger 0035).
 *
 * Why this exists: at Beach Blitz 2026 the pick board, the shift planner and
 * every schedule-driven scouting tool sat unused because each needed a
 * manager to type a TBA key and press an import first. This function needs no
 * key, no secret and no manager: any signed-in device asks it, and Vercel's
 * CDN shares one answer per minute between all of them.
 *
 *   GET /api/tba?team=5669&year=2026
 *       -> { events: [{ key, title, start, end }] }   our team's events that season
 *   GET /api/tba?event=2026cabl[&detail=1]
 *       -> scouting-import's shape (src/scouting/tbaPages.js toImportShape):
 *          { event_key, title, start, end, teams, matches, alliances, fetched_at, source }
 *          detail=1 adds each played match's 2026 score breakdown (match pages).
 *
 * Read-only, public data only: nothing here reads Supabase or any secret.
 * Inputs are checked against a strict pattern before any URL is built, so the
 * function can only ever fetch thebluealliance.com/event/<key>,
 * /match/<key>_<id> or /team/<n>/<year>.
 */
import { parseEvent, parseMatchBreakdown, parseTeamEvents, toImportShape } from '../src/scouting/tbaPages.js'

// Up to 70 match pages on a cold instance: allow the time, fetch 10 at once.
export const config = { maxDuration: 60 }

const BASE = 'https://www.thebluealliance.com'
const UA = { 'user-agent': 'techmen-5669-team-app (frc-app-liard.vercel.app)' }
// A played match does not change after it is final (rare corrections aside),
// so this instance keeps its breakdown; the event page itself is re-read.
const breakdownCache = new Map()

async function page(path) {
  const res = await fetch(`${BASE}${path}`, { headers: UA })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`The Blue Alliance answered ${res.status}.`)
  return res.text()
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

export async function eventFeed(key, { detail = false, fetchPage = page } = {}) {
  const html = await fetchPage(`/event/${key}`)
  if (html === null) return null
  const ev = parseEvent(html, key)
  const breakdowns = {}
  if (detail) {
    const played = ev.matches.filter(m => m.red.score !== null && m.red.score >= 0)
    await mapLimit(played, 10, async m => {
      const cached = breakdownCache.get(m.key)
      if (cached && cached.red.totalPoints === m.red.score && cached.blue.totalPoints === m.blue.score) { breakdowns[m.key] = cached; return }
      try {
        const bd = parseMatchBreakdown((await fetchPage(`/match/${m.key}`)) ?? '')
        if (bd) { breakdowns[m.key] = bd; breakdownCache.set(m.key, bd) }
      } catch { /* one missing breakdown leaves that match on its total score */ }
    })
  }
  return { ...toImportShape(ev, breakdowns), fetched_at: new Date().toISOString(), source: 'tba-pages' }
}

export async function teamEvents(team, year, { fetchPage = page } = {}) {
  const html = await fetchPage(`/team/${team}/${year}`)
  if (html === null) return []
  const keys = parseTeamEvents(html, year)
  const events = await mapLimit(keys, 4, async key => {
    try { const ev = parseEvent((await fetchPage(`/event/${key}`)) ?? '', key); return { key, title: ev.title, start: ev.start, end: ev.end } }
    catch { return { key, title: key, start: null, end: null } }
  })
  return events
}

export default async function handler(req, res) {
  const q = req.query ?? {}
  res.setHeader('Content-Type', 'application/json')
  try {
    if (typeof q.event === 'string') {
      if (!/^20\d{2}[a-z0-9]{1,16}$/.test(q.event)) { res.status(400).send(JSON.stringify({ error: 'Event keys look like 2026cabl.' })); return }
      const feed = await eventFeed(q.event, { detail: q.detail === '1' })
      if (!feed) { res.status(404).send(JSON.stringify({ error: `The Blue Alliance has no event ${q.event}.` })); return }
      // One fetch a minute per event for every device at once.
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      res.status(200).send(JSON.stringify(feed))
      return
    }
    if (typeof q.team === 'string') {
      const year = String(q.year ?? new Date().getFullYear())
      if (!/^\d{1,5}$/.test(q.team) || !/^20\d{2}$/.test(year)) { res.status(400).send(JSON.stringify({ error: 'Ask for a team number and a year.' })); return }
      const events = await teamEvents(q.team, year)
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
      res.status(200).send(JSON.stringify({ team: Number(q.team), year: Number(year), events }))
      return
    }
    res.status(400).send(JSON.stringify({ error: 'Ask for ?event=<key> or ?team=<number>&year=<year>.' }))
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store')
    res.status(502).send(JSON.stringify({ error: String(e?.message ?? e).slice(0, 200) }))
  }
}
