// REBUILT match fields on a scouting observation (migration 0027, ledger 0017).
// A student tester: "every robot does these areas". His own notes were FUEL
// counts, shooting and defense ratings, where a robot collects and shoots, and
// "got stuck". These are those fields.
//
// THE MODULE RULE STANDS: a missing answer is never a zero. Every field is
// ABSENT from payload.match until a scout records it; 0 is an observed count
// of zero; did_not_see is an explicit limitation. JSON null is refused by the
// server (0027) and never written here.
//
// Summaries use the module's existing projection rules: confirmed records
// only (the caller passes serverRecords), current-event evidence only, and
// one latest observation per author per match (model.js currentObservations).
// Medians are over matches where the field was recorded, with the count shown;
// a rate's denominator is matches with a decisive yes or no.
import { currentObservations } from './model.js'
import { matchIdentity } from './provenance.js'

export const YES_NO = Object.freeze([['yes', 'Yes'], ['no', 'No'], ['did_not_see', 'Did not see']])

// The one field list. `server` keys are exactly 0027's validate_match keys
// (tests/scouting-match.test.js holds them equal).
export const MATCH_FIELDS = Object.freeze([
  { key: 'auto_fuel', phase: 'auto', type: 'count', label: 'FUEL scored in auto', short: 'Auto FUEL' },
  { key: 'auto_climb', phase: 'auto', type: 'yesno', label: 'Climbed in auto', short: 'Auto climb' },
  { key: 'teleop_fuel', phase: 'teleop', type: 'count', label: 'FUEL scored in teleop', short: 'Teleop FUEL' },
  { key: 'teleop_missed', phase: 'teleop', type: 'count', label: 'FUEL missed in teleop', short: 'Missed', optional: true },
  { key: 'shuttled', phase: 'teleop', type: 'yesno', label: 'Shuttled or fed FUEL to its alliance', short: 'Shuttled' },
  { key: 'defense', phase: 'teleop', type: 'choice', label: 'Defense played', short: 'Defense', options: [['none', 'None'], ['some', 'Some'], ['most', 'Most of the match']] },
  { key: 'defense_rating', phase: 'teleop', type: 'rating', label: 'Defense effectiveness', short: 'Defense 1-5' },
  { key: 'driver_skill', phase: 'teleop', type: 'rating', label: 'Driver skill', short: 'Driver 1-5' },
  { key: 'tower', phase: 'endgame', type: 'choice', label: 'TOWER level reached', short: 'TOWER',
    options: [['none', 'None'], ['level1', 'Level 1'], ['level2', 'Level 2'], ['level3', 'Level 3'], ['failed', 'Tried, failed'], ['did_not_see', 'Did not see']] },
  { key: 'died', phase: 'reliability', type: 'yesno', label: 'Died or browned out', short: 'Died' },
  { key: 'tipped', phase: 'reliability', type: 'yesno', label: 'Tipped over', short: 'Tipped' },
  { key: 'stuck', phase: 'reliability', type: 'yesno', label: 'Got stuck', short: 'Stuck' },
  { key: 'broke', phase: 'reliability', type: 'yesno', label: 'Broke a mechanism', short: 'Broke' },
  { key: 'fouls', phase: 'reliability', type: 'note', label: 'Fouls or cards', short: 'Fouls' },
])
export const PHASES = Object.freeze([['auto', 'Auto'], ['teleop', 'Teleop'], ['endgame', 'Endgame'], ['reliability', 'Reliability']])
export const MAX_COUNT = 500

const byKey = Object.fromEntries(MATCH_FIELDS.map(f => [f.key, f]))
const TOWER_LEVEL = { none: 0, level1: 1, level2: 2, level3: 3, failed: 0 }

/** Step a count: absent + 1 is 1, absent - 1 stays absent, never below 0, never above 500. */
export function stepCount(value, delta) {
  if (value === undefined || value === null) return delta > 0 ? Math.min(MAX_COUNT, delta) : undefined
  return Math.max(0, Math.min(MAX_COUNT, value + delta))
}

/** The match object with only recorded fields, each the server's type. */
export function cleanMatch(match) {
  const out = {}
  for (const [k, v] of Object.entries(match ?? {})) {
    const f = byKey[k]
    if (!f || v === undefined || v === null || v === '') continue
    if (f.type === 'count' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT) out[k] = v
    else if (f.type === 'rating' && [1, 2, 3, 4, 5].includes(v)) out[k] = v
    else if (f.type === 'yesno' && YES_NO.some(([x]) => x === v)) out[k] = v
    else if (f.type === 'choice' && f.options.some(([x]) => x === v)) out[k] = v
    else if (f.type === 'note' && typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 500)
  }
  return out
}

export const recordedCount = match => Object.keys(cleanMatch(match)).length

const median = values => {
  const a = [...values].sort((x, y) => x - y)
  if (!a.length) return null
  const i = Math.floor(a.length / 2)
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2
}

/**
 * One value per MATCH for a field: scouts who watched the same match are not
 * independent samples. Counts and ratings take the median of the scouts'
 * values in that match; a yes/no is disputed (excluded) when scouts disagree.
 */
function perMatch(rows, key) {
  const groups = new Map()
  for (const r of rows) {
    const v = r.payload?.match?.[key]
    if (v === undefined || v === null) continue
    const g = `${r.event_id}:${matchIdentity(r)}`
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(v)
  }
  return [...groups.values()]
}

/** Per-team summary of the match fields, from confirmed current observations. */
export function teamMatchSummary(records, team) {
  const rows = currentObservations(records, team)
  const matches = new Set(rows.filter(r => recordedCount(r.payload?.match) > 0).map(r => `${r.event_id}:${matchIdentity(r)}`)).size
  const out = { team: Number(team), matches }
  for (const f of MATCH_FIELDS) {
    const groups = perMatch(rows, f.key)
    if (f.type === 'count' || f.type === 'rating') {
      const values = groups.map(g => median(g)).filter(v => v !== null)
      out[f.key] = { median: median(values), n: values.length }
    } else if (f.type === 'yesno') {
      let yes = 0, no = 0, unseen = 0, disputed = 0
      for (const g of groups) {
        const s = new Set(g)
        if (s.has('yes') && s.has('no')) disputed++
        else if (s.has('yes')) yes++
        else if (s.has('no')) no++
        else unseen++
      }
      out[f.key] = { yes, no, n: yes + no, rate: yes + no ? yes / (yes + no) : null, unseen, disputed }
    } else if (f.key === 'tower') {
      const levels = [], seen = { none: 0, level1: 0, level2: 0, level3: 0, failed: 0, did_not_see: 0 }
      for (const g of groups) {
        for (const v of g) if (v in seen) seen[v]++
        const decisive = g.filter(v => v in TOWER_LEVEL).map(v => TOWER_LEVEL[v])
        if (decisive.length) levels.push(median(decisive))
      }
      out.tower = { median: median(levels), best: levels.length ? Math.max(...levels) : null, n: levels.length, counts: seen }
    } else if (f.key === 'defense') {
      const counts = { none: 0, some: 0, most: 0 }
      for (const g of groups) for (const v of g) if (v in counts) counts[v]++
      const played = groups.filter(g => g.some(v => v !== 'none')).length
      out.defense = { n: groups.length, played, rate: groups.length ? played / groups.length : null, counts }
    } else if (f.type === 'note') {
      out[f.key] = { notes: rows.map(r => r.payload?.match?.[f.key]).filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()) }
    }
  }
  out.totalFuel = out.auto_fuel.n || out.teleop_fuel.n ? { median: median(groupsSum(rows)), n: groupsSum(rows).length } : { median: null, n: 0 }
  out.troubleRate = troubleRate(rows)
  return out
}

// Per match: auto + teleop FUEL, only where at least one was recorded (an
// absent phase counts as not recorded, so a match with only teleop recorded
// contributes its teleop count, labeled in the help text).
function groupsSum(rows) {
  const groups = new Map()
  for (const r of rows) {
    const m = r.payload?.match ?? {}
    if (m.auto_fuel === undefined && m.teleop_fuel === undefined) continue
    const g = `${r.event_id}:${matchIdentity(r)}`
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push((m.auto_fuel ?? 0) + (m.teleop_fuel ?? 0))
  }
  return [...groups.values()].map(g => median(g))
}

// The share of decisive matches with ANY of died, tipped, stuck or broke.
function troubleRate(rows) {
  const groups = new Map()
  for (const r of rows) {
    const m = r.payload?.match ?? {}
    const vals = ['died', 'tipped', 'stuck', 'broke'].map(k => m[k]).filter(v => v === 'yes' || v === 'no')
    if (!vals.length) continue
    const g = `${r.event_id}:${matchIdentity(r)}`
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(vals.includes('yes'))
  }
  const decided = [...groups.values()].filter(g => new Set(g).size === 1)
  const bad = decided.filter(g => g[0]).length
  return { n: decided.length, bad, rate: decided.length ? bad / decided.length : null, disputed: groups.size - decided.length }
}

export const fmtMedian = s => (s?.median === null || s?.median === undefined ? '--' : Number.isInteger(s.median) ? String(s.median) : s.median.toFixed(1))
export const fmtRate = s => (s?.rate === null || s?.rate === undefined ? '--' : `${Math.round(s.rate * 100)}%`)
export const towerLabel = level => (level === null || level === undefined ? '--' : level === 0 ? 'None' : `L${Number.isInteger(level) ? level : level.toFixed(1)}`)

// Pick-list filters over the match summaries. An unknown value NEVER satisfies
// a minimum or a maximum: a team with no recorded FUEL is not "under 10".
export const MATCH_FILTERS = Object.freeze([
  { key: 'min_fuel', label: 'Median FUEL at least', test: (s, v) => s.totalFuel.median !== null && s.totalFuel.median >= v },
  { key: 'min_tower', label: 'Best TOWER level at least', test: (s, v) => s.tower.best !== null && s.tower.best >= v },
  { key: 'max_trouble', label: 'Died, tipped, stuck or broke at most (%)', test: (s, v) => s.troubleRate.rate !== null && s.troubleRate.rate * 100 <= v },
  { key: 'min_driver', label: 'Median driver skill at least', test: (s, v) => s.driver_skill.median !== null && s.driver_skill.median >= v },
  { key: 'defense', label: 'Has played defense', test: s => s.defense.played > 0 },
])

export function passesMatchFilters(summary, filters) {
  return MATCH_FILTERS.every(f => {
    const v = filters?.[f.key]
    if (v === undefined || v === '' || v === false || v === null) return true
    return f.test(summary, typeof v === 'boolean' ? v : Number(v))
  })
}
