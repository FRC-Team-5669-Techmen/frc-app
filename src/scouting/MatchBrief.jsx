import { useEffect, useRef, useState } from 'react'
import { BRIEF_FIELDS, emptyBrief, restoreBrief, briefInputs, freezeBrief, downloadBriefHTML } from './brief'
import { downloadArchive } from './backup'

export default function MatchBrief({ store, uid, eventId, eventTitle, records, cachedAt, pending, reviewer }) {
  const [draft, setDraft] = useState(emptyBrief), [ready, setReady] = useState(false), [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('Loading saved brief…'), [error, setError] = useState(''), [saved, setSaved] = useState(''), [review, setReview] = useState(null)
  const writes = useRef(Promise.resolve()), sequence = useRef(0), alive = useRef(true)
  useEffect(() => {
    alive.current = true; let live = true
    setReady(false); setReview(null)
    store.getDraft(uid, eventId, 'match-brief').then(value => {
      if (!live) return
      const next = restoreBrief(value); setDraft(next); setSaved(JSON.stringify(next)); setReady(true); setError(''); setStatus(value ? 'Brief restored on this device' : 'No saved brief yet')
    }).catch(e => { if (live) { setError(`Could not read your brief. Retry before editing. ${e.message}`); setStatus('Brief unavailable') } })
    return () => { live = false; alive.current = false }
  }, [store, uid, eventId, attempt])
  function persist(next) {
    setDraft(next); setStatus('Saving brief…'); setError('')
    const request = ++sequence.current
    writes.current = writes.current.catch(() => {}).then(() => store.saveDraft(uid, eventId, 'match-brief', next)).then(() => {
      if (alive.current && request === sequence.current) { setSaved(JSON.stringify(next)); setStatus('Brief saved on this device') }
    }).catch(e => { if (alive.current && request === sequence.current) { setStatus('Brief is not saved'); setError(`Could not save brief: ${e.message}`) } })
  }
  let inputs, validation = ''
  try { inputs = briefInputs(draft, records, { eventId, eventTitle, memberId: uid, reviewer, cachedAt: cachedAt ?? null, pending }) } catch (e) { validation = e.message }
  const fingerprint = inputs ? JSON.stringify(inputs) : '', durable = saved === JSON.stringify(draft), current = review && review.fingerprint === fingerprint && durable
  function exportCopy(html) {
    try { if (current) { if (html) downloadBriefHTML(review.brief); else downloadArchive(review.brief, 'techmen-match-brief.json'); setError('') } }
    catch (e) { setError(`Export failed. Your saved brief remains on this device. ${e.message}`) }
  }
  return <details className="sc-card sc-match-brief"><summary>Drive-team match brief</summary>
    <p className="sc-help">Confirm all six teams against the field schedule. Record the plan with your alliance partners, then review the evidence before exporting. Plans stay on this device and in your event backup; they are not shared automatically.</p>
    {error && <p role="alert" className="sc-error">{error}</p>}
    {!ready && <button onClick={() => setAttempt(n => n + 1)}>Retry brief load</button>}
    <fieldset disabled={!ready}><legend>Lineup and coach plan</legend><div className="sc-form-grid">
      <label>Brief match<input value={draft.match} maxLength={100} placeholder="qm42" onChange={e => persist({ ...draft, match: e.target.value })} /></label>
      <label>Our alliance teams<input value={draft.ours} maxLength={100} placeholder="5669, 101, 202" onChange={e => persist({ ...draft, ours: e.target.value })} /></label>
      <label>Opponent teams<input value={draft.opponents} maxLength={100} placeholder="303, 404, 505" onChange={e => persist({ ...draft, opponents: e.target.value })} /></label>
      {BRIEF_FIELDS.map(([key, label]) => <label key={key}>{label}<textarea aria-label={label} value={draft[key]} maxLength={2000} onChange={e => persist({ ...draft, [key]: e.target.value })} /></label>)}
    </div></fieldset><p role="status">{status}</p>
    {ready && !durable && status === 'Brief is not saved' && <button onClick={() => persist(draft)}>Retry brief save</button>}
    <p className="sc-help">{validation || `${pending} pending event saves excluded. Evidence cache: ${cachedAt ? new Date(cachedAt).toLocaleString() : 'age unknown'}. Estimates and plans are separate from observed capabilities.`}</p>
    {inputs && <div className="sc-brief-teams">{freezeBrief(inputs).teams.map(t => <article className="sc-evidence-record" key={t.team}>
      <h3>{t.team} {t.name}</h3>
      {t.capabilities.map(c => <div className="sc-brief-capability" key={c.key}><strong>{c.label}</strong><span>{c.denominator ? `${c.yes}/${c.denominator} confirmed matches: yes` : 'No decisive match evidence'}{c.disputed ? ` · ${c.disputed} disputed` : ''}</span><span className="sc-help">Pit claim: {t.pitClaims?.[c.key] ?? 'unknown'}{c.sufficient ? '' : ' · fewer than 3 decisive matches'}</span><span className="sc-help">Excluded responses: {c.didNotSee} did not see · {c.notApplicable} not applicable · {c.missing} unanswered</span></div>)}
      {t.pitNotes && <p className="sc-note">Pit notes: {t.pitNotes}</p>}
      <p className="sc-help">{t.estimate ? `EPA estimate: ${t.estimate.epa} · ${t.estimate.fetchedAt ?? 'date unknown'}${t.estimate.stale ? ' · STALE / age unknown' : ''}` : 'EPA unavailable'}. Not an official robot score.</p>
    </article>)}</div>}
    {review && <p role="status">{current ? `Reviewed copy ready · ${review.brief.reviewedAt}` : 'The plan or evidence changed. Review again before exporting.'}</p>}
    <div className="sc-actions"><button disabled={!ready || !inputs || !durable} onClick={() => setReview({ fingerprint, brief: freezeBrief(inputs) })}>Confirm lineup and review brief</button><button disabled={!current} onClick={() => exportCopy(false)}>Export reviewed brief JSON</button><button disabled={!current} onClick={() => exportCopy(true)}>Export printable brief</button></div>
  </details>
}
