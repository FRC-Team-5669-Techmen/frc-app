// The Human Player Score (migration 0033, ledger 0025): ONE number per human
// player per season, computed here and nowhere else. The SQL stores attempts
// and never scores; /human-player, the /robot tile and the connector's
// list_human_players all import this file, so the page and Claude can never
// disagree about a rank. Pure: no React, no Supabase.
// tests/human-player-score.test.js drives it.
//
// THE QUESTION it answers: who will score the most FUEL as human player at a
// real competition. So the drill closest to a real match counts most.
//
// THE FORMULA (proposed defaults; change them here, in one place):
//
//   drill value, per attempt
//     accuracy    made / attempted                    (a fixed set of shots)
//     rate        made / seconds                      (FUEL per second, a timed burst)
//     match run   FUEL made while the HUB was active  (inactive makes and misses count 0)
//                 only a full run counts (at least FULL_MATCH_SHARE of the match clock)
//   recent best   of the player's last RECENT counted attempts in the season
//                 (newest first), the mean of the best BEST of them. One lucky
//                 run cannot top the board; a player has to do it again.
//   qualified     at least MIN_ATTEMPTS counted attempts in EVERY drill; anyone
//                 short is listed below the board as "needs N more"
//   normalized    recent best / the team best recent best for that drill among
//                 players with MIN_ATTEMPTS in it                         0 to 1
//   Score         round(100 x (MATCH_WEIGHT x match + RATE_WEIGHT x rate
//                              + ACCURACY_WEIGHT x accuracy))           0 to 100
//
// A voided attempt counts for nothing. Seasons scope by attempt_date.

import { MATCH_SECONDS } from './matchSim.js'

export const HP_RULES = Object.freeze({
  RECENT: 5,
  BEST: 3,
  MIN_ATTEMPTS: 3,
  MATCH_WEIGHT: 0.5,
  RATE_WEIGHT: 0.3,
  ACCURACY_WEIGHT: 0.2,
  FULL_MATCH_SHARE: 0.9,
})

export const DRILLS = Object.freeze([
  { key: 'match', label: 'Match run', short: 'Match', unit: 'FUEL per match' },
  { key: 'rate', label: 'Rate', short: 'Rate', unit: 'FUEL per second' },
  { key: 'accuracy', label: 'Accuracy', short: 'Accuracy', unit: 'made' },
])
export const DEFAULT_SHOTS = 20
export const DEFAULT_RATE_SECONDS = 30
export const drillLabel = (k) => DRILLS.find((d) => d.key === k)?.label ?? k ?? ''
const WEIGHT = (rules) => ({ match: rules.MATCH_WEIGHT, rate: rules.RATE_WEIGHT, accuracy: rules.ACCURACY_WEIGHT })

/** 'YYYY-MM-DD' in America/Los_Angeles for a timestamp (the app's one day rule). */
export function laDate(iso) {
  const t = Date.parse(iso ?? '')
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

/** Is a 'YYYY-MM-DD' date inside the season? A null season is All time. */
export function inSeason(date, season) {
  if (!season) return true
  if (!date) return false
  return date >= season.start_date && (season.end_date == null || date <= season.end_date)
}

/** Is a match run long enough to count? A run with no seconds recorded is taken as a full one. */
export function isFullRun(a, rules = HP_RULES) {
  return a.seconds == null || Number(a.seconds) >= rules.FULL_MATCH_SHARE * MATCH_SECONDS
}

/** One attempt's drill value, or null when it does not count (void, partial run, nothing attempted). */
export function attemptValue(a, rules = HP_RULES) {
  if (!a || a.voided_at) return null
  const made = Number(a.made) || 0
  if (a.drill === 'accuracy') { const n = Number(a.attempted) || 0; return n > 0 ? made / n : null }
  if (a.drill === 'rate') { const s = Number(a.seconds) || 0; return s > 0 ? made / s : null }
  if (a.drill === 'match') return isFullRun(a, rules) ? made : null
  return null
}

const newestFirst = (a, b) => (a.attempt_date === b.attempt_date ? Date.parse(b.created_at ?? 0) - Date.parse(a.created_at ?? 0) : a.attempt_date < b.attempt_date ? 1 : -1)

/** One player's one drill: counted attempts, the recent-best value, and how many more are needed. */
export function drillSummary(attempts, drill, rules = HP_RULES) {
  const counted = (attempts ?? []).filter((a) => a.drill === drill && attemptValue(a, rules) != null).sort(newestFirst)
  const recent = counted.slice(0, rules.RECENT).map((a) => attemptValue(a, rules))
  const best = [...recent].sort((x, y) => y - x).slice(0, rules.BEST)
  const value = best.length ? best.reduce((s, x) => s + x, 0) / best.length : null
  const allBest = counted.length ? Math.max(...counted.map((a) => attemptValue(a, rules))) : null
  return { drill, attempts: counted.length, value, personalBest: allBest, needs: Math.max(0, rules.MIN_ATTEMPTS - counted.length) }
}

/**
 * The leaderboard for one season (null = All time). Answers
 * { ranked, unranked, teamBest }: ranked players (every drill qualified),
 * highest score first, then match value, then name; unranked players with at
 * least one counted attempt, most attempts first; teamBest per drill.
 */
export function leaderboard(attempts, season = null, nameOf = () => '', rules = HP_RULES) {
  const by = new Map()
  for (const a of attempts ?? []) {
    if (a.voided_at || !inSeason(a.attempt_date, season)) continue
    if (!by.has(a.member_id)) by.set(a.member_id, [])
    by.get(a.member_id).push(a)
  }
  const players = [...by.entries()].map(([id, list]) => {
    const drills = Object.fromEntries(DRILLS.map((d) => [d.key, drillSummary(list, d.key, rules)]))
    return { id, name: nameOf(id) || 'Member', drills, qualified: DRILLS.every((d) => drills[d.key].needs === 0), counted: DRILLS.reduce((n, d) => n + drills[d.key].attempts, 0) }
  }).filter((p) => p.counted > 0)
  const teamBest = Object.fromEntries(DRILLS.map((d) => {
    const vals = players.filter((p) => p.drills[d.key].needs === 0).map((p) => p.drills[d.key].value)
    return [d.key, vals.length ? Math.max(...vals) : null]
  }))
  const w = WEIGHT(rules)
  for (const p of players) {
    p.norm = Object.fromEntries(DRILLS.map((d) => {
      const v = p.drills[d.key].value, best = teamBest[d.key]
      return [d.key, p.drills[d.key].needs === 0 && best > 0 ? Math.min(1, v / best) : 0]
    }))
    p.score = p.qualified ? Math.round(100 * DRILLS.reduce((s, d) => s + w[d.key] * p.norm[d.key], 0)) : null
    p.needs = DRILLS.filter((d) => p.drills[d.key].needs > 0).map((d) => ({ drill: d.key, label: d.label, more: p.drills[d.key].needs }))
  }
  const ranked = players.filter((p) => p.qualified)
    .sort((a, b) => b.score - a.score || (b.drills.match.value ?? 0) - (a.drills.match.value ?? 0) || a.name.localeCompare(b.name))
  let rank = 0
  ranked.forEach((r, i) => { rank = i > 0 && ranked[i - 1].score === r.score ? rank : i + 1; r.rank = rank })
  const unranked = players.filter((p) => !p.qualified).sort((a, b) => b.counted - a.counted || a.name.localeCompare(b.name))
  return { ranked, unranked, teamBest }
}

/** "needs 2 more match runs, 1 more rate" for an unranked player. */
export function needsText(needs) {
  return 'needs ' + needs.map((n) => `${n.more} more ${n.drill === 'match' ? (n.more === 1 ? 'match run' : 'match runs') : n.label.toLowerCase()}`).join(', ')
}

/** A drill value for display. */
export function fmtValue(drill, v) {
  if (v == null) return '--'
  if (drill === 'accuracy') return `${Math.round(v * 100)}%`
  if (drill === 'rate') return `${v.toFixed(2)}/s`
  return (Math.round(v * 10) / 10).toString()
}

/** The problem with an attempt form, or null. Mirrors the SQL refusals for a friendly message only; the SQL decides. */
export function attemptProblem(v) {
  const int = (x) => Number.isInteger(Number(x)) && String(x).trim() !== ''
  if (!DRILLS.some((d) => d.key === v.drill)) return 'Choose the drill.'
  if (!v.date) return 'Choose the date.'
  const made = Number(v.made), att = Number(v.attempted), inact = Number(v.madeInactive || 0)
  if (!int(v.made) || made < 0) return 'Made is a whole number, 0 or more.'
  if (!int(v.attempted) || att < 1 || att > 1000) return 'Shots taken is a whole number from 1 to 1000.'
  if (!Number.isInteger(inact) || inact < 0) return 'Made while inactive is a whole number, 0 or more.'
  if (made + inact > att) return 'More made than shots taken.'
  if (v.drill === 'accuracy' && att > 200) return 'An accuracy set is at most 200 shots.'
  if (v.drill !== 'accuracy') {
    const s = Number(v.seconds)
    if (!int(v.seconds) || s < 5 || s > 600) return 'Seconds are a whole number from 5 to 600.'
  }
  return null
}
