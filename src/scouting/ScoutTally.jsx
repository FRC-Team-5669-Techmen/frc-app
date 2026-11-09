import { scoutTally } from './scoutTally'
import '../Operations.css'
export default function ScoutTally({ records, members, eventId }) {
  const rows = scoutTally(records, members, eventId)
  return <details className="sc-card" data-scout-tally><summary>Matches per scout</summary>
    <p className="sc-help">Confirmed submissions for this event. Each match counts once per scout, including super scouting. Local saves and prior-event footage do not count. Gaps are assigned robot or alliance reports without a confirmed submission; some matches may be upcoming.</p>
    <div className="sc-team-table-wrap" tabIndex={0} role="region" aria-label="Matches per scout"><table className="sc-team-table"><thead><tr><th>Scout</th><th>Matches</th><th>Robot</th><th>Super</th><th>Assignment gaps</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id} data-tally-scout={r.id}><th scope="row">{r.name}</th><td>{r.matches}</td><td>{r.robot}</td><td>{r.super}</td><td>{r.gaps.length ? <details><summary className="ops-gap">{r.gaps.length} missing</summary><ul>{r.gaps.map(g => <li key={g.id}>{g.match} · {g.target}</li>)}</ul></details> : 'No gaps'}{r.matches === 0 && <span> · No submitted matches</span>}</td></tr>)}</tbody></table></div>
  </details>
}
