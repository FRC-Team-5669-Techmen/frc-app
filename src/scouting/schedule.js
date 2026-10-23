import { matchIdentity, isExternalEvidence } from './provenance.js'
import { alliances } from './superscout.js'
// Proposed Techmen rotation policy, not a recovered TideScout algorithm.
const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })
const teamOK = n => Number.isInteger(n) && n > 0 && n <= 99999
export const matchOrder = (a, b) => {
  if (a.time != null && b.time != null && a.time !== b.time) return a.time - b.time
  return natural.compare(a.key, b.key)
}
export function validateSchedule(matches) {
  if (!Array.isArray(matches) || !matches.length || matches.length > 1000) throw new Error('Provide between 1 and 1000 matches.')
  const seen = new Set()
  return matches.map(m => {
    const key = String(m.key ?? '').trim()
    if (!key || key.length > 100 || seen.has(matchIdentity({ match_key: key }))) throw new Error('Match labels must be unique and at most 100 characters.')
    if (!Array.isArray(m.teams) || !m.teams.length || m.teams.length > 6 || m.teams.some(t => !teamOK(t)) || new Set(m.teams).size !== m.teams.length) throw new Error(`Check teams in ${key}: use 1 to 6 different team numbers.`)
    seen.add(matchIdentity({ match_key: key }))
    return { key, teams: [...m.teams], time: Number.isFinite(m.time) ? m.time : null,
      videos: (m.videos ?? []).filter(v => typeof v === 'string' && /^https:\/\//i.test(v)).slice(0, 5) }
  }).sort(matchOrder)
}
// Simple paste format avoids depending on a provider credential for event setup.
export function parseSchedule(text) {
  const lines = text.trim().split(/\r?\n/).filter(x => x.trim())
  return validateSchedule(lines.map((line, i) => {
    const [key, ...teams] = line.trim().split(/[\s,;]+/)
    if (teams.some(t => !/^\d+$/.test(t))) throw new Error(`Line ${i + 1}: enter a match label followed by team numbers.`)
    return { key, teams: teams.map(Number) }
  }))
}
export function scheduleText(matches) { return matches.map(m => `${m.key}, ${m.teams.join(', ')}`).join('\n') }
export function assignmentFingerprint(records) {
  return JSON.stringify(records.filter(r => r.kind === 'assignment' || r.kind === 'observation')
    .map(r => [r.id, r.version, r.localStatus ?? '', r.kind, r.match_key, r.team_number, r.payload?.assignee, r.payload?.status])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}
// Coverage modes (ledger 0022). One scout per robot is six per match; with
// PAIR_MIN or more scouts on the shift, two per robot gives redundant pairs
// that pairs.js reconciles. 'auto' picks pairs only when the shift is big enough.
export const PAIR_MIN = 12
export function coveragePerRobot(coverage = 'auto', scoutCount = 0) {
  if (coverage === 'single') return 1
  if (coverage === 'pairs') {
    if (scoutCount < PAIR_MIN) throw new Error(`Two scouts per robot needs ${PAIR_MIN} or more scouts on the shift (${scoutCount} selected).`)
    return 2
  }
  if (coverage !== 'auto') throw new Error('Choose a coverage mode.')
  return scoutCount >= PAIR_MIN ? 2 : 1
}
const SUPER_TEXT = 'Super scout this alliance. No counts: rate driver skill, defense, speed and intake reliability for each robot, and note every failure.'
export function planAssignments({ matches, scouts, records = [], teams = [], start = 0, end, mode = 'live', coverage = 'single', supers = [], superPerAlliance = 0 }) {
  const ordered = validateSchedule(matches)
  if (!Array.isArray(scouts) || (!scouts.length && !supers.length) || new Set([...scouts, ...supers].map(s => s.id)).size !== scouts.length + supers.length || [...scouts, ...supers].some(s => !s.id)) throw new Error('Select at least one different scout. A super scout cannot also be a robot scout on the same shift.')
  if (!['live', 'video'].includes(mode)) throw new Error('Choose live or video assignments.')
  if (![0, 1, 2].includes(superPerAlliance)) throw new Error('Choose 0, 1 or 2 super scouts per alliance.')
  if (superPerAlliance && !supers.length) throw new Error('Select at least one super scout.')
  const perRobot = scouts.length ? coveragePerRobot(coverage, scouts.length) : 0
  if (!Number.isInteger(start) || start < 0 || start >= ordered.length || (end != null && (!Number.isInteger(end) || end < start || end >= ordered.length))) throw new Error('Choose a valid match range.')
  const selected = ordered.slice(start, (end ?? ordered.length - 1) + 1), selectedKeys = new Set(selected.map(m => matchIdentity({ match_key: m.key })))
  const active = records.filter(r => r.kind === 'assignment' && r.payload?.status !== 'cancelled' && !isExternalEvidence(r))
  const robotRows = [...active.filter(r => r.payload?.role !== 'super'), ...records.filter(r => r.kind === 'observation' && r.payload?.role !== 'super' && !isExternalEvidence(r))]
  // Distinct people already on each robot: an assignee or an observation author.
  const coveredBy = new Map()
  for (const r of robotRows) {
    const k = `${matchIdentity(r)}:${r.team_number}`, who = r.kind === 'assignment' ? r.payload.assignee : r.member_id
    if (!coveredBy.has(k)) coveredBy.set(k, new Set())
    coveredBy.get(k).add(who)
  }
  const pool = [...scouts, ...supers]
  const loads = new Map(pool.map(s => [s.id, active.filter(r => r.payload.assignee === s.id && selectedKeys.has(matchIdentity(r))).length]))
  const last = new Map(), proposals = [], gaps = [], existing = [], conflicts = []
  const targets = new Set(teams.map(Number))
  const unavailable = (s, match) => (s.unavailable ?? []).some(key => matchIdentity({ match_key: key }) === matchIdentity({ match_key: match.key }))
  const pick = (list, taken, index, match, also = new Set()) => list.filter(s => !taken.has(s.id) && !also.has(s.id) && !unavailable(s, match))
    .sort((a, b) => loads.get(a.id) - loads.get(b.id) || Number(last.get(a.id) === index - 1) - Number(last.get(b.id) === index - 1) || natural.compare(a.id, b.id))[0]
  const use = (scout, taken, index) => { taken.add(scout.id); loads.set(scout.id, loads.get(scout.id) + 1); last.set(scout.id, index) }
  for (let index = 0; index < selected.length; index++) {
    const match = selected[index], taken = new Set(), id = matchIdentity({ match_key: match.key })
    for (const row of active.filter(r => matchIdentity(r) === id)) {
      if (taken.has(row.payload.assignee) && row.payload?.role !== 'super') conflicts.push({ match: match.key, scout: row.payload.assignee })
      taken.add(row.payload.assignee); last.set(row.payload.assignee, index)
    }
    if (perRobot) for (const team of match.teams.filter(t => !targets.size || targets.has(t))) {
      const have = coveredBy.get(`${id}:${team}`) ?? new Set()
      if (have.size >= perRobot) { existing.push({ match: match.key, team }); continue }
      if (mode === 'video' && !match.videos.length) { gaps.push({ match: match.key, team, reason: 'No footage link' }); continue }
      for (let slot = have.size; slot < perRobot; slot++) {
        const scout = pick(scouts, taken, index, match, have)
        if (!scout) { gaps.push({ match: match.key, team, reason: perRobot > 1 ? `No available scout for pair slot ${slot + 1}` : 'No available scout' }); continue }
        use(scout, taken, index)
        proposals.push({ kind: 'assignment', version: 0, team_number: team, match_key: match.key,
          payload: { assignee: scout.id, status: 'assigned', instructions: mode === 'video' ? 'Review this match footage. Record visible evidence and useful timestamps.' : perRobot > 1 ? 'Watch this robot live. A second scout watches it too; count independently.' : 'Watch this robot live. Record visible evidence and useful match notes.', video_url: mode === 'video' ? match.videos[0] : '' } })
      }
    }
    if (superPerAlliance) for (const { alliance, teams: allianceTeams } of alliances(match)) {
      const have = active.filter(r => r.payload?.role === 'super' && r.payload?.alliance === alliance && matchIdentity(r) === id).length
      if (have >= superPerAlliance) { existing.push({ match: match.key, team: allianceTeams[0], alliance }); continue }
      if (mode === 'video' && !match.videos.length) { gaps.push({ match: match.key, team: allianceTeams[0], alliance, reason: 'No footage link' }); continue }
      for (let slot = have; slot < superPerAlliance; slot++) {
        const scout = pick(supers, taken, index, match)
        if (!scout) { gaps.push({ match: match.key, team: allianceTeams[0], alliance, reason: 'No available super scout' }); continue }
        use(scout, taken, index)
        proposals.push({ kind: 'assignment', version: 0, team_number: allianceTeams[0], match_key: match.key,
          payload: { assignee: scout.id, status: 'assigned', instructions: SUPER_TEXT, video_url: mode === 'video' ? match.videos[0] : '', role: 'super', alliance, teams: allianceTeams } })
      }
    }
  }
  return { proposals, gaps, existing, conflicts, perRobot, loads: pool.map(s => ({ id: s.id, count: loads.get(s.id), role: supers.some(x => x.id === s.id) ? 'super' : 'scout' })), fingerprint: assignmentFingerprint(records) }
}
