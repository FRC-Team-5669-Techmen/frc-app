import { useState, useRef, useEffect } from 'react'
import { noteProblem, NOTE_MAX } from './signout'
import { startDictation, appendSpoken } from './dictation'
import './SignoutForm.css'

// The sign-out note (handbook Section 7): what you did, typed or spoken, and the
// cleanup confirmation. Shared by both tag routes and the dashboard, so it
// stays small and imports nothing heavy.
//
// Speaking uses the browser's own speech recognition: the words are typed into
// the box and no audio is kept by the app. Where the browser has none, the mic
// button is not shown.

function speechCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export default function SignoutForm({
  onSubmit, busy = false, error = null, returnedReason = null,
  submitLabel = 'Ask to sign out', hint = 'Your hours stop when a mentor approves.',
  requireCleanup = true, onCancel = null, compact = false,
}) {
  const [note, setNote] = useState('')
  const [cleanup, setCleanup] = useState(false)
  const [problem, setProblem] = useState(null)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [micError, setMicError] = useState(null)
  const rec = useRef(null)
  const Speech = speechCtor()

  useEffect(() => () => rec.current?.stop(), [])

  // One session per tap (src/dictation.js): each new piece of words is added
  // once, words still being heard show under the box, and a refusal says why.
  function toggleMic() {
    if (!Speech) return
    if (listening) { rec.current?.stop(); return }
    setMicError(null)
    rec.current = startDictation(Speech, {
      onCommit: (words) => setNote((n) => appendSpoken(n, words, NOTE_MAX)),
      onInterim: setHeard,
      onState: ({ listening: on, error: err }) => { setListening(on); if (!on) setMicError(err) },
    })
  }

  function submit(e) {
    e.preventDefault()
    const p = noteProblem(note) || (requireCleanup && !cleanup ? 'Clean your area first, then tick the box.' : null)
    setProblem(p)
    if (p || busy) return
    onSubmit({ note: note.trim(), cleanup })
  }

  return (
    <form className={`so-form${compact ? ' so-compact' : ''}`} onSubmit={submit} noValidate>
      {returnedReason !== null && (
        <div className="so-returned" role="alert" data-testid="so-returned">
          <b>Sent back by a mentor.</b>{' '}
          {returnedReason ? <>Their note: <q>{returnedReason}</q></> : 'They asked you to finish up first.'}
          <span className="so-returned-next">Do what it says, then send a new note below. Your hours are still counting.</span>
        </div>
      )}
      <label className="so-label" htmlFor="so-note">What did you work on?</label>
      <div className="so-note-row">
        <textarea
          id="so-note" className="so-note" rows={compact ? 2 : 3} maxLength={NOTE_MAX}
          value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Wired the intake motor, tested it with Jordan"
        />
        {Speech && (
          <button type="button" className={`so-mic${listening ? ' so-mic-on' : ''}`} onClick={toggleMic}
            aria-pressed={listening} aria-label={listening ? 'Stop speaking' : 'Speak your note'}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 17v5" />
            </svg>
          </button>
        )}
      </div>
      {listening && <p className="so-listening" role="status">Listening. Speak, then pause.{heard ? <span className="so-heard"> {heard}</span> : null}</p>}
      {!listening && micError && <p className="so-mic-error" role="status" data-testid="so-mic-error">{micError}</p>}
      {requireCleanup && (
        <label className="so-check">
          <input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} />
          <span>My area is clean and my tools are put away.</span>
        </label>
      )}
      {(problem || error) && <p className="so-problem" role="alert">{problem || error}</p>}
      <button type="submit" className="so-submit" disabled={busy}>{busy ? 'Sending…' : submitLabel}</button>
      {hint && <p className="so-hint">{hint}</p>}
      {onCancel && <button type="button" className="so-cancel" onClick={onCancel}>Cancel</button>}
    </form>
  )
}
