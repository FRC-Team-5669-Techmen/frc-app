import { useMemo, useState } from 'react'
import { eventCoverage, filterCoverage } from './coverage'
export default function CoveragePanel({ records, confirmedRecords, nameFor, onTeam }) {
  const [filter, setFilter] = useState('all')
  const rows = useMemo(() => eventCoverage(records, confirmedRecords), [records, confirmedRecords])
  const shown = filterCoverage(rows, filter)
  if (!rows.length) return null
  return <details className="sc-card sc-coverage"><summary>Event coverage · {rows.filter(r => r.pit).length}/{rows.length} pit reports · {rows.filter(r => !r.thin).length}/{rows.length} with 3+ trials per capability</summary>
    <p className="sc-help">Coverage is not robot strength. Percentages use synchronized evidence from this event. Prior-event footage is context; local observations are still waiting to sync. A recorded match can have unknown answers and supply no capability trial.</p>
    <label>Coverage filter<select aria-label="Coverage filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All teams</option><option value="pit">Missing pit report</option><option value="thin">Needs more capability evidence</option><option value="disputed">Disputed observations</option><option value="prior">Has prior-event footage</option></select></label>
    <p className="sc-help" role="status">{shown.length} teams match this filter.</p>
    <ul className="sc-coverage-list">{shown.map(row => <li key={row.team}><div><strong>{row.team} {nameFor(row.team)}</strong><p className="sc-help">{row.pit ? 'Pit report synced' : 'Pit report missing'} · {row.currentMatches} current-event matches · {row.priorMatches} prior-event matches · {row.localObservations} local observations · {row.outstanding} assignments without synced observations</p><p className="sc-help">{row.trials.map(t => `${t.label}: ${t.denominator} trials${t.disputed ? `, ${t.disputed} disputed` : ''}`).join(' · ')}</p></div><button onClick={() => onTeam(row.team)}>View {row.team}</button></li>)}</ul>
  </details>
}
