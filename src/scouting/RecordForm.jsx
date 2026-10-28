import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CAPABILITIES } from './model'
import { prepareFootageRecord, canonicalMatchKey, isBarePracticeKey, matchLabel } from './provenance'
import MatchFields, { OptionFields } from './MatchFields'
import SuggestOption from './SuggestOption'
import { cleanMatch, recordedCount } from './match'
import { activeOptions, cleanCustom } from './options'

const TITLES = { observation: 'Match observation', pit: 'Pit report', assignment: 'Assign a scout', message: 'Pit message', team: 'Event team' }
const ACTIONS = { observation: 'Save observation', pit: 'Save pit report', assignment: 'Save assignment', message: 'Save message', team: 'Save team' }

function initialValue(kind, record, team, assignment, replyTo) {
  const base = { id: record?.id ?? crypto.randomUUID(), version: record?.version ?? 0, team_number: String(record?.team_number ?? team ?? ''), match_key: record?.match_key ?? assignment?.match_key ?? '', payload: record?.payload ?? {} }
  const defaults = {
    observation: { answers: {}, notes: '', source: assignment?.payload?.video_url ? 'video' : 'live', request_delivery: false, video_url: assignment?.payload?.video_url ?? '', ...(assignment ? { assignment_id: assignment.id, source_scope: assignment.payload?.source_scope || 'current', ...(assignment.payload?.source_event ? { source_event: assignment.payload.source_event } : {}) } : {}) },
    pit: { capabilities: {}, notes: '', pit_location: '' },
    message: { text: '', status: 'open', request_delivery: false, ...(replyTo ? { reply_to: replyTo.id } : {}) },
    assignment: { assignee: '', status: 'assigned', instructions: '', video_url: assignment?.payload?.video_url ?? '' },
    team: { name: '', pit_location: '', source: 'manual' },
  }
  return { ...base, payload: { ...defaults[kind], ...base.payload, ...(record && ['observation', 'message'].includes(kind) ? { request_delivery: false } : {}) } }
}

// What the typed match label saves as, before the scout taps Save. Practice
// matches (pm1, pm2, ...) are as many as the event runs, each its own record.
function MatchKeyHint({ value, linked, external }) {
  const typed = String(value ?? '').trim()
  if (linked) return <p className="sc-help" data-match-hint>Match from your assignment.</p>
  if (!typed) return <p className="sc-help" data-match-hint>Qualification: 12 or qm12. Practice: pm3 or P3.</p>
  if (external) return <p className="sc-help" data-match-hint>Saves as {typed}.</p>
  if (isBarePracticeKey(typed)) return <p className="sc-help" data-match-hint>Add the practice match number, such as pm3.</p>
  const key = canonicalMatchKey(typed), label = matchLabel(key)
  return <p className="sc-help" data-match-hint>Saves as <strong>{label}</strong>{label !== key ? ` (${key})` : ''}.</p>
}

export function Choice({ label, value, options, onChange }) {
  return <fieldset className="sc-choice"><legend>{label}</legend><div className="sc-choice-options">
    {options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(value === v ? undefined : v)}>{text}</button>)}
  </div></fieldset>
}

// Native dialog provides modal containment and Escape handling. React removal
// needs explicit focus return; removing an open dialog skips native close().
// Persist the form before claiming a draft is safe on this device.
export default function RecordForm({ kind, record, team, assignment, replyTo, members, store, uid, eventId, onSave, onClose, matchFields = false, options = null, onSuggest = null, ownObservation = null }) {
  const dialog = useRef(null)
  const [value, setValue] = useState(() => initialValue(kind, record, team, assignment, replyTo))
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [draftStatus, setDraftStatus] = useState('Opening draft…')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const draftKey = `form:${kind}:${record?.id ?? replyTo?.id ?? assignment?.id ?? team ?? 'new'}`
  const mounted = useRef(true)
  const writeSequence = useRef(Promise.resolve())
  const draftSequence = useRef(0)
  const submitting = useRef(false)
  useLayoutEffect(() => {
    const node = dialog.current, opener = document.activeElement, surface = node?.closest('.sc-wrap')
    node?.showModal()
    return () => {
      node?.close()
      if (opener?.isConnected && !opener.matches(':disabled')) opener.focus()
      else if (surface?.isConnected) surface.querySelector('button:not(:disabled)')?.focus()
    }
  }, [])
  useEffect(() => {
    mounted.current = true
    store.getDraft(uid, eventId, draftKey).then(saved => {
      if (!mounted.current) return
      if (saved) setValue(saved)
      setReady(true); setDraftStatus(saved ? 'Draft restored on this device' : 'Draft saves on this device')
    }).catch(e => { if (mounted.current) { setReady(false); setDraftStatus('Draft could not be loaded'); setError(`Your existing draft could not be read. Retry before editing. ${e.message || ''}`) } })
    return () => { mounted.current = false }
  }, [store, uid, eventId, draftKey, loadAttempt])

  function change(next) {
    if (submitting.current) return
    setValue(next); setDraftStatus('Saving draft…')
    const request = ++draftSequence.current
    // Serialize writes so rapid taps cannot persist an older draft last.
    writeSequence.current = writeSequence.current.catch(() => {}).then(() => store.saveDraft(uid, eventId, draftKey, next)).then(() => {
      if (mounted.current && request === draftSequence.current) { setDraftStatus('Draft saved on this device'); setError('') }
    }).catch(e => { if (mounted.current && request === draftSequence.current) { setError(e.message || 'Could not save the draft.'); setDraftStatus('Draft is not saved') } })
  }
  function payload(key, val) { change({ ...value, payload: { ...value.payload, [key]: val } }) }
  function answer(group, key, val) {
    const map = { ...value.payload[group] }
    if (val === undefined) delete map[key]; else map[key] = val
    payload(group, map)
  }
  async function submit(e) {
    e.preventDefault()
    if (submitting.current || !ready) return
    submitting.current = true; setError(''); setSaving(true)
    try {
      await writeSequence.current
      // Match fields (0027) travel only when recorded, and only once the server
      // accepts them; a field left out is not recorded, never 0.
      let payload = value.payload
      if (kind === 'observation') {
        const { match, custom, ...rest } = payload
        const clean = matchFields ? cleanMatch(match) : {}
        payload = Object.keys(clean).length ? { ...rest, match: clean } : rest
        // Observation options (0037) travel only when answered, and only while
        // the server has them; a skipped option is absent, never zero.
        const answered = options ? cleanCustom(custom, options) : {}
        if (Object.keys(answered).length && payload.role !== 'super') payload = { ...payload, custom: answered }
      }
      let row = { id: value.id, version: value.version, kind, team_number: Number(value.team_number), match_key: ['observation', 'assignment'].includes(kind) ? value.match_key.trim() : null, payload }
      if (!Number.isInteger(row.team_number) || row.team_number < 1 || row.team_number > 99999) throw new Error('Enter a team number from 1 to 99999.')
      if (row.match_key === '') throw new Error('Enter the match label, such as qm1.')
      if (row.match_key && isBarePracticeKey(row.match_key)) throw new Error('Add the practice match number, such as pm3. Each practice match is saved as its own record.')
      // One spelling per match: "Q12" and "12" save as "qm12", "P3" and "Practice 3" as "pm3",
      // so two scouts typing differently never split one match (provenance.js matchIdentity).
      // An observation linked to an assignment keeps the assignment's key exactly:
      // the server (0022 validate) requires the two to be equal.
      if (row.match_key && row.payload?.source_scope !== 'external' && !(kind === 'observation' && row.payload?.assignment_id)) row = { ...row, match_key: canonicalMatchKey(row.match_key) }
      // The server keeps one observation per scout per team per match. Say so
      // here, before the form closes, instead of a conflict after sync.
      const earlier = kind === 'observation' && !record && ownObservation?.(row)
      if (earlier) throw new Error(`You already saved team ${row.team_number} in ${matchLabel(earlier.match_key)}. Check the match number, or correct the earlier observation from Recent observations.`)
      if (kind === 'observation' && !Object.keys(value.payload.answers).length && !value.payload.notes.trim() && !(matchFields && recordedCount(value.payload.match)) && !Object.keys(options ? cleanCustom(value.payload.custom, options) : {}).length) throw new Error('Record an answer or a note before saving.')
      if (kind === 'observation' && value.payload.source === 'video' && !value.payload.video_url) throw new Error('Add the video link so someone can review this observation.')
      if (value.payload.video_url && !/^https:\/\//i.test(value.payload.video_url)) throw new Error('Use an HTTPS video link.')
      if (kind === 'message' && !value.payload.text.trim()) throw new Error('Write a short note about the robot.')
      if (kind === 'assignment' && !value.payload.assignee) throw new Error('Choose a scout.')
      if (['observation', 'assignment'].includes(kind)) row = prepareFootageRecord(row)
      await onSave(row)
      // A confirmed local save stays saved even if draft cleanup fails. The
      // draft carries the same record id, so reopening cannot create a duplicate.
      await store.deleteDraft(uid, eventId, draftKey).catch(() => {})
      onClose()
    } catch (e) { if (mounted.current) setError(e.message || 'Could not save. Your draft is still here.') }
    finally { submitting.current = false; if (mounted.current) setSaving(false) }
  }
  const p = value.payload
  return <dialog ref={dialog} className="sc-dialog" onCancel={e => { e.preventDefault(); if (!saving) onClose() }} aria-labelledby="sc-form-title">
    <form onSubmit={submit}>
      <div className="sc-dialog-head"><div><span className="sc-eyebrow">{record ? `Correct version ${record.version}` : 'Capture evidence'}</span><h2 id="sc-form-title">{TITLES[kind]}</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close form">Close</button></div>
      <div className="sc-dialog-body">
        {record && <p className="sc-help">Your correction creates a new version. Earlier versions stay in the history.</p>}
        {!ready ? <p>{error ? 'Draft editing is paused until your saved work can be loaded.' : 'Restoring draft…'}</p> : <fieldset disabled={saving} className="sc-form-fields"><legend className="sc-sr-only">{TITLES[kind]} fields</legend>
          <div className="sc-fields"><label>Team number<input inputMode="numeric" type="number" min="1" max="99999" required readOnly={!!record || !!replyTo} value={value.team_number} onChange={e => change({ ...value, team_number: e.target.value })} /></label>
          {['observation', 'assignment'].includes(kind) && <label>Match<input required readOnly={!!record || (kind === 'observation' && !!p.assignment_id)} maxLength="100" placeholder="qm1" value={value.match_key} onChange={e => change({ ...value, match_key: e.target.value })} /></label>}</div>
          {['observation', 'assignment'].includes(kind) && !record && <MatchKeyHint value={value.match_key} linked={kind === 'observation' && !!p.assignment_id} external={p.source_scope === 'external'} />}
          {kind === 'observation' && <>
            <label>Source<select aria-label="Source" value={p.source} onChange={e => payload('source', e.target.value)}><option value="live">Live match</option><option value="video">Match video</option></select></label>
            {p.source === 'video' && <label>Video URL<input type="url" placeholder="https://…" value={p.video_url} onChange={e => payload('video_url', e.target.value)} /></label>}
            {matchFields ? <MatchFields value={p.match ?? {}} onChange={m => payload('match', m)} />
              : <p className="sc-help sc-not-setup">FUEL counts, TOWER and reliability fields start when migration 0027 is pasted. The capability questions below still work.</p>}
            {options && activeOptions(options).length > 0 && <OptionFields options={activeOptions(options)} value={p.custom ?? {}} onChange={c => payload('custom', c)} />}
            <section className="sc-phase" aria-label="Capabilities"><h3 className="sc-phase-title">Capabilities</h3>
            <p className="sc-help">Yes means you saw it work. No means you saw it fail. If the view was blocked, choose Did not see. Leave an answer blank if you have not checked it.</p>
            {CAPABILITIES.map(c => <Choice key={c.key} label={c.label} value={p.answers[c.key]} options={[["yes", "Yes"], ["no", "No"], ["did_not_see", "Did not see"], ["not_applicable", "Not applicable"]]} onChange={v => answer('answers', c.key, v)} />)}
            </section>
            <label>Notes<textarea aria-label="Notes" maxLength="4000" placeholder="What happened? Which part of the match?" value={p.notes} onChange={e => payload('notes', e.target.value)} /></label>
            {onSuggest && <SuggestOption team={Number(value.team_number) || null} match={value.match_key} recordId={record?.id ?? null} note={p.notes} onSuggest={onSuggest} />}
            <label className="sc-checkbox"><input type="checkbox" checked={p.request_delivery === true} onChange={e => payload('request_delivery', e.target.checked)} /><span>Request Discord delivery after sync</span></label>
          </>}
          {((kind === 'observation' && p.source === 'video') || (kind === 'assignment' && p.video_url)) && <>
            <label>Footage event<select aria-label="Footage event" value={p.source_scope || 'current'} onChange={e => payload('source_scope', e.target.value)}><option value="current">This event</option><option value="external">A different event</option></select></label>
            {p.source_scope === 'external' && <><label>Source event key<input required maxLength="44" placeholder="2026cabb" value={p.source_event || ''} onChange={e => payload('source_event', e.target.value)} /></label><p className="sc-help">Use the full source match key above, such as 2026cabb_qm1. This footage stays visible as prior-event context and is excluded from this event's reliability percentages.</p></>}
          </>}
          {kind === 'pit' && <>
            <p className="sc-help">Record what the team claims. Match observations verify these claims separately.</p>
            {CAPABILITIES.map(c => <Choice key={c.key} label={c.label} value={p.capabilities[c.key]} options={[["yes", "Yes"], ["no", "No"], ["unknown", "Unknown"]]} onChange={v => answer('capabilities', c.key, v)} />)}
            <label>Pit location<input maxLength="200" placeholder="Row or booth, if known" value={p.pit_location} onChange={e => payload('pit_location', e.target.value)} /></label>
            <label>Notes<textarea aria-label="Notes" maxLength="4000" value={p.notes} onChange={e => payload('notes', e.target.value)} /></label>
          </>}
          {kind === 'message' && <>
            {replyTo && <blockquote className="sc-help">Replying to: {replyTo.payload.text}</blockquote>}
            <label>Robot note<textarea aria-label="Robot note" required maxLength="2000" placeholder="What should the pit crew ask this team?" value={p.text} onChange={e => payload('text', e.target.value)} /></label>
            <p className="sc-help">Describe robots and match events. Keep names and personal details out of scouting notes.</p>
            <label>Status<select aria-label="Status" value={p.status} onChange={e => payload('status', e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option></select></label>
            <label className="sc-checkbox"><input type="checkbox" checked={p.request_delivery} onChange={e => payload('request_delivery', e.target.checked)} /><span>Request Discord delivery after sync</span></label>
            <p className="sc-help">Saving a message does not mean Discord received it. Delivery status appears separately.</p>
          </>}
          {kind === 'assignment' && <>
            <label>Scout<select aria-label="Scout" required value={p.assignee} onChange={e => payload('assignee', e.target.value)}><option value="">Choose a scout</option>{members.map(m => <option key={m.id} value={m.id}>{m.nickname || m.full_name || 'Member'}</option>)}</select></label>
            <label>Instructions<textarea aria-label="Instructions" maxLength="2000" value={p.instructions} onChange={e => payload('instructions', e.target.value)} /></label>
            <label>Video URL<input type="url" placeholder="https://…" value={p.video_url} onChange={e => payload('video_url', e.target.value)} /></label>
            <label>Status<select aria-label="Status" value={p.status} onChange={e => payload('status', e.target.value)}><option value="assigned">Assigned</option><option value="complete">Complete</option><option value="cancelled">Cancelled</option></select></label>
          </>}
          {kind === 'team' && <>
            <label>Team name<input required maxLength="200" value={p.name} onChange={e => change({ ...value, payload: { ...p, name: e.target.value, source: 'manual', source_url: '', fetched_at: new Date().toISOString() } })} /></label>
            <label>Pit location<input maxLength="200" value={p.pit_location} onChange={e => change({ ...value, payload: { ...p, pit_location: e.target.value, pit_source: 'manual', pit_fetched_at: new Date().toISOString() } })} /></label>
            <p className="sc-help">This is a manual team record. Imported official results and statistical estimates retain their own source labels.</p>
          </>}
        </fieldset>}
        {error && <p role="alert" className="sc-error">{error}</p>}
        {!ready && error && <button type="button" onClick={() => { setError(''); setDraftStatus('Opening draft…'); setLoadAttempt(value => value + 1) }}>Retry loading draft</button>}
      </div>
      <div className="sc-dialog-foot"><span className="sc-help" role="status">{draftStatus}</span><button className="sc-primary" type="submit" disabled={saving || !ready}>{saving ? 'Saving…' : ACTIONS[kind]}</button></div>
    </form>
  </dialog>
}
