import { useEffect, useRef, useState } from 'react'
import { assignmentFingerprint, parseSchedule, planAssignments, scheduleText, validateSchedule } from './schedule'

const initial = { text: '', matches: [], scouts: [], unavailable: {}, targets: '', start: '0', end: '', mode: 'live', source: 'manual', fetchedAt: null }
export default function SchedulePlanner({ store, uid, eventId, members, records, imported, onSaveBatch }) {
  const [config, setConfig] = useState(initial)
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(null), [error, setError] = useState(''), [status, setStatus] = useState('Loading saved schedule…')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const writes = useRef(Promise.resolve()), alive = useRef(true), sequence = useRef(0)
  useEffect(() => {
    alive.current = true
    store.getDraft(uid, eventId, 'assignment-planner-v1').then(saved => {
      if (!alive.current) return
      if (saved) setConfig({ ...initial, ...saved })
      setReady(true); setStatus(saved ? 'Schedule restored on this device.' : 'Paste a schedule or use an imported preview.')
    }).catch(e => { if (alive.current) { setError(`Your planner draft could not be read. Retry before editing. ${e.message || ''}`); setStatus('Planner draft could not be loaded.'); setReady(false) } })
    return () => { alive.current = false }
  }, [store, uid, eventId, loadAttempt])
  function change(next) {
    setConfig(next); setPreview(null); setStatus('Saving planner draft…')
    const request = ++sequence.current
    writes.current = writes.current.catch(() => {}).then(() => store.saveDraft(uid, eventId, 'assignment-planner-v1', next)).then(() => {
      if (alive.current && request === sequence.current) { setStatus('Planner draft saved on this device.'); setError('') }
    }).catch(e => { if (alive.current && request === sequence.current) { setStatus('Planner draft is not saved.'); setError(e.message) } })
  }
  function prepare() {
    setError(''); setPreview(null)
    try {
      const matches = config.matches.length ? validateSchedule(config.matches) : parseSchedule(config.text)
      const scoutRows = config.scouts.filter(id => members.some(m => m.id === id)).map(id => ({ id, unavailable: (config.unavailable[id] || '').split(/[\s,;]+/).filter(Boolean) }))
      if (config.targets.trim() && config.targets.split(/[\s,;]+/).filter(Boolean).some(t => !/^\d+$/.test(t) || Number(t) < 1 || Number(t) > 99999)) throw new Error('Use team numbers separated by commas for target teams.')
      const result = planAssignments({ matches, scouts: scoutRows, records, start: Number(config.start), end: config.end === '' ? undefined : Number(config.end), mode: config.mode, teams: config.targets.split(/[\s,;]+/).filter(Boolean).map(Number) })
      setPreview(result)
    } catch (e) { setError(e.message) }
  }
  async function apply() {
    if (busy || !preview) return
    if (preview.fingerprint !== assignmentFingerprint(records)) { setError('Assignments or observations changed. Preview again before saving.'); return }
    setBusy(true); setError('')
    try {
      await onSaveBatch(preview.proposals)
      if (alive.current) { setStatus(`${preview.proposals.length} assignments saved locally. Each server result appears in Sync status.`); setPreview(null) }
    } catch (e) { if (alive.current) setError(e.message || 'The plan could not be saved.') }
    finally { if (alive.current) setBusy(false) }
  }
  const name = id => { const m = members.find(row => row.id === id); return m?.nickname || m?.full_name || 'Unavailable member' }
  let matches = []
  try { matches = config.matches.length ? validateSchedule(config.matches) : parseSchedule(config.text) } catch { /* validation shown by preview action */ }
  const stale = preview && preview.fingerprint !== assignmentFingerprint(records)
  return <section className="sc-stack sc-planner" aria-label="Assignment planner">
    <div><h3>Plan a scouting shift</h3><p className="sc-help">Choose scouts and match coverage, then review the rotation. Existing assignments and observations are kept. A scout gets at most one new robot per match; lighter workloads go first. This is the Techmen planning rule.</p></div>
    <fieldset disabled={!ready || busy} className="sc-planner-fields">
      {imported?.matches?.length > 0 && <button type="button" onClick={() => change({ ...config, matches: imported.matches, text: scheduleText(imported.matches), start: '0', end: '', source: `TBA ${imported.event_key}`, fetchedAt: imported.fetched_at })}>Use imported schedule ({imported.matches.length} matches)</button>}
      <label>Match schedule<textarea aria-label="Match schedule" rows={5} maxLength={150000} value={config.text} placeholder={'qm1, 5669, 4414, 254, 1678, 3476, 330\nqm2, 987, 973, 696, 3309, 589, 114'} onChange={e => change({ ...config, text: e.target.value, matches: [], source: 'manual', fetchedAt: null, start: '0', end: '' })} /></label>
      <p className="sc-help">One match per line: match label, then up to six team numbers. Use the same full match keys as existing observations. Editing this text makes it a manual schedule and clears imported video links.</p>
      <p className="sc-help">Source: {config.source}{config.fetchedAt ? ` · retrieved ${new Date(config.fetchedAt).toLocaleString()}` : ''}. The schedule draft stays on this account and device; saved assignments sync to scouts.</p>
      <div className="sc-fields"><label>First match<select aria-label="First match" value={config.start} onChange={e => change({ ...config, start: e.target.value })}>{matches.map((m, i) => <option key={m.key} value={i}>{m.key}</option>)}</select></label><label>Last match<select aria-label="Last match" value={config.end} onChange={e => change({ ...config, end: e.target.value })}><option value="">Through last match</option>{matches.map((m, i) => <option key={m.key} value={i}>{m.key}</option>)}</select></label></div>
      <div className="sc-fields"><label>Coverage<select aria-label="Coverage" value={config.mode} onChange={e => change({ ...config, mode: e.target.value })}><option value="live">Live matches</option><option value="video">Footage review</option></select></label><label>Target teams (optional)<input value={config.targets} maxLength={4000} placeholder="Blank means all scheduled teams" onChange={e => change({ ...config, targets: e.target.value })} /></label></div>
      <fieldset className="sc-choice"><legend>Available scouts</legend><div className="sc-choice-options">{members.map(m => <button key={m.id} type="button" aria-pressed={config.scouts.includes(m.id)} onClick={() => change({ ...config, scouts: config.scouts.includes(m.id) ? config.scouts.filter(id => id !== m.id) : [...config.scouts, m.id] })}>{name(m.id)}</button>)}</div>{!members.length && <p>No eligible scouts are loaded. Refresh the event online.</p>}</fieldset>
      {config.scouts.filter(id => members.some(m => m.id === id)).map(id => <label key={id}>Unavailable matches for {name(id)}<input value={config.unavailable[id] || ''} maxLength={4000} placeholder="For example: qm3, qm4" onChange={e => change({ ...config, unavailable: { ...config.unavailable, [id]: e.target.value } })} /></label>)}
      <button type="button" onClick={prepare}>Preview assignment plan</button>
    </fieldset>
    {error && <p role="alert" className="sc-error">{error}</p>}<p role="status" className="sc-help">{status}</p>
    {!ready && error && <button onClick={() => { setError(''); setStatus('Loading saved schedule…'); setLoadAttempt(value => value + 1) }}>Retry loading planner draft</button>}
    {preview && <div className="sc-preview sc-stack"><h4>Review before assigning</h4><p>{preview.proposals.length} new assignments · {preview.existing.length} already covered · {preview.gaps.length} uncovered</p>
      <p className="sc-help">Workload in this range: {preview.loads.map(s => `${name(s.id)} ${s.count}`).join(' · ')}</p>
      {preview.conflicts.length > 0 && <p role="alert">Existing assignments double-book {preview.conflicts.length} scout/match slots. Review those assignments before the shift.</p>}
      {preview.gaps.length > 0 && <details open><summary>Uncovered robots</summary><ul>{preview.gaps.map(g => <li key={`${g.match}:${g.team}`}>{g.match} · Team {g.team}: {g.reason}</li>)}</ul></details>}
      <details open={preview.proposals.length <= 12}><summary>Proposed assignments ({preview.proposals.length})</summary><ol>{preview.proposals.map(p => <li key={`${p.match_key}:${p.team_number}`}>{p.match_key} · <strong>{p.team_number}</strong> → {name(p.payload.assignee)}{p.payload.video_url ? ' · video' : ''}</li>)}</ol></details>
      <p className="sc-help">Saving creates in-app assignment notices after sync. It does not send Discord messages. Two leads planning simultaneously must refresh and coordinate; this preview is not a server reservation.</p>
      {stale && <p role="status">Event evidence changed. Generate a fresh preview.</p>}
      <div className="sc-actions"><button disabled={busy} onClick={() => setPreview(null)}>Cancel assignment plan</button><button className="sc-primary" disabled={busy || stale || !preview.proposals.length} onClick={apply}>{busy ? 'Saving assignments…' : `Save ${preview.proposals.length} assignments`}</button></div>
    </div>}
  </section>
}
