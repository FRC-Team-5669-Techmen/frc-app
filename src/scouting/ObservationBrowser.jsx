import { useMemo, useState } from 'react'
import EvidenceRecord from './EvidenceRecord'
import { CAPABILITIES, currentObservations } from './model'
import { isExternalEvidence, isCurrentEvidence, hasUnverifiedVideoScope, matchIdentity } from './provenance'

export function disputedMatches(records) {
  const keys = new Set()
  for (const team of new Set(records.filter(r => r.kind === 'observation').map(r => r.team_number))) {
    const groups = new Map()
    for (const row of currentObservations(records, team)) {
      const key = `${row.event_id}:${team}:${matchIdentity(row)}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }
    for (const [key, rows] of groups) if (CAPABILITIES.some(c => {
      const answers = new Set(rows.map(r => r.payload?.answers?.[c.key]))
      return answers.has('yes') && answers.has('no')
    })) keys.add(key)
  }
  return keys
}

export default function ObservationBrowser({ records, confirmedRecords, team, onTeam, memberName, nameFor, canEdit, onEdit, revisions }) {
  const [query, setQuery] = useState(''), [scope, setScope] = useState('all'), [page, setPage] = useState(0)
  const disputes = useMemo(() => disputedMatches(confirmedRecords), [confirmedRecords])
  const rows = records.filter(row => (!team || String(row.team_number) === team)
    && `${row.team_number} ${nameFor(row.team_number)} ${row.match_key} ${matchIdentity(row)} ${memberName(row.member_id)} ${row.payload?.notes ?? ''}`.toLowerCase().includes(query.trim().toLowerCase())
    && (scope === 'all' || (scope === 'prior' ? isExternalEvidence(row) : scope === 'current' ? isCurrentEvidence(row) : scope === 'unverified' ? hasUnverifiedVideoScope(row)
      : isCurrentEvidence(row) && disputes.has(`${row.event_id}:${row.team_number}:${matchIdentity(row)}`))))
    .sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')) || a.id.localeCompare(b.id))
  const last = Math.max(0, Math.ceil(rows.length / 30) - 1), current = Math.min(page, last)
  return <details className="sc-card" open={records.length > 0}><summary>Recent observations ({records.length})</summary>
    <p className="sc-help">Search all downloaded observations. Disputes show all responses to the affected match, including unknowns. Ask each author to review their evidence; disagreement is never resolved by a majority vote. Pending corrections do not change confirmed rates.</p>
    <div className="sc-form-grid">
      <label>Evidence team<input inputMode="numeric" value={team} onChange={e => { onTeam(e.target.value); setPage(0) }} placeholder="All teams" /></label>
      <label>Search observations<input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} placeholder="Match, scout, team name or notes" /></label>
      <label>Evidence source<select aria-label="Evidence source" value={scope} onChange={e => { setScope(e.target.value); setPage(0) }}><option value="all">All sources</option><option value="current">Current event</option><option value="prior">Prior-event footage</option><option value="disputed">Disputed current matches</option><option value="unverified">Video scope needs review</option></select></label>
    </div>
    <p role="status">{rows.length ? `Showing ${current * 30 + 1}–${Math.min((current + 1) * 30, rows.length)} of ${rows.length} observations` : 'No observations match these filters.'}</p>
    <div className="sc-actions"><button onClick={() => { onTeam(''); setQuery(''); setScope('all'); setPage(0) }}>Reset observation filters</button><button disabled={!current} onClick={() => setPage(current - 1)}>Previous observations</button><button disabled={current === last} onClick={() => setPage(current + 1)}>Next observations</button></div>
    <div className="sc-stack">{rows.slice(current * 30, (current + 1) * 30).map(row => <EvidenceRecord key={row.id} row={row} memberName={memberName} canEdit={canEdit(row)} onEdit={() => onEdit(row)} revisions={revisions} />)}</div>
  </details>
}
