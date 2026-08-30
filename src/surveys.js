// Weekly survey: the pure part. No React, no Supabase -- resolving which survey
// is live, deciding whether an answer counts as answered, and turning a pile of
// answer rows into the counts the mentor results view renders. Kept separate
// from both surfaces so the aggregate the mentors act on is the same code the
// test harness drives, rather than a second implementation that agrees by luck.

export const QUESTION_KINDS = ['single', 'multi', 'scale', 'text']

export const KIND_LABEL = {
  single: 'Single choice',
  multi:  'Multi select',
  scale:  'Scale',
  text:   'Free text',
}

// Scale defaults, used when a question's options jsonb says nothing.
export const SCALE_DEFAULT = { min: 1, max: 5, min_label: '', max_label: '' }

export function scaleOf(question) {
  const o = question?.options
  const raw = (o && !Array.isArray(o) && typeof o === 'object') ? o : {}
  const min = Number.isFinite(raw.min) ? raw.min : SCALE_DEFAULT.min
  const max = Number.isFinite(raw.max) ? raw.max : SCALE_DEFAULT.max
  return {
    min,
    max: max > min ? max : min + 1,
    min_label: typeof raw.min_label === 'string' ? raw.min_label : '',
    max_label: typeof raw.max_label === 'string' ? raw.max_label : '',
  }
}

// Option list for single/multi. Anything that is not an array of strings reads
// as no options -- an unconfigured question, not a crash.
export function optionsOf(question) {
  const o = question?.options
  if (!Array.isArray(o)) return []
  return o.filter(v => typeof v === 'string' && v.trim().length > 0)
}

export function sortQuestions(rows) {
  // Ties on position are broken by id so the order is stable and matches the
  // index in supabase/weekly_surveys.sql. position is NOT unique there on
  // purpose -- see the comment at survey_questions_survey_idx.
  return [...(rows ?? [])].sort((a, b) => {
    const p = (a.position ?? 0) - (b.position ?? 0)
    return p !== 0 ? p : String(a.id).localeCompare(String(b.id))
  })
}

// Which survey the member surface should show. is_open is the switch a mentor
// throws; the window, when set, is what stops a survey nobody closed from
// hanging around all season. Both must agree.
//
// The database allows at most one is_open row (surveys_one_open_idx), so this
// never has to choose between two -- it takes the first that is also inside its
// window and returns null otherwise.
export function resolveOpenSurvey(surveys, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : now
  for (const s of surveys ?? []) {
    if (!s?.is_open) continue
    if (s.opens_at && new Date(s.opens_at).getTime() > t) continue
    if (s.closes_at && new Date(s.closes_at).getTime() <= t) continue
    return s
  }
  return null
}

// Does this draft answer count as given? Mirrors survey_answers_nonempty_chk in
// the migration: an untouched textarea, an untapped multi and a missing pick
// are all "skipped", and a skipped question stores NO ROW rather than a blank.
export function isAnswered(kind, value) {
  if (value === undefined || value === null) return false
  if (kind === 'multi') return Array.isArray(value) && value.length > 0
  if (kind === 'text')  return typeof value === 'string' && value.trim().length > 0
  if (kind === 'scale') return Number.isFinite(value)
  return typeof value === 'string' && value.length > 0
}

// The value actually written to survey_answers.value, normalized. Text is
// trimmed here rather than at the input, so leading whitespace a phone keyboard
// adds never becomes a stored answer and never fails the CHECK.
export function answerValue(kind, value) {
  if (kind === 'text') return value.trim()
  return value
}

// A required question the mentor has not finished authoring cannot be answered,
// so it cannot be required in practice. The seeded survey ships in exactly this
// state (the subteam options are a TODO), and the honest render is a visible
// "not configured" marker rather than a form that refuses to submit with no
// way to fix it from the member's side.
export function isUnconfigured(question) {
  return (question.kind === 'single' || question.kind === 'multi')
    && optionsOf(question).length === 0
}

// Which required questions are still unanswered. Only 'single' can be required
// -- survey_questions_required_chk enforces that in the database -- and this
// re-states it rather than trusting the row, so a required flag that somehow
// got onto another kind cannot block a member.
export function missingRequired(questions, draft) {
  return sortQuestions(questions).filter(q =>
    q.required
    && q.kind === 'single'
    && !isUnconfigured(q)
    && !isAnswered(q.kind, draft[q.id])
  )
}

// Rows ready for a single insert into survey_answers. Skipped questions are
// absent, not blank.
export function buildAnswerRows(responseId, questions, draft) {
  return sortQuestions(questions)
    .filter(q => isAnswered(q.kind, draft[q.id]))
    .map(q => ({
      response_id: responseId,
      question_id: q.id,
      value: answerValue(q.kind, draft[q.id]),
    }))
}

// ── Results ──────────────────────────────────────────────────────────────────
// One entry per question, in position order.
//
//   single / multi  -> { options: [{ label, count, pct }], answered }
//   scale           -> { options: [...], answered, average }
//   text            -> { texts: [{ value, member_id, response_id }], answered }
//
// pct is a percentage of ANSWERED responses for that question, not of everyone
// who submitted -- every kind but a required single is skippable, so dividing
// by the submission count would quietly report a low number for a question
// people simply did not answer. `answered` is carried alongside so the surface
// can say which denominator it used.
//
// An option nobody picked still gets a row with count 0. A value that is not in
// the option list (a question edited after answers landed) is appended at the
// end and marked `unlisted`, because dropping it would silently lose an answer.
export function aggregate(questions, answers) {
  const byQuestion = new Map()
  for (const a of answers ?? []) {
    if (!byQuestion.has(a.question_id)) byQuestion.set(a.question_id, [])
    byQuestion.get(a.question_id).push(a)
  }

  return sortQuestions(questions).map(q => {
    const rows = byQuestion.get(q.id) ?? []

    if (q.kind === 'text') {
      return {
        question: q,
        answered: rows.length,
        texts: rows.map(r => ({
          value: String(r.value),
          member_id: r.member_id ?? null,
          response_id: r.response_id,
        })),
        options: [],
      }
    }

    const counts = new Map()
    const declared = q.kind === 'scale'
      ? scaleTicks(q).map(String)
      : optionsOf(q)
    for (const label of declared) counts.set(label, 0)

    let answered = 0
    let scaleSum = 0
    let scaleN = 0
    for (const r of rows) {
      const picks = q.kind === 'multi'
        ? (Array.isArray(r.value) ? r.value : [])
        : [r.value]
      let counted = false
      for (const p of picks) {
        if (p === undefined || p === null) continue
        const label = String(p)
        counts.set(label, (counts.get(label) ?? 0) + 1)
        counted = true
        if (q.kind === 'scale' && Number.isFinite(Number(p))) {
          scaleSum += Number(p)
          scaleN += 1
        }
      }
      if (counted) answered += 1
    }

    const options = [...counts.entries()].map(([label, count]) => ({
      label,
      count,
      pct: answered ? Math.round((count / answered) * 1000) / 10 : 0,
      unlisted: !declared.includes(label),
    }))

    return {
      question: q,
      answered,
      options,
      texts: [],
      ...(q.kind === 'scale'
        ? { average: scaleN ? Math.round((scaleSum / scaleN) * 100) / 100 : null }
        : {}),
    }
  })
}

export function scaleTicks(question) {
  const { min, max } = scaleOf(question)
  const out = []
  for (let i = min; i <= max; i++) out.push(i)
  return out
}

// ── Survey state ─────────────────────────────────────────────────────────────
// The management list needs a word for each survey, and "open" alone is a lie
// in two directions. is_open is a switch a mentor throws; the window is what
// decides whether throwing it did anything. Both are read here so the list
// never shows OPEN for a survey the member surface refuses to serve -- which is
// exactly the defect the seeded survey hit when opens_at was a day in the
// future (see the opens_at comment in supabase/weekly_surveys.sql).
//
//   closed    -> is_open false. Nothing else matters.
//   expired   -> is_open true but closes_at has passed. Live switch, dead window.
//   scheduled -> is_open true but opens_at has not arrived yet.
//   open      -> is_open true and inside the window. THE one resolveOpenSurvey
//                returns, and at most one row can be in this state at a time.
export function surveyState(survey, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : now
  if (!survey?.is_open) return 'closed'
  if (survey.closes_at && new Date(survey.closes_at).getTime() <= t) return 'expired'
  if (survey.opens_at  && new Date(survey.opens_at).getTime()  >  t) return 'scheduled'
  return 'open'
}

export const SURVEY_STATE_LABEL = {
  closed:    'CLOSED',
  expired:   'EXPIRED',
  scheduled: 'SCHEDULED',
  open:      'OPEN',
}

// ── Duplicate ────────────────────────────────────────────────────────────────
// The weekly cadence is: duplicate last week, swap the rotating question, open.
// The title has to be distinct enough that the list is readable on a Sunday
// night, so the copy is suffixed and the suffix counts up rather than colliding.
export function duplicateTitle(title, existing = []) {
  const taken = new Set((existing ?? []).map(t => String(t)))
  const base = String(title ?? '').replace(/\s*\(copy(?: \d+)?\)\s*$/, '').trim() || 'Untitled'
  let candidate = `${base} (copy)`
  let n = 2
  while (taken.has(candidate)) candidate = `${base} (copy ${n++})`
  return candidate
}

// The question rows for a copy: everything that defines the question, and
// nothing that ties it to the survey it came from. Positions are RENUMBERED
// from the sorted order rather than copied, so a source survey whose rows share
// a position (the index is not unique -- see the migration) lands as a clean
// 1..n in the copy.
export function duplicateQuestionRows(surveyId, questions) {
  return sortQuestions(questions).map((q, i) => ({
    survey_id: surveyId,
    position:  i + 1,
    kind:      q.kind,
    prompt:    q.prompt,
    options:   q.options ?? [],
    required:  !!q.required,
  }))
}

// ── CSV export ───────────────────────────────────────────────────────────────
// One row per response, one column per question, plus submitted_at.
function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// How one stored answer reads in a spreadsheet cell. Multi is joined rather
// than exploded into one column per option: the column is the QUESTION, and a
// mentor filtering a sheet wants one cell to read as one person's answer.
export function answerCsvValue(kind, value) {
  if (value === undefined || value === null) return ''
  if (kind === 'multi') return Array.isArray(value) ? value.map(String).join('; ') : String(value)
  return String(value)
}

// `attributed` is the SAME toggle that governs the on-screen names, and it is
// wired to the export on purpose: a CSV is the easiest way for an anonymous
// aggregate to quietly become a named one, so the export can only carry names
// while the surface is already showing them. The Member column is always
// present so the sheet's shape does not change under the mentor -- it is the
// VALUES that are withheld.
//
// submitted_at is emitted as the stored ISO instant rather than a formatted
// local time: it is the record, it sorts correctly in every spreadsheet, and a
// reformatted timestamp is the kind of thing that silently loses a zone.
export function buildResultsCsv({ questions, responses, answers, attributed = false, nameOf }) {
  const qs = sortQuestions(questions)
  const byResponse = new Map()
  for (const a of answers ?? []) {
    if (!byResponse.has(a.response_id)) byResponse.set(a.response_id, new Map())
    byResponse.get(a.response_id).set(a.question_id, a.value)
  }

  const header = ['Member', 'Submitted at', ...qs.map(q => q.prompt)]
  const lines = [header.map(csvCell).join(',')]

  for (const r of responses ?? []) {
    const cells = byResponse.get(r.id) ?? new Map()
    lines.push([
      attributed ? (nameOf ? nameOf(r) : (r.member_id ?? '')) : '',
      r.submitted_at ?? '',
      ...qs.map(q => answerCsvValue(q.kind, cells.get(q.id))),
    ].map(csvCell).join(','))
  }

  return lines.join('\r\n')
}
