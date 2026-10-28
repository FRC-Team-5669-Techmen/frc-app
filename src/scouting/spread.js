// What tells robots apart (feedback 449543dd, Azad): "This evidence/scouting
// material does not seem good, as I believe every robot does these areas."
// A yes/no that every observed robot answers the same way ranks nobody, so
// the team card leads with the answers that VARY between robots and folds the
// shared ones into one line each.
//
// THE MODULE RULES STAND. Inputs are the confirmed records the team card
// already uses; per-team figures come from model.js reliability and
// options.js optionSummary unchanged. A team with no evidence is left out of
// the comparison, never counted as 0 or as "no". "Shared" needs at least
// SHARED_MIN observed robots, and the card states how many, so two robots are
// never presented as "every robot".
import { currentObservations, reliability } from './model.js'
import { optionSummary } from './options.js'

export const SHARED_MIN = 2

/** Teams with at least one confirmed current-event observation. */
export function observedTeams(records) {
  const teams = [...new Set(records.filter(r => r.kind === 'observation').map(r => r.team_number))].filter(n => Number.isInteger(n))
  return teams.filter(n => currentObservations(records, n).length > 0).sort((a, b) => a - b)
}

/**
 * How one capability's answers spread across observed robots:
 * { state: 'varies' | 'shared' | 'unknown', teams, value } where teams counts
 * robots with a decisive (yes/no) answer and value is 'yes' or 'no' when shared.
 */
export function capabilitySpread(records, key, teams = observedTeams(records)) {
  const rates = teams.map(n => reliability(records, n, key)).filter(r => r.denominator > 0)
  return spreadOf(rates.map(r => (r.no === 0 ? 'yes' : r.yes === 0 ? 'no' : 'mixed')))
}

/** The same for one observation option (0037), by its type. A note never compares. */
export function optionSpread(records, o, teams = observedTeams(records)) {
  if (o.type === 'note') return { state: 'unknown', teams: 0, value: null }
  const sums = teams.map(n => optionSummary(records, n, o)).filter(s => s.n > 0)
  if (o.type === 'yesno') return spreadOf(sums.map(s => (s.no === 0 ? 'yes' : s.yes === 0 ? 'no' : 'mixed')))
  if (o.type === 'choice') return spreadOf(sums.map(s => (Object.keys(s.counts).length === 1 ? s.top : 'mixed')))
  return spreadOf(sums.map(s => String(s.median)))
}

function spreadOf(values) {
  if (values.length < SHARED_MIN) return { state: 'unknown', teams: values.length, value: null }
  const set = new Set(values)
  if (set.size === 1 && !set.has('mixed')) return { state: 'shared', teams: values.length, value: values[0] }
  return { state: 'varies', teams: values.length, value: null }
}

const RANK = { varies: 0, unknown: 1, shared: 2 }
/** Items with a spread, the ones that vary first, original order kept within each group. */
export function byDifference(items) {
  return items.map((item, i) => ({ item, i })).sort((a, b) => RANK[a.item.spread.state] - RANK[b.item.spread.state] || a.i - b.i).map(x => x.item)
}

/** The one line a shared item reads: "Every robot observed so far does this (12 robots)." */
export function sharedText(spread, { yesno = true, valueLabel = null } = {}) {
  const robots = `${spread.teams} robots`
  if (yesno && spread.value === 'yes') return `Every robot observed so far does this (${robots}).`
  if (yesno && spread.value === 'no') return `No robot observed so far does this (${robots}).`
  return `Same for every robot observed so far: ${valueLabel ?? spread.value} (${robots}).`
}
