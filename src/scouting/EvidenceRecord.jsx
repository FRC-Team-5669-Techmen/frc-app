import { CAPABILITIES } from './model'
import { footageLabel } from './provenance'
const when = value => value ? new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) : 'Unknown time'
const words = value => ({ yes: 'Yes', no: 'No', unknown: 'Unknown', did_not_see: 'Did not see', not_applicable: 'Not applicable' })[value] ?? 'Not recorded'
export default function EvidenceRecord({ row, revisions, memberName, canEdit, onEdit }) {
  return <article className="sc-evidence-record"><div className="sc-section-head"><h3>{row.team_number}{row.match_key ? ` · ${row.match_key}` : ' · Pit report'}</h3>{canEdit && <button onClick={onEdit}>Correct observation</button>}</div><p className="sc-help">{memberName(row.member_id)} · {row.localStatus ? 'Saved locally' : `Version ${row.version} · ${when(row.updated_at)}`} · {row.kind === 'observation' ? footageLabel(row) : 'Pit claim'}</p><div className="sc-answer-summary">{CAPABILITIES.map(c => <span key={c.key}><b>{c.label}</b> {words((row.payload.answers ?? row.payload.capabilities)?.[c.key])}</span>)}</div>{row.payload.notes && <p className="sc-note">{row.payload.notes}</p>}{row.payload.video_url && <a className="sc-link" href={row.payload.video_url} target="_blank" rel="noopener noreferrer">Source video ↗</a>}<details><summary>Correction history</summary><RevisionList row={row} revisions={revisions} memberName={memberName} /></details></article>
}
export function RevisionList({ row, revisions, memberName }) {
  const history = revisions.filter(r => r.record_id === row.id).sort((a, b) => b.version - a.version)
  return history.length ? <ol className="sc-history">{history.map(r => <li key={`${r.record_id}:${r.version}`}><p>Version {r.version} · {memberName(r.changed_by ?? r.member_id)} · {when(r.created_at ?? r.changed_at)}</p><pre className="sc-json">{JSON.stringify(r.payload ?? r.snapshot?.payload ?? r.record?.payload ?? r.snapshot ?? {}, null, 2)}</pre></li>)}</ol> : <p className="sc-help">No earlier versions downloaded.</p>
}

