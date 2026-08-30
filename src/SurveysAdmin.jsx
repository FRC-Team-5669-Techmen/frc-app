import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from './supabase'
import { displayName } from './names'
import {
  QUESTION_KINDS, KIND_LABEL, sortQuestions, optionsOf, scaleOf,
  aggregate, resolveOpenSurvey, surveyState, SURVEY_STATE_LABEL,
  duplicateTitle, duplicateQuestionRows, buildResultsCsv,
} from './surveys'
import './SurveysAdmin.css'

// Weekly survey, mentor side (/surveys). Staff-only, matching the tables' RLS
// -- the gate here is a courtesy so a non-staff member gets a sentence instead
// of an empty list; the "write staff" policies in supabase/weekly_surveys.sql
// are what actually enforce it.
//
// Four jobs: author a survey and its questions (with reorder), open and close
// it, read the results, and MANAGE the set of surveys -- rename, re-window,
// duplicate, export and delete.
//
// Duplicate is the one that makes the weekly cadence survivable, and it is why
// the rest exists: the normal week is "duplicate last week, swap the rotating
// question, open". Without it every week is a re-author from an empty form,
// which is how a weekly survey quietly becomes a monthly one.

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
function Results({ survey, questions, answers, responses, attributed, onAttributed }) {
  const rows = useMemo(() => aggregate(questions, answers), [questions, answers])
  const nameOf = useCallback(id => {
    const r = responses.find(x => x.member_id === id)
    return r?.author ? displayName(r.author) : 'Member'
  }, [responses])

  // The export and the on-screen names are ONE decision, deliberately: a CSV is
  // the easiest way for an anonymous aggregate to quietly become a named one,
  // so the Member column only fills in while the surface is already showing
  // names. The column itself is always there, so the sheet's shape does not
  // change under the mentor -- it is the values that are withheld.
  function exportCsv() {
    const csv = buildResultsCsv({
      questions, responses, answers, attributed,
      nameOf: r => (r.author ? displayName(r.author) : 'Member'),
    })
    const slug = String(survey?.title ?? 'survey')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'survey'
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-results.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

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
        <button type="button" className="sa-btn" data-test="export-csv" onClick={exportCsv}>
          Export CSV
        </button>
      </div>
      <p className="sa-muted sa-export-note">
        {attributed
          ? 'The export will name who said what, because attribution is on.'
          : 'The export leaves the Member column empty while attribution is off.'}
      </p>

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

  // Per-survey counts for the list. NOT lazy and not behind a click: the
  // response count is the number that makes a delete safe to press, and a
  // count you have to go looking for is a count nobody looks at.
  const [counts, setCounts] = useState({})   // { [surveyId]: { questions, responses } }

  // Delete is two clicks. The first arms it; the second, which names the exact
  // number of responses and answers about to go, is the one that destroys.
  const [armed, setArmed] = useState(null)

  const [editTitle, setEditTitle]   = useState('')
  const [editOpens, setEditOpens]   = useState('')
  const [editCloses, setEditCloses] = useState('')
  const [note, setNote]             = useState('')

  const loadSurveys = useCallback(async () => {
    setLoading(true)
    // Three reads rather than a PostgREST count embed: the counts are wanted
    // for EVERY row, and ids alone are small. Both child tables are staff-
    // readable, so this is one round trip each rather than N.
    const [{ data, error: e }, { data: qrows }, { data: rrows }] = await Promise.all([
      supabase.from('surveys')
        .select('id, title, opens_at, closes_at, is_open, created_at')
        .order('created_at', { ascending: false }),
      supabase.from('survey_questions').select('id, survey_id'),
      supabase.from('survey_responses').select('id, survey_id'),
    ])
    if (e) setError(e.message)
    const tally = {}
    const bump = (id, key) => {
      if (!id) return
      tally[id] = tally[id] ?? { questions: 0, responses: 0 }
      tally[id][key] += 1
    }
    for (const q of qrows ?? []) bump(q.survey_id, 'questions')
    for (const r of rrows ?? []) bump(r.survey_id, 'responses')
    setCounts(tally)
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
    setArmed(null)
    setNote('')
    loadDetail(id)
  }

  const survey = surveys.find(s => s.id === selected) ?? null

  // The settings form is seeded from the selected survey rather than kept in
  // sync with it: a mentor mid-edit must not have their typing overwritten by
  // a background reload.
  // The note is a confirmation of something that just happened, so it expires.
  // FOUND BY LOOKING at the rendered page rather than by measuring it: after a
  // delete the page kept "Deleted." pinned at the top while the mentor went on
  // to open a different survey's settings, where it read as a statement about
  // THAT survey.
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(''), 6000)
    return () => clearTimeout(t)
  }, [note])

  // Keyed on the survey's id, NOT on `selected`: the row arrives one render
  // after the id does, and seeding on `selected` alone would fill the form
  // from a survey that is still null and then never re-seed.
  useEffect(() => {
    if (!survey) return
    setEditTitle(survey.title ?? '')
    setEditOpens(toLocalInput(survey.opens_at))
    setEditCloses(toLocalInput(survey.closes_at))
  }, [survey?.id])  // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Manage ─────────────────────────────────────────────────────────────────
  // Title and window, after creation. Nothing here touches is_open: opening is
  // its own two-write dance because of surveys_one_open_idx (see setOpen), and
  // folding it into a general save would hide that.
  async function saveSurveyMeta(e) {
    e.preventDefault()
    if (!survey || !editTitle.trim() || busy) return
    setBusy(true); setError(''); setNote('')
    const { error: e2 } = await supabase.from('surveys').update({
      title: editTitle.trim(),
      opens_at: fromLocalInput(editOpens),
      closes_at: fromLocalInput(editCloses),
    }).eq('id', survey.id)
    setBusy(false)
    if (e2) { setError(e2.message); return }
    setNote('Saved.')
    await loadSurveys()
  }

  // Copies title (suffixed), questions, positions and options. Copies NO
  // responses -- there is no path that could, and there should not be: a
  // response is a record of one person answering one survey.
  //
  // THE COPY LANDS CLOSED, which is also what keeps this safe to press while
  // another survey is open: surveys_one_open_idx is a partial unique index on
  // ((true)) where is_open, so a row with is_open false is not in the index at
  // all and cannot collide with the live one. Opening the copy is a separate,
  // deliberate click that goes through setOpen's close-then-open.
  async function duplicateSurvey() {
    if (!survey || busy) return
    setBusy(true); setError(''); setNote('')

    const title = duplicateTitle(survey.title, surveys.map(s => s.title))
    const { data: created, error: e1 } = await supabase.from('surveys').insert({
      title,
      opens_at: null,
      closes_at: null,
      is_open: false,
      created_by: session?.user?.id ?? null,
    }).select('id').single()
    if (e1) { setBusy(false); setError(e1.message); return }

    // The copy's questions come from the SELECTED survey's already-loaded rows,
    // which is the same list the mentor is looking at.
    const rows = duplicateQuestionRows(created.id, questions)
    if (rows.length) {
      const { error: e2 } = await supabase.from('survey_questions').insert(rows)
      if (e2) { setBusy(false); setError(e2.message); return }
    }

    setBusy(false)
    await loadSurveys()
    pick(created.id)
    setNote(`Duplicated as "${title}" — closed, with ${rows.length} ${rows.length === 1 ? 'question' : 'questions'} and no responses.`)
  }

  // The delete itself. The arming and the count-naming live in the render; by
  // the time this runs the mentor has read the numbers and clicked twice.
  //
  // survey_questions, survey_responses and survey_answers all go with it
  // through ON DELETE CASCADE. The `revoke delete ... from authenticated` in
  // the migration does NOT block that: a cascade runs as the referencing
  // table's owner, so it is not subject to the caller's table grants -- see the
  // note at the revokes in supabase/weekly_surveys.sql, which records the test.
  async function deleteSurvey(id) {
    setBusy(true); setError(''); setNote('')
    const { error: e } = await supabase.from('surveys').delete().eq('id', id)
    setBusy(false)
    if (e) { setError(e.message); return }
    setArmed(null)
    setSelected(null)
    setQuestions([]); setResponses([]); setAnswers([])
    const list = await loadSurveys()
    // pick() clears the note, so the note is set after it, not before.
    const next = resolveOpenSurvey(list) ?? list[0] ?? null
    if (next) pick(next.id)
    setNote('Deleted.')
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
      {note && <p className="sa-note-line" data-test="note">{note}</p>}

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
        {surveys.map(s => {
          const state = surveyState(s)
          const c = counts[s.id] ?? { questions: 0, responses: 0 }
          return (
          <li key={s.id} className={`sa-item${s.id === selected ? ' sa-item-on' : ''}`}
              data-test="survey-row" data-title={s.title}>
            <button type="button" className="sa-item-btn" onClick={() => pick(s.id)}>
              {/* OPEN is not simply is_open: a survey whose window has passed
                  reads EXPIRED and one whose window has not started reads
                  SCHEDULED, because in both cases the switch is on and the
                  member surface still shows nothing. Calling those OPEN is the
                  exact confusion the seeded survey caused. */}
              <span className={`sa-pill sa-pill-${state}`} data-test="state">
                {SURVEY_STATE_LABEL[state]}
              </span>
              <span className="sa-item-title">{s.title}</span>
              <span className="sa-item-meta">
                {s.opens_at ? fmtDateTime(s.opens_at) : 'no start'}
                {' → '}
                {s.closes_at ? fmtDateTime(s.closes_at) : 'no end'}
              </span>
              <span className="sa-item-counts">
                <span data-test="qcount">{c.questions} {c.questions === 1 ? 'question' : 'questions'}</span>
                {' · '}
                <span data-test="rcount">{c.responses} {c.responses === 1 ? 'response' : 'responses'}</span>
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
          )
        })}
        {!loading && !surveys.length && <p className="sa-muted">No surveys yet.</p>}
      </ul>

      {survey && (
        <section className="sa-detail">
          <div className="sa-tabs">
            <button type="button" className={`sa-tab${tab === 'questions' ? ' sa-tab-on' : ''}`}
                    onClick={() => setTab('questions')}>Questions</button>
            <button type="button" className={`sa-tab${tab === 'results' ? ' sa-tab-on' : ''}`}
                    onClick={() => setTab('results')}>Results</button>
            <button type="button" className={`sa-tab${tab === 'settings' ? ' sa-tab-on' : ''}`}
                    data-test="tab-settings"
                    onClick={() => { setTab('settings'); setArmed(null) }}>Settings</button>
          </div>

          {tab === 'settings' ? (
            <div className="sa-settings">
              <form className="sa-meta" onSubmit={saveSurveyMeta}>
                <label className="sa-label">Title
                  <input className="sa-input" data-test="edit-title" value={editTitle}
                         onChange={e => setEditTitle(e.target.value)} />
                </label>
                <div className="sa-row">
                  <label className="sa-label">Opens
                    <input className="sa-input" type="datetime-local" data-test="edit-opens"
                           value={editOpens} onChange={e => setEditOpens(e.target.value)} />
                  </label>
                  <label className="sa-label">Closes
                    <input className="sa-input" type="datetime-local" data-test="edit-closes"
                           value={editCloses} onChange={e => setEditCloses(e.target.value)} />
                  </label>
                </div>
                <button type="submit" className="sa-btn sa-btn-go" data-test="save-meta"
                        disabled={busy || !editTitle.trim()}>
                  Save changes
                </button>
              </form>

              <div className="sa-manage">
                <div className="sa-manage-row">
                  <div>
                    <p className="sa-manage-title">Duplicate</p>
                    <p className="sa-muted">
                      Copies the {questions.length} {questions.length === 1 ? 'question' : 'questions'},
                      their order and their options. No responses are copied and
                      the copy lands closed, so this is safe to press while
                      another survey is open.
                    </p>
                  </div>
                  <button type="button" className="sa-btn sa-btn-go" data-test="duplicate"
                          onClick={duplicateSurvey} disabled={busy}>
                    Duplicate
                  </button>
                </div>

                {/* Delete is the one red control here, and it is two clicks.
                    The second one names what is about to be destroyed BY
                    NUMBER -- a bare "are you sure" tells a mentor nothing about
                    whether they are throwing away an empty draft or a week of
                    answers, which is the only thing they need to know. */}
                <div className="sa-manage-row sa-manage-danger">
                  <div>
                    <p className="sa-manage-title">Delete</p>
                    {armed === survey.id ? (
                      <p className="sa-confirm" data-test="delete-confirm">
                        Delete “{survey.title}”? {responses.length}{' '}
                        {responses.length === 1 ? 'response' : 'responses'} and {answers.length}{' '}
                        {answers.length === 1 ? 'answer' : 'answers'} will be deleted.
                        {/* ALSO FOUND BY LOOKING: the counts are true but they
                            do not say the one thing that separates deleting a
                            spent draft from deleting the form students have
                            open on their phones right now. */}
                        {surveyState(survey) === 'open' &&
                          ' This is the survey that is live right now — anyone part-way through it loses the form.'}
                      </p>
                    ) : (
                      <p className="sa-muted">
                        Permanent. The questions, every response and every answer
                        go with it.
                      </p>
                    )}
                  </div>
                  {armed === survey.id ? (
                    <div className="sa-row">
                      <button type="button" className="sa-btn sa-btn-danger" data-test="delete-confirm-btn"
                              onClick={() => deleteSurvey(survey.id)} disabled={busy}>
                        Delete permanently
                      </button>
                      <button type="button" className="sa-btn" data-test="delete-cancel"
                              onClick={() => setArmed(null)} disabled={busy}>
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="sa-btn sa-btn-danger" data-test="delete-arm"
                            onClick={() => setArmed(survey.id)} disabled={busy}>
                      Delete survey
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : tab === 'questions' ? (
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
            <Results survey={survey} questions={questions} answers={answers} responses={responses}
                     attributed={attributed} onAttributed={setAttributed} />
          )}
        </section>
      )}
    </div>
  )
}
