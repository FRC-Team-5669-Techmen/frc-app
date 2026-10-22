import { matchIdentity, isExternalEvidence } from './provenance.js'
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
export function planAssignments({ matches, scouts, records = [], teams = [], start = 0, end, mode = 'live' }) {
  const ordered = validateSchedule(matches)
  if (!Array.isArray(scouts) || !scouts.length || new Set(scouts.map(s => s.id)).size !== scouts.length || scouts.some(s => !s.id)) throw new Error('Select at least one different scout.')
  if (!['live', 'video'].includes(mode)) throw new Error('Choose live or video assignments.')
  if (!Number.isInteger(start) || start < 0 || start >= ordered.length || (end != null && (!Number.isInteger(end) || end < start || end >= ordered.length))) throw new Error('Choose a valid match range.')
  const selected = ordered.slice(start, (end ?? ordered.length - 1) + 1), selectedKeys = new Set(selected.map(m => matchIdentity({ match_key: m.key })))
  const active = records.filter(r => r.kind === 'assignment' && r.payload?.status !== 'cancelled' && !isExternalEvidence(r))
  const covered = new Set([...active, ...records.filter(r => r.kind === 'observation' && !isExternalEvidence(r))].map(r => `${matchIdentity(r)}:${r.team_number}`))
  const loads = new Map(scouts.map(s => [s.id, active.filter(r => r.payload.assignee === s.id && selectedKeys.has(matchIdentity(r))).length]))
  const last = new Map(), proposals = [], gaps = [], existing = [], conflicts = []
  const targets = new Set(teams.map(Number))
  for (let index = 0; index < selected.length; index++) {
    const match = selected[index], taken = new Set()
    for (const row of active.filter(r => matchIdentity(r) === matchIdentity({ match_key: match.key }))) {
      if (taken.has(row.payload.assignee)) conflicts.push({ match: match.key, scout: row.payload.assignee })
      taken.add(row.payload.assignee); last.set(row.payload.assignee, index)
    }
    for (const team of match.teams.filter(t => !targets.size || targets.has(t))) {
      if (covered.has(`${matchIdentity({ match_key: match.key })}:${team}`)) { existing.push({ match: match.key, team }); continue }
      if (mode === 'video' && !match.videos.length) { gaps.push({ match: match.key, team, reason: 'No footage link' }); continue }
      const candidates = scouts.filter(s => !taken.has(s.id) && !(s.unavailable ?? []).some(key => matchIdentity({ match_key: key }) === matchIdentity({ match_key: match.key })))
        .sort((a, b) => loads.get(a.id) - loads.get(b.id) || Number(last.get(a.id) === index - 1) - Number(last.get(b.id) === index - 1) || natural.compare(a.id, b.id))
      if (!candidates.length) { gaps.push({ match: match.key, team, reason: 'No available scout' }); continue }
      const scout = candidates[0]
      taken.add(scout.id); loads.set(scout.id, loads.get(scout.id) + 1); last.set(scout.id, index)
      proposals.push({ kind: 'assignment', version: 0, team_number: team, match_key: match.key,
        payload: { assignee: scout.id, status: 'assigned', instructions: mode === 'video' ? 'Review this match footage. Record visible evidence and useful timestamps.' : 'Watch this robot live. Record visible evidence and useful match notes.', video_url: mode === 'video' ? match.videos[0] : '' } })
    }
  }
  return { proposals, gaps, existing, conflicts, loads: scouts.map(s => ({ id: s.id, count: loads.get(s.id) })), fingerprint: assignmentFingerprint(records) }
}
