import { useEffect, useRef, useState } from 'react'
import { SUPER_RATINGS, SUPER_SCALE, SUPER_NOTE_KEY, cleanSuper, superProposals, isSuperNote } from './superscout'
import { matchIdentity } from './provenance'

// One alliance sheet for a super scout: no counts, a 1 to 5 rating per robot
// for what numbers miss, and failure notes. Saves one note per robot rated.
export default function SuperScoutForm({ assignment, records, uid, nameFor, onSaveBatch, onClose }) {
  const teams = assignment.payload?.teams?.length ? assignment.payload.teams : [assignment.team_number]
  const mine = records.filter(r => isSuperNote(r) && r.member_id === uid && matchIdentity(r) === matchIdentity(assignment))
  const [notes, setNotes] = useState(() => Object.fromEntries(teams.map(t => [t, { ...(mine.find(r => r.team_number === t)?.payload?.super ?? {}) }])))
  const [general, setGeneral] = useState(mine[0]?.payload?.notes ?? '')
  const [saving, setSaving] = useState(false), [error, setError] = useState('')
  const dialog = useRef(null)
  useEffect(() => { const d = dialog.current; if (d && !d.open) d.showModal?.(); return () => { if (d?.open) d.close?.() } }, [])
  const set = (team, key, value) => setNotes(old => ({ ...old, [team]: { ...old[team], [key]: value } }))
  async function submit(e) {
    e.preventDefault()
    if (saving) return
    const proposals = superProposals({ match: assignment.match_key, notes, general, existing: mine })
    if (!proposals.length) { setError('Rate at least one robot or write a failure note.'); return }
    setSaving(true); setError('')
    try { await onSaveBatch(proposals); onClose() } catch (err) { setError(err.message || 'Could not save. Your sheet is still here.') } finally { setSaving(false) }
  }
  return <dialog ref={dialog} className="sc-dialog" onCancel={e => { e.preventDefault(); if (!saving) onClose() }} aria-labelledby="sc-super-title">
    <form onSubmit={submit}>
      <div className="sc-dialog-head"><div><span className="sc-eyebrow">Super scout · {assignment.match_key} · {assignment.payload?.alliance ?? ''} alliance</span><h2 id="sc-super-title">Rate the alliance</h2></div><button type="button" onClick={onClose} disabled={saving} aria-label="Close super scout sheet">Close</button></div>
      <div className="sc-dialog-body sc-stack">
        <p className="sc-help">No counting. 1 is poor, 3 is average, 5 is elite. Leave a rating blank if you did not see it; blank is never a 1. Tap a selected number again to clear it.</p>
        {teams.map(team => <fieldset key={team} className="sc-super-team"><legend><strong>{team}</strong> {nameFor(team)}</legend>
          {SUPER_RATINGS.map(r => <div key={r.key} className="sc-super-row"><span>{r.label}<small className="sc-help"> {r.hint}</small></span>
            <div className="sc-choice-options" role="group" aria-label={`${r.label} for ${team}`}>{SUPER_SCALE.map(([v, word]) => <button key={v} type="button" title={word} aria-label={`${r.label} ${v}, ${word}`} aria-pressed={notes[team]?.[r.key] === v} onClick={() => set(team, r.key, notes[team]?.[r.key] === v ? undefined : v)}>{v}</button>)}</div></div>)}
          <label>Failures seen<textarea rows={2} maxLength={1000} value={notes[team]?.[SUPER_NOTE_KEY] ?? ''} placeholder="Died, tipped, dropped FUEL, missed climb…" onChange={e => set(team, SUPER_NOTE_KEY, e.target.value)} /></label>
          <p className="sc-help">{Object.keys(cleanSuper(notes[team])).length ? 'Will save' : 'Not rated yet'}</p>
        </fieldset>)}
        <label>Alliance notes (optional)<textarea rows={2} maxLength={4000} value={general} placeholder="Strategy, who carried, who played defense…" onChange={e => setGeneral(e.target.value)} /></label>
        {error && <p role="alert" className="sc-error">{error}</p>}
      </div>
      <div className="sc-dialog-foot"><span className="sc-help">Saved on this device first, then synced.</span><button className="sc-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save super scout sheet'}</button></div>
    </form>
  </dialog>
}
