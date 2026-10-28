import { useState } from 'react'
import { OPTION_TYPES, OPTION_PHASES, choicesFromText, optionProblem } from './options'

// "Saw something no question covers?" A scout asks the scouting lead for an
// observation option (0037). From inside an observation it carries the team,
// the match and the note, so the lead sees the robot that inspired it. It is
// a request only: nothing appears on any form until the lead turns it on.
export default function SuggestOption({ team = null, match = '', recordId = null, note = '', onSuggest, open: startOpen = false }) {
  const [open, setOpen] = useState(startOpen)
  const [label, setLabel] = useState('')
  const [type, setType] = useState('yesno')
  const [phase, setPhase] = useState('teleop')
  const [choices, setChoices] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  if (!open) return <div className="sc-suggest-closed">
    {msg && <p role="status" className="sc-suggest-sent">{msg}</p>}
    <button type="button" className="sc-suggest-open" onClick={() => { setOpen(true); setMsg('') }} data-suggest-open>Saw something no question covers? Suggest one</button>
  </div>
  async function send() {
    const parsed = type === 'choice' ? choicesFromText(choices) : null
    const problem = optionProblem({ label, type, choices: parsed })
    if (problem) { setErr(problem); return }
    setBusy(true); setErr('')
    const context = [team ? `Team ${team}` : null, match ? String(match).trim() : null].filter(Boolean).join(', ')
    const reason = [why.trim(), !why.trim() && note?.trim() ? `From my note: ${note.trim().slice(0, 300)}` : null, context ? `(${context})` : null].filter(Boolean).join(' ')
    try {
      await onSuggest({ p_label: label.trim(), p_type: type, p_choices: parsed, p_phase: phase, p_note: reason.slice(0, 500) || null, p_example_record: recordId, p_example_team: team })
      setMsg(`Sent to your scouting lead: "${label.trim()}". You will see it on the form once it is turned on.`)
      setLabel(''); setChoices(''); setWhy(''); setOpen(false)
    } catch (e) { setErr(e?.message || 'Could not send. Check your connection and try again.') }
    finally { setBusy(false) }
  }
  return <div className="sc-suggest" role="group" aria-label="Suggest an observation" data-suggest>
    <h4>Suggest an observation</h4>
    <p className="sc-help">Name what to watch for. Your scouting lead decides whether every scout gets it.</p>
    <label>What should scouts watch for?<input maxLength="120" value={label} placeholder="Passes FUEL from the neutral zone" onChange={e => setLabel(e.target.value)} /></label>
    <fieldset className="sc-choice"><legend>Answer type</legend><div className="sc-choice-options">
      {OPTION_TYPES.map(t => <button key={t.value} type="button" aria-pressed={type === t.value} title={t.hint} onClick={() => setType(t.value)}>{t.label}</button>)}
    </div><p className="sc-help">{OPTION_TYPES.find(t => t.value === type)?.hint}</p></fieldset>
    {type === 'choice' && <label>Answers, one per line<textarea rows="3" maxLength="500" value={choices} placeholder={'Alliance zone\nNeutral zone\nBoth'} onChange={e => setChoices(e.target.value)} /></label>}
    <label>When in the match<select value={phase} onChange={e => setPhase(e.target.value)}>{OPTION_PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
    <label>Why it matters (optional)<input maxLength="300" value={why} placeholder="Good passers change who we pick" onChange={e => setWhy(e.target.value)} /></label>
    {err && <p className="sc-error" role="alert">{err}</p>}
    <div className="sc-actions"><button type="button" onClick={() => { setOpen(false); setErr('') }} disabled={busy}>Cancel</button><button type="button" className="sc-primary" onClick={send} disabled={busy}>{busy ? 'Sending…' : 'Send to scouting lead'}</button></div>
  </div>
}
