import { useState, lazy, Suspense } from 'react'
import { quiz } from './catalog.js'
const AbsencePractice = lazy(() => import('./absencePractice.jsx'))

// Exercises are local. No production write or credential is available here.
export default function Practice({ kind, onDone }) {
  const [choice, setChoice] = useState(null)
  const [note, setNote] = useState('')
  const [clean, setClean] = useState(false)
  const [message, setMessage] = useState('')
  if (kind === 'absence')
    return (
      <Suspense fallback={<p role="status">Opening practice form…</p>}>
        <AbsencePractice onDone={onDone} />
      </Suspense>
    )
  if (kind === 'checkout')
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (note.trim() && clean) {
            setMessage(
              'Practice request sent. Wait for approval before leaving. No attendance was changed.',
            )
            onDone()
          } else setMessage('Write what you did and confirm cleanup first.')
        }}
      >
        <label className="tour-field">
          Practice: what did you do?
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </label>
        <label className="tour-check">
          <input
            type="checkbox"
            checked={clean}
            onChange={(e) => setClean(e.target.checked)}
          />
          I cleaned my work area
        </label>
        <button type="submit">Practice sign-out request</button>
        <p role="status">{message}</p>
      </form>
    )
  const q = quiz[kind]
  if (!q) return null
  return (
    <fieldset className="tour-quiz">
      <legend>{q.question}</legend>
      {q.answers.map((answer, i) => (
        <label className="tour-check" key={answer}>
          <input
            type="radio"
            name={`tour-${kind}`}
            checked={choice === i}
            onChange={() => {
              setChoice(i)
              setMessage('')
            }}
          />
          {answer}
        </label>
      ))}
      <button
        type="button"
        onClick={() => {
          if (choice === q.correct) {
            setMessage('Correct. You can continue.')
            onDone()
          } else setMessage('Try again. Read the guidance above.')
        }}
      >
        Check answer
      </button>
      <p role="status">{message}</p>
    </fieldset>
  )
}
