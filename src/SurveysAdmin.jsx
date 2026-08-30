import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import {
  QUESTION_KINDS, KIND_LABEL, sortQuestions, optionsOf, scaleOf,
  aggregate, resolveOpenSurvey,
} from './surveys'
import './SurveysAdmin.css'

// Weekly survey, mentor side (/surveys). Staff-only, matching the tables' RLS
// -- the gate here is a courtesy so a non-staff member gets a sentence instead
// of an empty list; the "write staff" policies in supabase/weekly_surveys.sql
// are what actually enforce it.
//
// Three jobs: author a survey and its questions (with reorder), open and close
// it, and read the results.

function fmtDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

// datetime-local <-> timestamptz. The input has no zone, so it is read as the
// browser's local time, which for this team is America/Los_Angeles.
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fromLocalInput(v) {
  return v ? new Date(v).toISOString() : null
}

// Options are authored as one per line. Free text is the right control for a
// list that changes weekly -- a chip editor would be more clicks for the same
// result and one more thing to get wrong on a Sunday night.
function linesToOptions(text) {
  return text.split('\n').map(s => s.trim()).filter(Boolean)
}
function optionsToLines(q) {
  return optionsOf(q).join('\n')
}

// ── Question editor row ──────────────────────────────────────────────────────
function QuestionRow({ q, index, count, onSave, onDelete, onMove, busy }) {
  const [open, setOpen]     = useState(false)
  const [prompt, setPrompt] = useState(q.prompt)
  const [kind, setKind]     = useState(q.kind)
  const [lines, setLines]   = useState(optionsToLines(q))
  const [required, setRequired] = useState(q.required)
  const scale = scaleOf(q)
  const [smin, setSmin] = useState(scale.min)
  const [smax, setSmax] = useState(scale.max)

  // Only 'single' may be required (survey_questions_required_chk). Switching
  // kind clears the flag here so the write cannot be rejected by the CHECK
  // after the mentor has typed a whole question.
  function changeKind(k) {
    setKind(k)
    if (k !== 'single') setRequired(false)
  }

  function save() {
    const options =
      kind === 'scale' ? { min: Number(smin), max: Number(smax), min_label: '', max_label: '' }
      : (kind === 'single' || kind === 'multi') ? linesToOptions(lines)
      : []
    onSave(q.id, {
      prompt: prompt.trim(),
      kind,
      options,
      required: kind === 'single' ? required : false,
    })
    setOpen(false)
  }

  return (
    <li className="sa-q">
      <div className="sa-q-bar">
        <span className="sa-q-num">{String(index + 1).padStart(2, '0')}</span>
        <button type="button" className="sa-q-open" onClick={() => setOpen(o => !o)}>
          <span className="sa-q-prompt">{q.prompt}</span>
          <span className="sa-q-kind">
            {KIND_LABEL[q.kind] ?? q.kind}
            {q.required && ' · required'}
          </span>
        </button>
        <div className="sa-q-move">
          <button type="button" className="sa-mini" disabled={busy || index === 0}
                  onClick={() => onMove(index, -1)} aria-label="Move up">↑</button>
          <button type="button" className="sa-mini" disabled={busy || index === count - 1}
                  onClick={() => onMove(index, 1)} aria-label="Move down">↓</button>
        </div>
      </div>

      {open && (
        <div className="sa-q-edit">
          <label className="sa-label">Prompt
            <input className="sa-input" value={prompt} onChange={e => setPrompt(e.target.value)} />
          </label>

          <div className="sa-kinds">
            {QUESTION_KINDS.map(k => (
              <button key={k} type="button"
                      className={`sa-chip${kind === k ? ' sa-chip-on' : ''}`}
                      onClick={() => changeKind(k)}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>

          {(kind === 'single' || kind === 'multi') && (
            <label className="sa-label">Options, one per line
              <textarea className="sa-input sa-area" rows={4} value={lines}
                        onChange={e => setLines(e.target.value)} />
            </label>
          )}

          {kind === 'scale' && (
            <div className="sa-row">
              <label className="sa-label">Min
                <input className="sa-input sa-num" type="number" value={smin}
                       onChange={e => setSmin(e.target.value)} />
              </label>
              <label className="sa-label">Max
                <input className="sa-input sa-num" type="number" value={smax}
                       onChange={e => setSmax(e.target.value)} />
              </label>
            </div>
          )}

          <label className={`sa-check${kind === 'single' ? '' : ' sa-check-off'}`}>
            <input type="checkbox" checked={required} disabled={kind !== 'single'}
                   onChange={e => setRequired(e.target.checked)} />
            Required
            {kind !== 'single' && (
              <span className="sa-note">
                Only single-choice questions can be required — everything else
                stays skippable.
              </span>
            )}
          </label>

          <div className="sa-q-actions">
            <button type="button" className="sa-btn sa-btn-go" onClick={save} disabled={busy || !prompt.trim()}>
              Save question
            </button>
            <button type="button" className="sa-btn sa-btn-danger" onClick={() => onDelete(q.id)} disabled={busy}>
              Delete
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

// ── Results ──────────────────────────────────────────────────────────────────
function Results({ questions, answers, responses, attributed, onAttributed }) {
  const rows = useMemo(() => aggregate(questions, answers), [questions, answers])
  const nameOf = useCallback(id => {
    const r = responses.find(x => x.member_id === id)
    return r?.author ? displayName(r.author) : 'Member'
  }, [responses])

  return (
    <div className="sa-results">
      <div className="sa-results-head">
        <p className="sa-count">
          {responses.length} {responses.length === 1 ? 'response' : 'responses'}
        </p>
        {/* Attribution is a deliberate toggle, not the landing view. The
            aggregate is what the survey is FOR; putting names on by default
            changes what people are willing to type into "what is blocking you". */}
        <label className="sa-check sa-attr">
          <input type="checkbox" checked={attributed} onChange={e => onAttributed(e.target.checked)} />
          Show who said what
        </label>
      </div>

      {!responses.length && <p className="sa-muted">Nobody has answered yet.</p>}

      {rows.map(r => (
        <section key={r.question.id} className="sa-res">
          <h3 className="sa-res-prompt">{r.question.prompt}</h3>
          <p className="sa-res-meta">
            {KIND_LABEL[r.question.kind] ?? r.question.kind}
            {' · '}{r.answered} answered
            {r.question.kind === 'scale' && r.average != null && ` · average ${r.average}`}
          </p>

          {r.question.kind === 'text' ? (
            r.texts.length
              ? <ul className="sa-texts">
                  {r.texts.map((t, i) => (
                    <li key={i} className="sa-textrow">
                      {attributed && <span className="sa-who">{nameOf(t.member_id)}</span>}
                      <span className="sa-said">{t.value}</span>
                    </li>
                  ))}
                </ul>
              : <p className="sa-muted">No answers.</p>
          ) : (
            <ul className="sa-bars">
              {r.options.map(o => (
                <li key={o.label} className="sa-bar">
                  <div className="sa-bar-head">
                    <span className="sa-bar-label">
                      {o.label}
                      {o.unlisted && <span className="sa-unlisted"> not an option any more</span>}
                    </span>
                    <span className="sa-bar-n">{o.count} · {o.pct}%</span>
                  </div>
                  <div className="sa-bar-track">
                    <div className="sa-bar-fill" style={{ width: `${o.pct}%` }} />
                  </div>
                  {attributed && o.count > 0 && (
                    <p className="sa-bar-who">
                      {answersFor(answers, r.question, o.label).map(a => nameOf(a.member_id)).join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

// Who picked one option. Only ever called under the attribution toggle.
function answersFor(answers, question, label) {
  return (answers ?? []).filter(a => {
    if (a.question_id !== question.id) return false
    if (question.kind === 'multi') return Array.isArray(a.value) && a.value.map(String).includes(label)
    return String(a.value) === label
  })
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function SurveysAdmin({ session, hasRole = () => false }) {
  const isStaff = hasRole('mentor') || hasRole('lead') || hasRole('admin')

  const [surveys, setSurveys]     = useState([])
  const [selected, setSelected]   = useState(null)
  const [questions, setQuestions] = useState([])
  const [responses, setResponses] = useState([])
  const [answers, setAnswers]     = useState([])
  const [tab, setTab]             = useState('questions')  // questions | results
  const [attributed, setAttributed] = useState(false)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(true)

  const [newTitle, setNewTitle]   = useState('')
  const [newOpens, setNewOpens]   = useState('')
  const [newCloses, setNewCloses] = useState('')

  const loadSurveys = useCallback(async () => {
    setLoading(true)
    const { data, error: e } = await supabase
      .from('surveys')
      .select('id, title, opens_at, closes_at, is_open, created_at')
      .order('created_at', { ascending: false })
    if (e) setError(e.message)
    setSurveys(data ?? [])
    setLoading(false)
    return data ?? []
  }, [])

  const loadDetail = useCallback(async (surveyId) => {
    if (!surveyId) return
    const [{ data: qs }, { data: rs }, { data: as }] = await Promise.all([
      supabase.from('survey_questions')
        .select('id, position, kind, prompt, options, required')
        .eq('survey_id', surveyId),
      supabase.from('survey_responses')
        .select('id, member_id, submitted_at, author:profiles!survey_responses_member_id_fkey(id, full_name, nickname)')
        .eq('survey_id', surveyId)
        .order('submitted_at', { ascending: true }),
      supabase.from('survey_answers')
        .select('id, response_id, question_id, value, response:survey_responses!inner(member_id, survey_id)')
        .eq('response.survey_id', surveyId),
    ])
    setQuestions(sortQuestions(qs ?? []))
    setResponses(rs ?? [])
    // Flatten the member_id up onto the answer so the aggregate and the
    // attribution toggle both read one shape.
    setAnswers((as ?? []).map(a => ({ ...a, member_id: a.response?.member_id ?? null })))
  }, [])

  useEffect(() => {
    if (!isStaff) { setLoading(false); return }
    loadSurveys().then(list => {
      const live = resolveOpenSurvey(list) ?? list[0] ?? null
      if (live) { setSelected(live.id); loadDetail(live.id) }
    })
  }, [isStaff, loadSurveys, loadDetail])

  function pick(id) {
    setSelected(id)
    setTab('questions')
    setAttributed(false)
    loadDetail(id)
  }

  const survey = surveys.find(s => s.id === selected) ?? null

  async function createSurvey(e) {
    e.preventDefault()
    if (!newTitle.trim() || busy) return
    setBusy(true); setError('')
    const { data, error: e2 } = await supabase
      .from('surveys')
      .insert({
        title: newTitle.trim(),
        opens_at: fromLocalInput(newOpens),
        closes_at: fromLocalInput(newCloses),
        created_by: session?.user?.id ?? null,
      })
      .select('id')
      .single()
    setBusy(false)
    if (e2) { setError(e2.message); return }
    setNewTitle(''); setNewOpens(''); setNewCloses('')
    await loadSurveys()
    pick(data.id)
  }

  // Opening is close-then-open, two writes, because surveys_one_open_idx allows
  // at most one open survey and RAISES rather than silently closing the other.
  // Doing it here rather than in a trigger keeps "only one survey is live" a
  // visible database rule instead of hidden behaviour.
  async function setOpen(id, open) {
    setBusy(true); setError('')
    if (open) {
      const stale = surveys.filter(s => s.is_open && s.id !== id)
      for (const s of stale) {
        const { error: e } = await supabase.from('surveys').update({ is_open: false }).eq('id', s.id)
        if (e) { setBusy(false); setError(`Could not close "${s.title}": ${e.message}`); return }
      }
    }
    const { error: e2 } = await supabase.from('surveys').update({ is_open: open }).eq('id', id)
    setBusy(false)
    if (e2) { setError(e2.message); return }
    await loadSurveys()
  }

  async function addQuestion() {
    setBusy(true); setError('')
    const nextPos = questions.length ? Math.max(...questions.map(q => q.position ?? 0)) + 1 : 1
    const { error: e } = await supabase.from('survey_questions').insert({
      survey_id: selected,
      position: nextPos,
      kind: 'single',
      prompt: 'New question',
      options: [],
      required: false,
    })
    setBusy(false)
    if (e) { setError(e.message); return }
    await loadDetail(selected)
  }

  async function saveQuestion(id, patch) {
    setBusy(true); setError('')
    const { error: e } = await supabase.from('survey_questions').update(patch).eq('id', id)
    setBusy(false)
    if (e) { setError(e.message); return }
    await loadDetail(selected)
  }

  async function deleteQuestion(id) {
    setBusy(true); setError('')
    const { error: e } = await supabase.from('survey_questions').delete().eq('id', id)
    setBusy(false)
    if (e) { setError(e.message); return }
    await loadDetail(selected)
  }

  // Reorder writes BOTH positions rather than swapping stored values blindly:
  // rows can share a position (the index is not unique -- see the migration),
  // so the ordinal is recomputed from the rendered order and written back.
  async function move(index, dir) {
    const next = index + dir
    if (next < 0 || next >= questions.length) return
    const reordered = [...questions]
    const [item] = reordered.splice(index, 1)
    reordered.splice(next, 0, item)
    setQuestions(reordered)          // optimistic: the list is short and local
    setBusy(true); setError('')
    for (let i = 0; i < reordered.length; i++) {
      const { error: e } = await supabase.from('survey_questions')
        .update({ position: i + 1 }).eq('id', reordered[i].id)
      if (e) { setBusy(false); setError(e.message); await loadDetail(selected); return }
    }
    setBusy(false)
    await loadDetail(selected)
  }

  if (!isStaff) {
    return (
      <div className="sa-wrap">
        <h1 className="sa-title">Surveys</h1>
        <p className="sa-muted">Mentor access required.</p>
      </div>
    )
  }

  return (
    <div className="sa-wrap">
      <header className="sa-head">
        <h1 className="sa-title">Surveys</h1>
        <p className="sa-sub">
          Weekly pulse check. Questions are rows, not code — swap the rotating
          question here and it is live on the next load.
        </p>
      </header>

      {error && <p className="sa-error">{error}</p>}

      <form className="sa-new" onSubmit={createSurvey}>
        <input className="sa-input" placeholder="New survey title, e.g. Week of Sep 7"
               value={newTitle} onChange={e => setNewTitle(e.target.value)} />
        <label className="sa-label sa-label-inline">Opens
          <input className="sa-input" type="datetime-local" value={newOpens}
                 onChange={e => setNewOpens(e.target.value)} />
        </label>
        <label className="sa-label sa-label-inline">Closes
          <input className="sa-input" type="datetime-local" value={newCloses}
                 onChange={e => setNewCloses(e.target.value)} />
        </label>
        <button type="submit" className="sa-btn sa-btn-go" disabled={busy || !newTitle.trim()}>
          Create
        </button>
      </form>

      {loading && <p className="sa-muted">Loading…</p>}

      <ul className="sa-list">
        {surveys.map(s => (
          <li key={s.id} className={`sa-item${s.id === selected ? ' sa-item-on' : ''}`}>
            <button type="button" className="sa-item-btn" onClick={() => pick(s.id)}>
              <span className={`sa-pill${s.is_open ? ' sa-pill-open' : ''}`}>
                {s.is_open ? 'OPEN' : 'CLOSED'}
              </span>
              <span className="sa-item-title">{s.title}</span>
              <span className="sa-item-meta">
                {s.opens_at ? fmtDateTime(s.opens_at) : 'no start'}
                {' → '}
                {s.closes_at ? fmtDateTime(s.closes_at) : 'no end'}
              </span>
            </button>
            {/* Close is NOT --fault red: closing a survey destroys nothing and
                is not an error, and red is reserved for faults and destructive
                actions (see the branding rules in CLAUDE.md). Only the question
                Delete below is red. */}
            <button type="button"
                    className={`sa-btn ${s.is_open ? '' : 'sa-btn-go'}`}
                    disabled={busy}
                    onClick={() => setOpen(s.id, !s.is_open)}>
              {s.is_open ? 'Close' : 'Open'}
            </button>
          </li>
        ))}
        {!loading && !surveys.length && <p className="sa-muted">No surveys yet.</p>}
      </ul>

      {survey && (
        <section className="sa-detail">
          <div className="sa-tabs">
            <button type="button" className={`sa-tab${tab === 'questions' ? ' sa-tab-on' : ''}`}
                    onClick={() => setTab('questions')}>Questions</button>
            <button type="button" className={`sa-tab${tab === 'results' ? ' sa-tab-on' : ''}`}
                    onClick={() => setTab('results')}>Results</button>
          </div>

          {tab === 'questions' ? (
            <>
              <ul className="sa-qs">
                {questions.map((q, i) => (
                  <QuestionRow key={q.id} q={q} index={i} count={questions.length}
                               onSave={saveQuestion} onDelete={deleteQuestion}
                               onMove={move} busy={busy} />
                ))}
              </ul>
              <button type="button" className="sa-btn sa-btn-go" onClick={addQuestion} disabled={busy}>
                + Add question
              </button>
            </>
          ) : (
            <Results questions={questions} answers={answers} responses={responses}
                     attributed={attributed} onAttributed={setAttributed} />
          )}
        </section>
      )}
    </div>
  )
}
