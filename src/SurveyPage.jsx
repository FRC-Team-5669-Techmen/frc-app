import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import {
  sortQuestions, optionsOf, scaleOf, scaleTicks,
  isAnswered, isUnconfigured, missingRequired, buildAnswerRows,
  resolveOpenSurvey,
} from './surveys'
import './SurveyPage.css'

// The weekly survey, member side (/survey).
//
// Mobile first, because this is filled out on a phone standing in the shop:
// one question per card, full-width tap targets, no dropdowns anywhere, and no
// step wizard -- the whole thing is one scroll and one button, which is what
// keeps it under ninety seconds.
//
// NOTHING ABOUT THE QUESTIONS IS HARDCODED HERE. Every prompt, option and kind
// comes from survey_questions, because the fifth question rotates weekly and
// changing it must not be a deploy.

function fmtDateTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function Choice({ label, on, onClick, kind }) {
  return (
    <button
      type="button"
      className={`sv-opt${on ? ' sv-opt-on' : ''}`}
      onClick={onClick}
      aria-pressed={on}
    >
      <span className={`sv-mark sv-mark-${kind}`} aria-hidden="true">{on ? '✓' : ''}</span>
      <span className="sv-opt-label">{label}</span>
    </button>
  )
}

function Question({ q, index, value, onChange, flagged }) {
  const unconfigured = isUnconfigured(q)
  // Only 'single' may be required (survey_questions_required_chk); a required
  // flag on any other kind is ignored here rather than honoured, so a bad row
  // can never make the form unsubmittable.
  const required = q.required && q.kind === 'single' && !unconfigured

  return (
    <section className={`sv-q${flagged ? ' sv-q-flagged' : ''}`} data-qid={q.id}>
      <div className="sv-q-head">
        <span className="sv-q-num">{String(index + 1).padStart(2, '0')}</span>
        <h2 className="sv-q-prompt">{q.prompt}</h2>
      </div>
      <p className="sv-q-meta">
        {required
          ? <span className="sv-req">Required</span>
          : <span className="sv-optional">Optional — skip it if you want</span>}
        {q.kind === 'multi' && <span className="sv-hint">Pick any number</span>}
      </p>

      {unconfigured && (
        <p className="sv-unconfigured">
          This question has no options yet. A mentor still needs to fill them in,
          so there is nothing to answer here.
        </p>
      )}

      {!unconfigured && q.kind === 'single' && (
        <div className="sv-opts">
          {optionsOf(q).map(opt => (
            <Choice
              key={opt}
              label={opt}
              kind="single"
              on={value === opt}
              // Tapping the chosen option again clears it. On an optional
              // single there is otherwise no way back to "no answer" once you
              // have touched it, and a wrong stored answer is worse than none.
              onClick={() => onChange(value === opt ? undefined : opt)}
            />
          ))}
        </div>
      )}

      {!unconfigured && q.kind === 'multi' && (
        <div className="sv-opts">
          {optionsOf(q).map(opt => {
            const list = Array.isArray(value) ? value : []
            const on = list.includes(opt)
            return (
              <Choice
                key={opt}
                label={opt}
                kind="multi"
                on={on}
                onClick={() => onChange(on ? list.filter(v => v !== opt) : [...list, opt])}
              />
            )
          })}
        </div>
      )}

      {q.kind === 'scale' && (
        <>
          <div className="sv-scale">
            {scaleTicks(q).map(n => (
              <button
                key={n}
                type="button"
                className={`sv-tick${value === n ? ' sv-tick-on' : ''}`}
                onClick={() => onChange(value === n ? undefined : n)}
                aria-pressed={value === n}
              >
                {n}
              </button>
            ))}
          </div>
          {(scaleOf(q).min_label || scaleOf(q).max_label) && (
            <div className="sv-scale-labels">
              <span>{scaleOf(q).min_label}</span>
              <span>{scaleOf(q).max_label}</span>
            </div>
          )}
        </>
      )}

      {q.kind === 'text' && (
        <textarea
          className="sv-text"
          rows={3}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder="Leave it blank if there is nothing"
        />
      )}
    </section>
  )
}

export default function SurveyPage({ session }) {
  const memberId = session?.user?.id ?? null

  const [state, setState]         = useState('loading') // loading | form | done | none | error
  const [survey, setSurvey]       = useState(null)
  const [questions, setQuestions] = useState([])
  const [draft, setDraft]         = useState({})
  const [submitted, setSubmitted] = useState(null)   // the existing response row
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [flagged, setFlagged]     = useState([])     // ids of unanswered required

  const load = useCallback(async () => {
    if (!memberId) return
    setState('loading')
    setError('')

    // At most one row can carry is_open (surveys_one_open_idx), but the window
    // is still checked, so a survey nobody closed does not stay live forever.
    const { data: openRows, error: sErr } = await supabase
      .from('surveys')
      .select('id, title, opens_at, closes_at, is_open')
      .eq('is_open', true)
    if (sErr) { setError(sErr.message); setState('error'); return }

    const live = resolveOpenSurvey(openRows ?? [])
    if (!live) { setSurvey(null); setState('none'); return }
    setSurvey(live)

    const [{ data: qs, error: qErr }, { data: mine, error: rErr }] = await Promise.all([
      supabase.from('survey_questions')
        .select('id, position, kind, prompt, options, required')
        .eq('survey_id', live.id),
      supabase.from('survey_responses')
        .select('id, submitted_at')
        .eq('survey_id', live.id)
        .eq('member_id', memberId)
        .maybeSingle(),
    ])
    if (qErr) { setError(qErr.message); setState('error'); return }
    if (rErr) { setError(rErr.message); setState('error'); return }

    setQuestions(sortQuestions(qs ?? []))
    if (mine) { setSubmitted(mine); setState('done'); return }
    setSubmitted(null)
    setDraft({})
    setState('form')
  }, [memberId])

  useEffect(() => { load() }, [load])

  const ordered = useMemo(() => sortQuestions(questions), [questions])

  function setAnswer(id, v) {
    setDraft(d => {
      const next = { ...d }
      if (v === undefined) delete next[id]
      else next[id] = v
      return next
    })
    setFlagged(f => f.filter(x => x !== id))
  }

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')

    const missing = missingRequired(ordered, draft)
    if (missing.length) {
      setFlagged(missing.map(q => q.id))
      setError(missing.length === 1
        ? 'One question still needs an answer.'
        : `${missing.length} questions still need an answer.`)
      document.querySelector(`[data-qid="${missing[0].id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    setBusy(true)
    // Response first, then the answers that hang off it. The unique constraint
    // (survey_id, member_id) is what makes a double submit -- two taps, or a
    // second tab -- land as an error rather than a second row, so a 23505 here
    // is not a failure, it is the already-submitted state arriving late.
    const { data: resp, error: rErr } = await supabase
      .from('survey_responses')
      .insert({ survey_id: survey.id, member_id: memberId })
      .select('id, submitted_at')
      .single()

    if (rErr) {
      setBusy(false)
      if (rErr.code === '23505') { await load(); return }
      setError(rErr.message)
      return
    }

    // A SKIPPED QUESTION WRITES NO ROW. buildAnswerRows drops anything that is
    // not answered, so an untouched textarea stores nothing rather than "".
    const rows = buildAnswerRows(resp.id, ordered, draft)
    if (rows.length) {
      const { error: aErr } = await supabase.from('survey_answers').insert(rows)
      if (aErr) {
        // The response row exists, so the member has submitted and cannot
        // retry -- say what happened rather than showing a clean thank-you
        // over a half-written submission.
        setBusy(false)
        setSubmitted(resp)
        setState('done')
        setError(`Your answers may not have saved: ${aErr.message}. Tell a mentor.`)
        return
      }
    }

    setBusy(false)
    setSubmitted(resp)
    setState('done')
  }

  const answeredCount = ordered.filter(q => isAnswered(q.kind, draft[q.id])).length

  if (state === 'loading') {
    return <div className="sv-wrap"><p className="sv-muted">Loading…</p></div>
  }

  if (state === 'error') {
    return (
      <div className="sv-wrap">
        <div className="sv-card">
          <h1 className="sv-title">Weekly survey</h1>
          <p className="sv-error">{error || 'Something went wrong.'}</p>
          <button type="button" className="sv-retry" onClick={load}>Try again</button>
        </div>
      </div>
    )
  }

  // No open survey is a normal state, not an error and not a blank page.
  if (state === 'none') {
    return (
      <div className="sv-wrap">
        <div className="sv-card sv-card-quiet">
          <h1 className="sv-title">Weekly survey</h1>
          <p className="sv-lede">There is no survey open right now.</p>
          <p className="sv-muted">A mentor opens one each week. Check back then.</p>
        </div>
      </div>
    )
  }

  // Already submitted. Deliberately explicit rather than a blank form or an
  // error: a member who taps the link twice should see that they are done.
  // There is no edit path -- nobody can update or delete a submitted answer
  // (see the RLS block in supabase/weekly_surveys.sql).
  if (state === 'done') {
    return (
      <div className="sv-wrap">
        <div className="sv-card sv-card-done">
          <div className="sv-check" aria-hidden="true">✓</div>
          <h1 className="sv-title">You are done</h1>
          <p className="sv-lede">
            Your answers for <strong>{survey?.title}</strong> are in.
          </p>
          {submitted?.submitted_at && (
            <p className="sv-stamp">Submitted {fmtDateTime(submitted.submitted_at)}</p>
          )}
          <p className="sv-muted">
            Answers cannot be changed after they are sent. If something needs
            correcting, tell a mentor.
          </p>
          {error && <p className="sv-error">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="sv-wrap">
      <header className="sv-head">
        <h1 className="sv-title">{survey.title}</h1>
        <p className="sv-lede">
          Quick pulse check. Under a minute — skip anything marked optional.
        </p>
        {survey.closes_at && (
          <p className="sv-stamp">Closes {fmtDateTime(survey.closes_at)}</p>
        )}
      </header>

      <form onSubmit={submit}>
        {ordered.map((q, i) => (
          <Question
            key={q.id}
            q={q}
            index={i}
            value={draft[q.id]}
            onChange={v => setAnswer(q.id, v)}
            flagged={flagged.includes(q.id)}
          />
        ))}

        {!ordered.length && (
          <p className="sv-muted">This survey has no questions yet.</p>
        )}

        <div className="sv-footer">
          {error && <p className="sv-error">{error}</p>}
          <p className="sv-count">{answeredCount} of {ordered.length} answered</p>
          <button type="submit" className="sv-submit" disabled={busy || !ordered.length}>
            {busy ? 'Sending…' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  )
}
