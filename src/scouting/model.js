import { isExternalEvidence, matchIdentity } from './provenance.js'
// Proposed Techmen rules. TideScout does not publish these formulas.
export const CAPABILITIES = Object.freeze([
  { key: 'trench', label: 'Passes under the TRENCH' },
  { key: 'bump', label: 'Crosses the BUMP' },
  { key: 'ground_intake', label: 'Intakes FUEL from the floor' },
])
export const TIERS = Object.freeze([
  { value: 1, label: 'Tier 1' }, { value: 2, label: 'Tier 2' },
  { value: 3, label: 'Tier 3' }, { value: 'dnp', label: 'Do not pick' },
])
const median = values => {
  const a = [...values].sort((x, y) => x - y)
  if (!a.length) return null
  const i = Math.floor(a.length / 2)
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2
}
function newest(records, key) {
  const found = new Map()
  for (const row of records) {
    const k = key(row), old = found.get(k)
    if (!old || String(row.updated_at ?? row.created_at ?? '') > String(old.updated_at ?? old.created_at ?? '')
      || (String(row.updated_at ?? row.created_at ?? '') === String(old.updated_at ?? old.created_at ?? '') && (row.version ?? 0) > (old.version ?? 0))) found.set(k, row)
  }
  return [...found.values()]
}

// One trial per match. A disputed match is explicit, never a failed trial.
// Missing answers, did_not_see and not_applicable counts are scout responses,
// while yes/no/disputed counts are matches. Callers must label them accordingly.
export function reliability(records, team, capability) {
  const versions = newest(records.filter(r => r.kind === 'observation' && r.team_number === Number(team)),
    r => r.id ?? `${r.event_id}:${r.member_id}:${r.team_number}:${String(r.match_key).trim().toLowerCase()}`)
  const rows = newest(versions, r => `${r.event_id}:${r.member_id}:${r.team_number}:${matchIdentity(r)}`).filter(r => !isExternalEvidence(r))
  const matches = new Map()
  const out = { yes: 0, no: 0, denominator: 0, percent: null, sufficient: false, disputed: 0, didNotSee: 0, notApplicable: 0, missing: 0 }
  for (const row of rows) {
    const answer = row.payload?.answers?.[capability]
    if (answer === 'did_not_see') out.didNotSee++
    else if (answer === 'not_applicable') out.notApplicable++
    else if (answer !== 'yes' && answer !== 'no') out.missing++
    if (answer === 'yes' || answer === 'no') {
      const key = `${row.event_id}:${matchIdentity(row)}`
      if (!matches.has(key)) matches.set(key, new Set())
      matches.get(key).add(answer)
    }
  }
  for (const answers of matches.values()) {
    if (answers.size > 1) out.disputed++
    else if (answers.has('yes')) out.yes++
    else out.no++
  }
  out.denominator = out.yes + out.no
  out.percent = out.denominator ? 100 * out.yes / out.denominator : null
  out.sufficient = out.denominator >= 3
  return out
}

// Each author contributes at most once per event. All submitted votes remain;
// there is no inferred outlier deletion and no zero for an unranked team.
export function aggregatePickLists(records) {
  const lists = newest(records.filter(r => r.kind === 'pick_list'), r => `${r.event_id}:${r.member_id}`)
  const teams = new Map()
  for (const list of lists) {
    const seen = new Set()
    for (const entry of list.payload?.entries ?? []) {
      if (!Number.isInteger(entry.team) || entry.team <= 0 || seen.has(entry.team)) continue
      if (![1, 2, 3, 'dnp'].includes(entry.tier) || !Number.isInteger(entry.rank) || entry.rank <= 0) continue
      seen.add(entry.team)
      if (!teams.has(entry.team)) teams.set(entry.team, [])
      teams.get(entry.team).push(entry)
    }
  }
  return [...teams].map(([team, votes]) => {
    const ranked = votes.filter(v => v.tier !== 'dnp')
    const dnpVotes = votes.length - ranked.length
    return { team, tier: median(ranked.map(v => v.tier)) ?? 'dnp', rank: median(ranked.map(v => v.rank)),
      support: votes.length, rankedVotes: ranked.length, dnpVotes, dnpFraction: dnpVotes / votes.length }
  }).sort((a, b) => (a.tier === 'dnp' ? 4 : a.tier) - (b.tier === 'dnp' ? 4 : b.tier)
    || (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.team - b.team)
}

export function previewComparison(entries, selectedTeams, votes) {
  if (!Array.isArray(selectedTeams) || selectedTeams.length !== 3 || new Set(selectedTeams).size !== 3) throw new Error('Select three different teams.')
  const selected = new Set(selectedTeams)
  const ordered = [...entries].sort((a, b) => (a.tier === 'dnp' ? 4 : a.tier) - (b.tier === 'dnp' ? 4 : b.tier) || a.rank - b.rank)
  if (new Set(ordered.map(e => e.team)).size !== ordered.length || selectedTeams.some(t => !ordered.some(e => e.team === t))) throw new Error('All three teams must appear once in your list.')
  const wins = new Map(selectedTeams.map(t => [t, 0])), seen = new Set()
  for (const vote of votes ?? []) {
    if (!selected.has(vote.winner) || !selected.has(vote.loser) || vote.winner === vote.loser) throw new Error('A comparison must name two selected teams.')
    const pair = [vote.winner, vote.loser].sort((a, b) => a - b).join(':')
    if (seen.has(pair)) throw new Error('Each pair can be compared only once.')
    seen.add(pair)
    wins.set(vote.winner, wins.get(vote.winner) + 1)
  }
  if (seen.size !== 3) throw new Error('Complete all three comparisons before previewing.')
  const slots = ordered.map((e, i) => selected.has(e.team) ? i : -1).filter(i => i >= 0)
  const sorted = slots.map(i => ordered[i]).sort((a, b) => wins.get(b.team) - wins.get(a.team))
  const proposed = ordered.map(e => ({ ...e }))
  slots.forEach((slot, i) => { proposed[slot] = { ...proposed[slot], team: sorted[i].team } })
  return { entries: proposed, changed: ordered.some((e, i) => e.team !== proposed[i].team),
    results: sorted.map(e => ({ team: e.team, wins: wins.get(e.team) })) }
}

// EPA is an estimate; null or stale values never satisfy a numeric filter.
// The capability filter operates on pit claims only, never verified reliability.
export function filterTeams(records, { minEpa = '', capability = '', now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000 } = {}) {
  const pits = newest(records.filter(r => r.kind === 'pit'), r => `${r.event_id}:${r.team_number}`)
  const threshold = minEpa === '' || minEpa == null ? null : Number(minEpa)
  return records.filter(r => r.kind === 'team').filter(row => {
    if (threshold !== null) {
      const at = Date.parse(row.payload?.epa_fetched_at)
      if (!Number.isFinite(threshold) || typeof row.payload?.epa !== 'number' || !Number.isFinite(row.payload.epa)
        || row.payload.epa < threshold || !Number.isFinite(at) || at > now || now - at > maxAgeMs) return false
    }
    return !capability || pits.some(p => p.event_id === row.event_id && p.team_number === row.team_number && p.payload?.capabilities?.[capability] === 'yes')
  })
}

// Pit addresses remain useful when old, but their age must not disappear.
// A first-hand pit report takes precedence over an imported directory address.
export function pitLocation(records, team, now = Date.now()) {
  const pit = newest(records.filter(r => r.kind === 'pit' && r.team_number === Number(team)), r => r.team_number)[0]
  const imported = newest(records.filter(r => r.kind === 'team' && r.team_number === Number(team)), r => r.team_number)[0]
  const firstHand = !!pit?.payload?.pit_location?.trim()
  const value = firstHand ? pit.payload.pit_location : imported?.payload?.pit_location
  if (!value?.trim()) return { value: null, source: 'Not recorded', at: null, stale: false }
  const source = firstHand ? 'Scout pit report' : imported.payload.pit_source === 'nexus' ? 'Nexus' : imported.payload.pit_source === 'manual' || imported.payload.source === 'manual' ? 'Manual entry' : 'Source not recorded'
  const at = firstHand ? pit.updated_at || pit.created_at : imported.payload.pit_fetched_at || imported.updated_at
  const time = Date.parse(at)
  return { value, source, at: Number.isFinite(time) ? at : null, stale: !Number.isFinite(time) || time > now || now - time > 24 * 60 * 60 * 1000 }
}
