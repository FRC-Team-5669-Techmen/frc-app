// Zero-setup event link (ledger 0035). A competition on the team calendar
// finds its own Blue Alliance event: our team's events that season (from
// /api/tba), the one whose dates overlap the competition's, the title as a
// tiebreak. Nobody types a key. A key a manager saved on the pick board
// still wins, so a wrong guess has a one-step fix.
//
// The feed (teams, schedule, results, alliances) comes from /api/tba, which
// Vercel's CDN refreshes once a minute for every device at once; it is kept
// on this device too, so a phone that loses signal in the stands still has
// the schedule.
import { useEffect, useState } from 'react'
import { eventDayKeys } from '../eventDays'
import { canonicalMatchKey } from './provenance'

export const OUR_TEAM_NUMBER = 5669
const DAY = 864e5
const LIVE_MS = 60e3
const words = s => new Set(String(s ?? '').toLowerCase().replace(/\(\d{4}\)/g, ' ').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['the', 'and', 'presented', 'event', 'district', 'regional', 'foundation'].includes(w)))

/**
 * The Blue Alliance key for a calendar competition, or null.
 * events: [{ key, title, start: 'YYYY-MM-DD', end }]; comp: { title, starts_at, ends_at }.
 * An event counts when its days overlap the competition's LA days (one day
 * of slack each side: offseason pages often list only the main days).
 */
export function pickEventKey(events, comp) {
  if (!comp?.starts_at || !Array.isArray(events)) return null
  const days = eventDayKeys(comp)
  const lo = new Date(Date.parse(`${days[0]}T12:00:00Z`) - DAY).toISOString().slice(0, 10)
  const hi = new Date(Date.parse(`${days.at(-1)}T12:00:00Z`) + DAY).toISOString().slice(0, 10)
  const mine = words(comp.title)
  const scored = events.filter(e => e?.key && e.start && e.start <= hi && (e.end ?? e.start) >= lo)
    .map(e => ({ key: e.key, score: [...words(e.title)].filter(w => mine.has(w)).length }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
  if (!scored.length) return null
  // Two overlapping events with nothing in the title to choose between them: do not guess.
  if (scored.length > 1 && scored[0].score === scored[1].score) return null
  return scored[0].key
}

/** Qualification schedule from a feed: [{ key: 'qm12', n, red: [..], blue: [..], played }], in match order. */
export function scheduleFrom(feed) {
  return (feed?.matches ?? []).flatMap(m => {
    const n = /_qm(\d+)$/.exec(m?.key ?? '')?.[1]
    if (!n) return []
    const red = (m.alliances?.red?.teams ?? []).map(Number), blue = (m.alliances?.blue?.teams ?? []).map(Number)
    const s = m.alliances?.red?.score
    return [{ key: `qm${n}`, n: Number(n), red, blue, played: typeof s === 'number' && s >= 0 }]
  }).sort((a, b) => a.n - b.n)
}

/** The match a scout most likely means: the first one not played yet (else the last). */
export function currentMatch(schedule) {
  if (!schedule?.length) return null
  return schedule.find(m => !m.played) ?? schedule.at(-1)
}

/** Teams in a match that already have at least one observation, from records with match_key. */
export function covered(match, records) {
  const have = new Set()
  if (!match) return have
  for (const r of records ?? []) if (r?.kind === 'observation' && canonicalMatchKey(r.match_key) === match.key) have.add(Number(r.team_number))
  return have
}

/** Teams on the event's list (registered or in the schedule), as numbers. */
export function eventTeams(feed) {
  return new Set((feed?.teams ?? []).map(t => Number(t.team_number)).filter(Number.isFinite))
}

const readLocal = k => { try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null } }
const writeLocal = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* private window */ } }

async function getJson(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('json')) throw new Error('The event feed is not available here.')
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error || `The event feed answered ${res.status}.`)
  return body
}

/**
 * Our competition's TBA feed. comp: the events row; savedKey: a key a manager
 * saved (wins over the automatic one). Refreshes every minute while the
 * competition is on (and the page is visible), once otherwise.
 * Returns { key, auto, feed, error, loading }.
 */
export function useEventFeed(comp, savedKey = '', { detail = false } = {}) {
  const compId = comp?.id ?? ''
  const [autoKey, setAutoKey] = useState(() => (compId ? readLocal(`techmen:tba-link:${compId}`)?.key ?? '' : ''))
  const [feed, setFeed] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const key = savedKey || autoKey

  useEffect(() => {
    if (savedKey || !comp?.starts_at || !compId) return
    let live = true
    const year = new Date(comp.starts_at).getUTCFullYear()
    getJson(`/api/tba?team=${OUR_TEAM_NUMBER}&year=${year}`).then(r => {
      if (!live) return
      const k = pickEventKey(r.events, comp)
      if (k) { setAutoKey(k); writeLocal(`techmen:tba-link:${compId}`, { key: k, at: new Date().toISOString() }) }
    }).catch(e => { if (live && !readLocal(`techmen:tba-link:${compId}`)) setError(e.message) })
    return () => { live = false }
  }, [compId, savedKey, comp?.starts_at]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!key) return
    let live = true
    const cacheKey = `techmen:tba-feed:${key}:${detail ? 1 : 0}`
    const cached = readLocal(cacheKey)
    if (cached) setFeed(cached)
    const pull = () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      setLoading(true)
      getJson(`/api/tba?event=${encodeURIComponent(key)}${detail ? '&detail=1' : ''}`)
        .then(f => { if (!live) return; setFeed(f); setError(''); writeLocal(cacheKey, f) })
        .catch(e => { if (live) setError(e.message) })
        .finally(() => { if (live) setLoading(false) })
    }
    pull()
    const on = () => {
      const t = Date.now(), s = Date.parse(comp?.starts_at ?? ''), e = Date.parse(comp?.ends_at ?? comp?.starts_at ?? '')
      return Number.isFinite(s) && t >= s - DAY && t <= e + DAY
    }
    const timer = setInterval(() => { if (on() && document.visibilityState === 'visible') pull() }, LIVE_MS)
    return () => { live = false; clearInterval(timer) }
  }, [key, detail]) // eslint-disable-line react-hooks/exhaustive-deps

  return { key, auto: !savedKey && !!autoKey, feed, error, loading }
}
