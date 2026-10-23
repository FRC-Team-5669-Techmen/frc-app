// The Driver Score (migration 0029, ledger 0020): ONE number per driver per
// season, computed here and nowhere else. The SQL stores facts (sessions and
// ratings) and never scores; /drivers and the connector's list_drivers both
// import this file, so the page and Claude can never disagree about a rank.
// Pure: no React, no Supabase. tests/driver-score.test.js drives it.
//
// THE FORMULA (proposed defaults; change them here, in one place):
//
//   real hours     = minutes on the real robot (practice field, match, test) / 60
//   MoSim hours    = minutes in MoSim / 60
//   practice hours = real hours + SIM_WEIGHT x MoSim hours
//   experience     = 1 - e^(-practice hours / HOURS_SCALE)          0 to 1
//                    (diminishing returns: the first hours count most;
//                    with a scale of 10, 10 hours is 63%, 20 is 86%, 30 is 95%)
//   coach          = the mean of each coach's NEWEST rating in the season,
//                    each rating being the mean of the criteria given,
//                    mapped from 1..5 to 0..1                              0 to 1
//                    (no rating yet: 0, and the row reads Unrated)
//   Driver Score   = round(100 x (EXPERIENCE_WEIGHT x experience + COACH_WEIGHT x coach))
//
// Voided sessions count for nothing. A MoSim score is shown but not scored:
// simulator scores change with every game and are not comparable.

export const SCORE_RULES = Object.freeze({
  SIM_WEIGHT: 0.35,
  HOURS_SCALE: 10,
  EXPERIENCE_WEIGHT: 0.5,
  COACH_WEIGHT: 0.5,
})

export const SESSION_KINDS = Object.freeze([
  { key: 'practice_field', label: 'Practice field', real: true },
  { key: 'match', label: 'Match', real: true },
  { key: 'test', label: 'Test', real: true },
  { key: 'mosim', label: 'MoSim', real: false },
])
export const CRITERIA = Object.freeze([
  { key: 'control', label: 'Control' },
  { key: 'awareness', label: 'Awareness' },
  { key: 'scoring', label: 'Scoring' },
  { key: 'defense', label: 'Defense' },
  { key: 'consistency', label: 'Consistency' },
])

const REAL = new Set(SESSION_KINDS.filter((k) => k.real).map((k) => k.key))
export const kindLabel = (k) => SESSION_KINDS.find((x) => x.key === k)?.label ?? k ?? ''
export const isReal = (k) => REAL.has(k)

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

/** One rating's value: the mean of the criteria given, 1..5, or null. */
export function ratingMean(r) {
  const v = CRITERIA.map((c) => r?.[c.key]).filter((x) => x !== null && x !== undefined && x !== '').map(Number).filter((x) => x >= 1 && x <= 5)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

/** Each coach's newest rating for one driver (ratings for that driver only). */
export function latestPerCoach(ratings) {
  const by = new Map()
  for (const r of ratings ?? []) {
    const prev = by.get(r.coach_id)
    if (!prev || Date.parse(r.rated_at) > Date.parse(prev.rated_at)) by.set(r.coach_id, r)
  }
  return [...by.values()]
}

/** The score for one driver from their sessions and ratings already scoped to a season. */
export function driverScore({ sessions = [], ratings = [] } = {}, rules = SCORE_RULES) {
  let realMin = 0, simMin = 0, count = 0, bestSim = null, last = null
  for (const s of sessions) {
    if (s.voided_at) continue
    const m = Number(s.minutes) || 0
    if (m <= 0) continue
    count += 1
    if (isReal(s.kind)) realMin += m
    else if (s.kind === 'mosim') { simMin += m; if (s.sim_score != null && (bestSim == null || Number(s.sim_score) > bestSim)) bestSim = Number(s.sim_score) }
    if (!last || s.session_date > last) last = s.session_date
  }
  const realHours = realMin / 60
  const simHours = simMin / 60
  const practiceHours = realHours + rules.SIM_WEIGHT * simHours
  const experience = practiceHours > 0 ? 1 - Math.exp(-practiceHours / rules.HOURS_SCALE) : 0
  const latest = latestPerCoach(ratings)
  const means = latest.map(ratingMean).filter((x) => x != null)
  const coachAvg = means.length ? means.reduce((a, b) => a + b, 0) / means.length : null
  const coach = coachAvg == null ? 0 : (coachAvg - 1) / 4
  const score = Math.round(100 * (rules.EXPERIENCE_WEIGHT * experience + rules.COACH_WEIGHT * coach))
  return { score, realHours, simHours, practiceHours, experience, coachAvg, coaches: means.length, sessions: count, bestSim, lastDate: last }
}

/**
 * The leaderboard for one season (null = All time): every member with a
 * counted session or a rating in it, highest Driver Score first, then more
 * real hours, then name. Ratings are scoped by their LA date.
 */
export function leaderboard(sessions, ratings, season = null, nameOf = () => '', rules = SCORE_RULES) {
  const by = new Map()
  const slot = (id) => { if (!by.has(id)) by.set(id, { sessions: [], ratings: [] }); return by.get(id) }
  for (const s of sessions ?? []) if (!s.voided_at && inSeason(s.session_date, season)) slot(s.member_id).sessions.push(s)
  for (const r of ratings ?? []) if (inSeason(laDate(r.rated_at), season)) slot(r.driver_id).ratings.push(r)
  const rows = [...by.entries()].map(([id, x]) => ({ id, name: nameOf(id) || 'Member', ...driverScore(x, rules) }))
    .filter((r) => r.sessions > 0 || r.coaches > 0)
  rows.sort((a, b) => b.score - a.score || b.realHours - a.realHours || a.name.localeCompare(b.name))
  let rank = 0
  rows.forEach((r, i) => { rank = i > 0 && rows[i - 1].score === r.score ? rank : i + 1; r.rank = rank })
  return rows
}

/** "2h 05m" style, matching the app's hours readouts; "0m" for nothing. */
export function fmtMinutes(min) {
  const m = Math.round(Number(min) || 0)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
export const fmtHours = (h) => fmtMinutes((Number(h) || 0) * 60)

/** The problem with a session form, or null. Mirrors the SQL refusals for a friendly message only; the SQL decides. */
export function sessionProblem(v) {
  const m = Number(v.minutes)
  if (!SESSION_KINDS.some((k) => k.key === v.kind)) return 'Choose what you drove.'
  if (!Number.isInteger(m) || m < 1 || m > 600) return 'Minutes are a whole number from 1 to 600.'
  if (!v.date) return 'Choose the date.'
  if (v.score !== '' && v.score != null && v.kind !== 'mosim') return 'A score is for a MoSim session only.'
  return null
}
