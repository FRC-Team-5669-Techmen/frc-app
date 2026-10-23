import { footageLabel, hasUnverifiedVideoScope } from './provenance'
import { CAPABILITIES, reliability } from './model'
import MatchSummary from './MatchSummary'
import { teamMatchSummary } from './match'
const answer = value => ({yes:'Yes',no:'No',unknown:'Unknown'})[value] ?? 'Not recorded'
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'}) : 'Time unknown'
export default function ComparisonEvidence({ teams, records, nameFor }) {
  return <div className="sc-comparison-evidence" aria-label="Evidence for compared teams">
    {teams.map(team => {
      const imported = records.find(r=>r.kind==='team'&&r.team_number===team)
      const pit = records.find(r=>r.kind==='pit'&&r.team_number===team)
      const observations = records.filter(r=>r.kind==='observation'&&r.team_number===team).sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))
      const unverified = observations.filter(hasUnverifiedVideoScope).length
      return <article key={team} className="sc-card"><h4>{team} {nameFor(team)}</h4>
        {imported?.payload.epa != null ? <p>EPA estimate: <strong>{imported.payload.epa}</strong><span className="sc-help"> · Statbotics · {date(imported.payload.epa_fetched_at)}</span></p> : <p className="sc-help">EPA unknown. Missing estimates are not zero.</p>}
        {unverified > 0 && <p className="sc-help">{unverified} videos excluded from rates: event scope unverified.</p>}
        <MatchSummary s={teamMatchSummary(records,team)} compact />
        <dl>{CAPABILITIES.map(c=>{const r=reliability(records,team,c.key);return <div key={c.key}><dt>{c.label}</dt><dd><span className="sc-help">Pit claim: {answer(pit?.payload.capabilities?.[c.key])}</span><br/>{r.percent===null?'No observed rate':`${Math.round(r.percent)}% · ${r.yes}/${r.denominator} matches`}{!r.sufficient?' · provisional':''}{r.disputed?` · ${r.disputed} disputed`:''}</dd></div>})}</dl>
        <details><summary>Evidence notes ({observations.length})</summary>{pit?.payload.notes && <p><strong>Pit claim:</strong> {pit.payload.notes}</p>}{observations.slice(0,8).map(o=><div key={o.id}><p><strong>{o.match_key}</strong> · {footageLabel(o)} · {date(o.updated_at)}</p><p>{o.payload.notes||'No written note.'}</p>{o.payload.video_url&&<a className="sc-link" href={o.payload.video_url} target="_blank" rel="noreferrer">Review recording</a>}</div>)}{observations.length>8&&<p className="sc-help">Showing eight recent notes. Open the event export for all records.</p>}</details>
      </article>
    })}
  </div>
}
