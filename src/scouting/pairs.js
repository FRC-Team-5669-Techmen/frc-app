// Redundant-pair reconciliation (ledger 0022).
//
// With 12 or more scouts on a shift the planner puts TWO scouts on every
// robot. Their two sheets are reconciled here, per team per match: counts and
// ratings are averaged, and a field is flagged for a lead to check when the
// two scouts disagree by more than the threshold. Yes/no and choice fields are
// flagged when the decisive answers differ (did_not_see never disagrees).
//
// For two scouts the average equals the median that teamMatchSummary
// (match.js) already uses for one value per match, so the team figures and
// this sheet never contradict each other. Input is confirmed, current-event,
// quantitative observations only: currentObservations already drops super
// notes, prior-event footage and superseded corrections.
import { currentObservations } from './model.js'
import { matchIdentity } from './provenance.js'
import { MATCH_FIELDS } from './match.js'

// FUEL is counted by fives, so 10 is two taps apart; ratings are 1 to 5.
export const PAIR_THRESHOLDS = Object.freeze({ count: 10, rating: 1 })

const mean = vals => Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10

export function reconcileMatch(rows, thresholds = PAIR_THRESHOLDS) {
  const fields = {}, flags = []
  for (const f of MATCH_FIELDS) {
    const values = rows.map(r => r.payload?.match?.[f.key]).filter(v => v !== undefined && v !== null)
    if (!values.length || f.type === 'note') continue
    if (f.type === 'count' || f.type === 'rating') {
      const spread = Math.max(...values) - Math.min(...values)
      const flagged = values.length > 1 && spread > (f.type === 'count' ? thresholds.count : thresholds.rating)
      fields[f.key] = { values, value: mean(values), spread, flagged }
      if (flagged) flags.push(f.key)
    } else {
      const decisive = [...new Set(values.filter(v => v !== 'did_not_see'))]
      const flagged = decisive.length > 1
      fields[f.key] = { values, value: decisive.length === 1 ? decisive[0] : flagged ? 'disputed' : 'did_not_see', flagged }
      if (flagged) flags.push(f.key)
    }
  }
  return { fields, flags }
}

/**
 * Every team/match watched by two or more scouts, reconciled. Rows with one
 * scout are not pairs and are left out. Sorted flagged first.
 */
export function reconcilePairs(records, { thresholds = PAIR_THRESHOLDS } = {}) {
  const teams = [...new Set(records.filter(r => r.kind === 'observation').map(r => r.team_number).filter(Number.isInteger))]
  const out = []
  for (const team of teams) {
    const groups = new Map()
    for (const r of currentObservations(records, team)) {
      const k = matchIdentity(r)
      if (!groups.has(k)) groups.set(k, [])
      groups.get(k).push(r)
    }
    for (const [match, rows] of groups) {
      if (new Set(rows.map(r => r.member_id)).size < 2) continue
      const { fields, flags } = reconcileMatch(rows, thresholds)
      out.push({ team, match, scouts: rows.length, members: rows.map(r => r.member_id), fields, flags })
    }
  }
  return out.sort((a, b) => Number(!a.flags.length) - Number(!b.flags.length) || a.team - b.team || a.match.localeCompare(b.match, 'en', { numeric: true }))
}

const PAIR_FIELDS = MATCH_FIELDS.filter(f => f.type === 'count' || f.type === 'rating')
export const PAIR_COLUMNS = Object.freeze([
  { key: 'team', label: 'Team' }, { key: 'match', label: 'Match' }, { key: 'scouts', label: 'Scouts' },
  ...PAIR_FIELDS.map(f => ({ key: f.key, label: `${f.short} (avg)` })),
  { key: 'status', label: 'Status' }, { key: 'flags', label: 'Disagreements' },
])

export function pairRows(confirmed, { thresholds = PAIR_THRESHOLDS } = {}) {
  const label = Object.fromEntries(MATCH_FIELDS.map(f => [f.key, f.short]))
  return reconcilePairs(confirmed, { thresholds }).map(p => ({
    team: p.team, match: p.match, scouts: p.scouts,
    ...Object.fromEntries(PAIR_FIELDS.map(f => [f.key, p.fields[f.key]?.value ?? ''])),
    status: p.flags.length ? 'Check' : 'Agree',
    flags: p.flags.map(k => `${label[k]}: ${p.fields[k].values.join(' vs ')}`).join('; '),
  }))
}
