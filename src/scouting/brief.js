import { hasUnverifiedVideoScope } from './provenance.js'
import { CAPABILITIES, reliability } from './model.js'

export const BRIEF_FIELDS = Object.freeze([
  ['opening', 'Opening and autonomous coordination'], ['roles', 'Robot roles and priorities'],
  ['endgame', 'Endgame coordination'], ['fallback', 'Fallbacks and questions to resolve'],
])
export const emptyBrief = () => ({ match: '', ours: '', opponents: '', opening: '', roles: '', endgame: '', fallback: '' })
export function restoreBrief(value) {
  return Object.fromEntries(Object.keys(emptyBrief()).map(key => [key, typeof value?.[key] === 'string' ? value[key].slice(0, key === 'match' ? 100 : 2000) : '']))
}
export function briefLineup(draft) {
  const parse = value => String(value).trim().split(/[\s,]+/).filter(Boolean).map(x => /^\d+$/.test(x) ? Number(x) : NaN)
  const ours = parse(draft.ours), opponents = parse(draft.opponents), all = [...ours, ...opponents]
  if (!draft.match.trim() || draft.match.length > 100) throw new Error('Enter the match to brief.')
  if (ours.length !== 3 || opponents.length !== 3 || all.some(n => !Number.isInteger(n) || n < 1 || n > 99999) || new Set(all).size !== 6) throw new Error('Enter six different team numbers: three on our alliance and three opponents. Confirm the lineup against the field schedule.')
  return { ours, opponents }
}
export function briefInputs(draft, records, context) {
  const lineup = briefLineup(draft), teams = new Set([...lineup.ours, ...lineup.opponents])
  return { draft: restoreBrief(draft), lineup, context,
    records: records.filter(r => r.event_id === context.eventId && !r.localStatus && teams.has(r.team_number) && ['team', 'pit', 'observation'].includes(r.kind)).slice().sort((a, b) => a.id.localeCompare(b.id)) }
}
export function freezeBrief(inputs, reviewedAt = new Date().toISOString()) {
  const { draft, lineup, context, records } = structuredClone(inputs)
  return { format: 'techmen-match-brief-v1', reviewedAt, context, match: draft.match, lineup,
    policy: 'Proposed Techmen decision support. Manually confirmed lineup and coach plans; no win prediction. Confirmed records only. Unknown and disputed evidence are not failures. Review does not certify robot capability.',
    plan: Object.fromEntries(BRIEF_FIELDS.map(([key]) => [key, draft[key]])),
    teams: [...lineup.ours, ...lineup.opponents].map(team => {
      const rows = records.filter(r => r.team_number === team)
      const latest = kind => rows.filter(r => r.kind === kind).sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')) || b.version - a.version)[0]
      const directory = latest('team'), pit = latest('pit'), epa = directory?.payload?.epa, at = Date.parse(directory?.payload?.epa_fetched_at), now = Date.parse(reviewedAt)
      return { team, name: directory?.payload?.name ?? '',
        unverifiedVideos: rows.filter(r => r.kind === 'observation' && hasUnverifiedVideoScope(r)).length,
        pitClaims: pit?.payload?.capabilities ?? null, pitNotes: pit?.payload?.notes ?? '',
        estimate: typeof epa === 'number' && Number.isFinite(epa) ? { epa, fetchedAt: directory.payload.epa_fetched_at ?? null, stale: !Number.isFinite(at) || at > now || now - at > 86400000 } : null,
        capabilities: CAPABILITIES.map(c => ({ ...c, ...reliability(rows, team, c.key) })),
        observations: rows.filter(r => r.kind === 'observation').map(r => ({ ...r.payload, id: r.id, version: r.version, member: r.member_id, match: r.match_key })),
      }
    }), records }
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
export function printableBrief(brief) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Techmen match brief ${escape(brief.match)}</title><style>body{font:16px system-ui;max-width:960px;margin:24px auto;padding:0 16px;color:#111}article{border:1px solid #555;padding:12px;margin:12px 0;break-inside:avoid}p{white-space:pre-wrap}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:8px;border-bottom:1px solid #aaa}small{display:block}@media print{body{margin:0;font-size:11pt}}</style><h1>Team 5669 · ${escape(brief.match)}</h1><p>${escape(brief.context.eventTitle)} · Reviewed ${escape(brief.reviewedAt)} by ${escape(brief.context.reviewer)}</p><p>Our alliance: ${brief.lineup.ours.join(', ')}<br>Opponents: ${brief.lineup.opponents.join(', ')}</p><p>Evidence cache: ${escape(brief.context.cachedAt || 'Age unknown')} · Pending event saves excluded: ${escape(brief.context.pending)}</p><p>${escape(brief.policy)}</p>${BRIEF_FIELDS.map(([key, label]) => `<h2>${label}</h2><p>${escape(brief.plan[key] || 'Not recorded — resolve with the drive team')}</p>`).join('')}${brief.teams.map(t => `<article><h2>${t.team} ${escape(t.name)}</h2><p>${t.unverifiedVideos} videos excluded: event scope unverified.</p><p>Pit notes: ${escape(t.pitNotes || 'Not recorded')}</p><p>EPA estimate: ${t.estimate ? `${escape(t.estimate.epa)} (${t.estimate.stale ? 'STALE / age unknown' : 'retrieved within 24 hours'}; ${escape(t.estimate.fetchedAt)})` : 'Unavailable'} — not an official robot score</p><table><tr><th>Capability</th><th>Pit claim</th><th>Confirmed current matches</th></tr>${t.capabilities.map(c => `<tr><td>${escape(c.label)}</td><td>${escape(t.pitClaims?.[c.key] || 'Unknown')}</td><td>${c.denominator ? `${c.yes}/${c.denominator} yes (${Math.round(c.percent)}%)` : 'No decisive evidence'}; ${c.disputed} disputed; ${c.didNotSee} did not see; ${c.notApplicable} not applicable; ${c.missing} unanswered${c.sufficient ? '' : '; fewer than 3 decisive matches'}</td></tr>`).join('')}</table><small>Full attributed observations and record versions accompany the JSON brief. Prior-event footage is excluded from current rates.</small></article>`).join('')}<p>This frozen copy does not update. Recheck lineup and uncertainties before the match. Print using your browser’s Print command.</p></html>`
}
export function downloadBriefHTML(brief) {
  const url = URL.createObjectURL(new Blob([printableBrief(brief)], { type: 'text/html;charset=utf-8' }))
  const a = document.createElement('a'); a.href = url; a.download = 'techmen-match-brief.html'; document.body.append(a)
  try { a.click() } finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
