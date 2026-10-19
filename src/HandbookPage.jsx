// The member handbook (/handbook): a quick reference, the full text as 18
// lessons with two questions each, the glossary, and signing.
//
// The text is src/handbook/handbook.md, the release copy of the team's Claude
// Doc. Words that a freshman may not know are underlined; tapping one shows
// its glossary line. Progress lives in this browser (localStorage, per member
// and version); the signature is a row in handbook_acknowledgments
// (migration 0013), and until 0013 is pasted the Sign tab says so plainly.

import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import { isMissingTable } from './schemaMissing'
import handbookMd from './handbook/handbook.md?raw'
import { parseHandbook, parseInline, glossaryOf, agreementsOf } from './handbook/content'
import { LESSONS, TERM_MATCHES, HANDBOOK_VERSION } from './handbook/lessons'
import { DIAGRAMS } from './handbook/diagrams'
import { signerRoleFor, mustPassLessons, storageKey, emptyProgress, cleanProgress, answer, passedCount } from './handbook/sign'
import './HandbookPage.css'

const HB = parseHandbook(handbookMd)
const GLOSSARY = glossaryOf(HB)
const DEFS = Object.fromEntries(GLOSSARY.map(g => [g.term, g.def]))
const AGREEMENTS = agreementsOf(HB)
const SECTION = Object.fromEntries(HB.sections.filter(s => s.num).map(s => [s.num, s]))
const GLANCE = HB.sections.find(s => s.id === 'glance')

// ── Tap-to-define ──────────────────────────────────────────────────────────
const SPELLINGS = TERM_MATCHES.flatMap(([term, list]) => list.map(sp => ({ sp, term,
  exact: sp === sp.toUpperCase() || /\d/.test(sp) || /^[A-Z]/.test(sp) })))
  .sort((a, b) => b.sp.length - a.sp.length)
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const TERM_RE = new RegExp(`(?<![A-Za-z0-9-])(${SPELLINGS.map(x => esc(x.sp)).join('|')})(?![A-Za-z0-9-])`, 'gi')
function lookupTerm(match) {
  const low = match.toLowerCase()
  const hit = SPELLINGS.find(x => x.sp.toLowerCase() === low)
  if (!hit) return null
  if (hit.exact && hit.sp !== match) return null
  return hit.term
}

function Term({ word, term, open, onToggle }) {
  return (
    <span className="hb-term-wrap">
      <button type="button" className="hb-term" aria-expanded={open} onClick={(e) => { e.stopPropagation(); onToggle() }}>{word}</button>
      {open && (
        <span className="hb-term-pop" role="note" onClick={(e) => e.stopPropagation()}>
          <span className="hb-term-name">{term}</span>
          <span className="hb-term-def">{DEFS[term]}</span>
        </span>
      )}
    </span>
  )
}

// One rendering context per lesson body: the first use of each term in it is
// underlined, later uses are plain text.
function makeCtx(scope, openTerm, setOpenTerm) {
  return { scope, seen: new Set(), n: 0, openTerm, setOpenTerm }
}

function withTerms(str, ctx) {
  if (!ctx) return str
  const out = []
  let last = 0
  str.replace(TERM_RE, (m, _g, idx) => {
    const term = lookupTerm(m)
    if (!term || ctx.seen.has(term)) return m
    ctx.seen.add(term)
    if (idx > last) out.push(str.slice(last, idx))
    const key = `${ctx.scope}:${ctx.n++}`
    out.push(<Term key={key} word={m} term={term} open={ctx.openTerm === key}
      onToggle={() => ctx.setOpenTerm(ctx.openTerm === key ? null : key)} />)
    last = idx + m.length
    return m
  })
  if (last < str.length) out.push(str.slice(last))
  return out
}

// Plain functions, not components: the first-use marking mutates ctx, so it
// must run inside ONE render of the lesson (StrictMode renders a component
// twice, and a child component would see every term already used).
function Inline({ text, ctx }) { return inline(text, ctx) }
function inline(text, ctx) {
  return parseInline(text).map((tok, i) => {
    if (tok.t === 'b') return <strong key={i}>{withTerms(tok.v, ctx)}</strong>
    if (tok.t === 'a') return <a key={i} href={tok.href} target="_blank" rel="noopener noreferrer">{tok.v.replace(/^https?:\/\//, '')}</a>
    return <Fragment key={i}>{withTerms(tok.v, ctx)}</Fragment>
  })
}

function Diagram({ k }) {
  return (
    <figure className="hb-diagram">
      <div className="hb-diagram-scroll" dangerouslySetInnerHTML={{ __html: DIAGRAMS[k] }} />
      <figcaption className="hb-diagram-hint">Swipe sideways to see the whole diagram.</figcaption>
    </figure>
  )
}

function blocksOf(blocks, ctx) {
  return blocks.map((b, i) => {
    if (b.type === 'diagram') return <Diagram key={i} k={b.key} />
    if (b.type === 'h3') return <h4 key={i} className="hb-h3">{b.text}</h4>
    if (b.type === 'p') return <p key={i} className="hb-p">{inline(b.text, ctx)}</p>
    if (b.type === 'ul' || b.type === 'ol') {
      const L = b.type
      return (
        <L key={i} className={`hb-list hb-${L}`}>
          {b.items.map((it, j) => (
            <li key={j}>
              {inline(it.text, ctx)}
              {it.children.length > 0 && (
                <ul className="hb-list hb-ul hb-sub">{it.children.map((c, k) => <li key={k}>{inline(c, ctx)}</li>)}</ul>
              )}
            </li>
          ))}
        </L>
      )
    }
    if (b.type === 'table') {
      return (
        <div key={i} className="hb-table-wrap">
          <table className="hb-table">
            <thead><tr>{b.head.map((h, j) => <th key={j} scope="col">{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => (
              <tr key={j}>{r.map((c, k) => k === 0
                ? <th key={k} scope="row" data-label={b.head[k]}>{inline(c, ctx)}</th>
                : <td key={k} data-label={b.head[k]}>{inline(c, ctx)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      )
    }
    return null
  })
}

// ── Storage (a convenience: the page works without it) ──────────────────────
function loadProgress(userId) {
  try { return cleanProgress(JSON.parse(localStorage.getItem(storageKey(userId)) || 'null')) } catch { return emptyProgress() }
}
function saveProgress(userId, p) {
  try { localStorage.setItem(storageKey(userId), JSON.stringify(p)) } catch { /* private window */ }
}

const pad = n => String(n).padStart(2, '0')
const fmtDate = iso => !iso || Number.isNaN(Date.parse(iso)) ? 'today' : new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' })

// ── Quick reference ─────────────────────────────────────────────────────────
function QuickRef({ goLesson }) {
  const Card = ({ label, title, lesson, children, wide, pair }) => (
    <article className={`hb-card${wide ? ' hb-card-wide' : ''}${pair ? ' hb-card-pair' : ''}`}>
      <p className="hb-card-label">{label}</p>
      <h3 className="hb-card-title">{title}</h3>
      <div className="hb-card-body">{children}</div>
      {lesson && <button type="button" className="hb-card-more" onClick={() => goLesson(lesson)}>Read the full rule <span aria-hidden="true">→</span></button>}
    </article>
  )
  return (
    <div className="hb-quick">
      <Card label="To stay on the team" title="Three standards" lesson="standing" wide>
        <div className="hb-stats">
          <div className="hb-stat"><span className="hb-stat-n">80%</span><span className="hb-stat-l">of team meetings each calendar month</span></div>
          <div className="hb-stat"><span className="hb-stat-n">2 h</span><span className="hb-stat-l">of signed-in work every week; 10 h in build season</span></div>
          <div className="hb-stat"><span className="hb-stat-n">2.0</span><span className="hb-stat-l">GPA at every progress report and quarter</span></div>
        </div>
        <ul className="hb-qlist">
          <li><strong>Miss one:</strong> probation. 4 weeks for meetings or hours; until the next grade check for grades.</li>
          <li><strong>Miss meetings or hours again on probation,</strong> or miss the training deadline: removed. Reapply next season.</li>
          <li><strong>On probation</strong> you still attend every competition, but not on the drive team or pit crew.</li>
        </ul>
      </Card>

      <Card label="Only an emergency excuses these" title="Mandatory, every day" lesson="week">
        <ul className="hb-dates">
          <li><span className="hb-date">Jan 9, 2027</span><span>Kickoff, IDEA Classroom, 9:00 AM</span></li>
          <li><span className="hb-date">Oct 30 to Nov 1</span><span>Beach Blitz, Capistrano Valley High School</span></li>
          <li><span className="hb-date">Mar 19 to 21, 2027</span><span>Los Angeles Event, DaVinci High School</span></li>
          <li><span className="hb-date">Apr 2 to 4, 2027</span><span>San Gabriel Valley Event, at Bosco Tech</span></li>
        </ul>
        <p className="hb-qnote">Miss a day: no letter, and probation. Two team meetings a week, right after school.</p>
      </Card>

      <Card label="Every time you come in" title="One session" lesson="hours">
        <ol className="hb-steps">
          <li><strong>Scan in</strong> at a team NFC tag. For a meeting, in its first 15 minutes.</li>
          <li><strong>Pick a task</strong> from your sub-team list.</li>
          <li><strong>Scan out and leave a note</strong> of what you did.</li>
          <li><strong>Wait for approval.</strong> Clean your area first.</li>
        </ol>
        <p className="hb-qnote">Leave without approval: you keep the meeting, you lose the hours.</p>
      </Card>

      <Card label="In the shop" title="Safety" lesson="safety">
        <ul className="hb-qlist">
          <li><strong>Safety glasses</strong> when you, or anyone within 5 feet, uses a tool.</li>
          <li><strong>Closed-toe shoes,</strong> hair tied back, nothing loose or dangling.</li>
          <li><strong>No machine alone</strong> without its IDEA certification.</li>
          <li><strong>Report at once</strong> every injury and near miss.</li>
        </ul>
      </Card>

      <Card label="Can't make it" title="Absences" lesson="attendance">
        <ul className="hb-qlist">
          <li><strong>Ask in the app</strong> at least 24 hours ahead.</li>
          <li><strong>An emergency:</strong> file by 11:59 PM the next school day.</li>
          <li><strong>Never excused:</strong> other activities, homework, a mental health day.</li>
          <li><strong>3 lates</strong> in a month count as 1 absence.</li>
        </ul>
      </Card>

      <Card label="Who to tell" title="Get help" lesson="start" pair>
        <ul className="hb-contacts">
          <li><span>Joining, standing, costs</span><a href="mailto:apina@boscotech.edu">Mr. Pina</a><a href="tel:+16264199320" className="hb-mono">(626) 419-9320</a></li>
          <li><span>Shop, safety, schedule</span><a href="mailto:lgarza@boscotech.edu">Mr. Garza</a></li>
          <li><span>You feel unsafe</span><b>Any mentor, teacher or counselor</b></li>
          <li><span>A crisis, any time</span><a href="tel:988" className="hb-mono">Call or text 988</a></li>
        </ul>
      </Card>
    </div>
  )
}

// ── One lesson ──────────────────────────────────────────────────────────────
function Lesson({ lesson, index, open, onToggle, progress, onAnswer, onNext, openTerm, setOpenTerm }) {
  const passed = !!progress.passed[lesson.id]
  const right = lesson.questions.filter((q, i) => progress.answers[`${lesson.id}:${i}`] === q.a).length
  const state = passed ? 'passed' : right > 0 ? 'started' : 'new'
  const ctx = open ? makeCtx(lesson.id, openTerm, setOpenTerm) : null
  return (
    <section className={`hb-lesson hb-lesson-${state}${open ? ' open' : ''}`} id={`lesson-${lesson.id}`}>
      <button type="button" className="hb-lesson-head" aria-expanded={open} onClick={onToggle}>
        <span className="hb-lesson-num" aria-hidden="true">{pad(index + 1)}</span>
        <span className="hb-lesson-titles">
          <span className="hb-lesson-title">{lesson.title}</span>
          <span className="hb-lesson-rule">{lesson.rule}</span>
        </span>
        <span className={`hb-pill hb-pill-${state}`}>{passed ? 'Passed' : `${right} of 2`}</span>
        <span className="hb-chev" aria-hidden="true" />
      </button>
      {open && (
        <div className="hb-lesson-body">
          <p className="hb-rule"><span className="hb-rule-label">The rule</span>{lesson.rule}</p>
          {lesson.sections.map(n => (
            <div key={n} className="hb-section">
              <h3 className="hb-sec-title"><span className="hb-sec-num">Section {n}</span>{SECTION[n].title}</h3>
              {blocksOf(SECTION[n].blocks, ctx)}
            </div>
          ))}
          <div className="hb-check">
            <p className="hb-check-label">Check yourself</p>
            {lesson.questions.map((q, qi) => {
              const chosen = progress.answers[`${lesson.id}:${qi}`]
              const answered = chosen != null
              const ok = chosen === q.a
              return (
                <fieldset key={qi} className="hb-q">
                  <legend className="hb-q-text"><span className="hb-q-n">{qi + 1}</span>{q.q}</legend>
                  <div className="hb-opts">
                    {q.o.map((opt, oi) => (
                      <button key={oi} type="button"
                        className={`hb-opt${chosen === oi ? (ok ? ' hb-opt-right' : ' hb-opt-wrong') : ''}`}
                        aria-pressed={chosen === oi}
                        disabled={ok}
                        onClick={() => onAnswer(lesson.id, qi, oi)}>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {answered && (
                    <p className={`hb-feedback ${ok ? 'hb-feedback-ok' : 'hb-feedback-no'}`} aria-live="polite">
                      <strong>{ok ? 'Right.' : 'Not quite. Try again.'}</strong> The handbook: “{q.quote}”
                    </p>
                  )}
                </fieldset>
              )
            })}
            {passed && (
              <div className="hb-passed">
                <span className="hb-passed-mark">Lesson passed</span>
                <button type="button" className="hb-btn" onClick={onNext}>{index + 1 < LESSONS.length ? 'Next lesson' : 'Go to signing'} <span aria-hidden="true">→</span></button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
const TABS = [['quick', 'Quick reference'], ['lessons', 'Lessons'], ['glossary', 'Glossary'], ['sign', 'Sign']]

export default function HandbookPage({ session, hasRole }) {
  const userId = session?.user?.id
  const roles = ['mentor', 'lead', 'admin', 'parent', 'student'].filter(r => hasRole?.(r))
  const signerRole = signerRoleFor(roles)
  const isStaff = signerRole === 'mentor'
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'quick'
  const setTab = (k) => setParams(k === 'quick' ? {} : { tab: k }, { replace: true })

  const [progress, setProgress] = useState(() => loadProgress(userId))
  useEffect(() => { setProgress(loadProgress(userId)) }, [userId])
  const [openLesson, setOpenLesson] = useState(null)
  const [openTerm, setOpenTerm] = useState(null)
  const [q, setQ] = useState('')
  const scrollTo = useRef(null)

  const passed = passedCount(progress)
  const allPassed = passed === LESSONS.length

  // Close a definition on any tap elsewhere, or Escape.
  useEffect(() => {
    if (!openTerm) return
    const close = () => setOpenTerm(null)
    const key = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('click', close)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', key) }
  }, [openTerm])

  useEffect(() => {
    if (!scrollTo.current) return
    const el = document.getElementById(scrollTo.current)
    scrollTo.current = null
    if (el) el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }, [openLesson, tab])

  function goLesson(id) {
    setOpenLesson(id)
    scrollTo.current = `lesson-${id}`
    setTab('lessons')
  }
  function onAnswer(id, qi, oi) {
    setProgress(p => { const n = answer(p, id, qi, oi); saveProgress(userId, n); return n })
  }
  function onNext(i) {
    const next = LESSONS[i + 1]
    if (next) goLesson(next.id)
    else { setTab('sign'); scrollTo.current = 'hb-top' }
  }

  // ── Signing ──
  const [sign, setSign] = useState({ state: 'loading' }) // loading | unavailable | open | signed | error
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [signers, setSigners] = useState(null)

  useEffect(() => {
    let live = true
    async function load() {
      if (!userId) return
      const { data, error } = await supabase.from('handbook_acknowledgments')
        .select('signed_at, signer_role').eq('member_id', userId).eq('version', HANDBOOK_VERSION)
      if (!live) return
      if (error) { setSign({ state: isMissingTable(error) ? 'unavailable' : 'error', message: error.message }); return }
      const mine = (data ?? []).find(r => r.signer_role === signerRole)
      setSign(mine ? { state: 'signed', at: mine.signed_at } : { state: 'open' })
      if (isStaff) {
        const { data: rows } = await supabase.from('handbook_acknowledgments')
          .select('member_id, signer_role, signed_at, lessons_passed').eq('version', HANDBOOK_VERSION)
          .order('signed_at', { ascending: false })
        const ids = [...new Set((rows ?? []).map(r => r.member_id))]
        let names = {}
        if (ids.length) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name, nickname').in('id', ids)
          names = Object.fromEntries((profs ?? []).map(p => [p.id, p.nickname || p.full_name || 'Member']))
        }
        if (live) setSigners((rows ?? []).map(r => ({ ...r, name: names[r.member_id] || 'Member' })))
      }
    }
    load()
    return () => { live = false }
  }, [userId, signerRole, isStaff])

  async function doSign() {
    setBusy(true)
    const { error } = await supabase.from('handbook_acknowledgments').insert({
      member_id: userId, version: HANDBOOK_VERSION, signer_role: signerRole, lessons_passed: passed,
      // Sent for completeness; the 0013 trigger replaces it with the server clock.
      signed_at: new Date().toISOString(),
    })
    setBusy(false)
    if (!error || error.code === '23505') { setSign({ state: 'signed', at: new Date().toISOString() }); return }
    setSign({ state: isMissingTable(error) ? 'unavailable' : 'error', message: error.message })
  }

  const canSign = !mustPassLessons(signerRole) || allPassed
  const status = sign.state === 'signed' ? 'signed' : canSign ? 'ready' : 'progress'
  const lines = signerRole === 'parent' ? AGREEMENTS.parent : signerRole === 'student' ? AGREEMENTS.student : null

  const glossary = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? GLOSSARY.filter(g => g.term.toLowerCase().includes(s) || g.def.toLowerCase().includes(s)) : GLOSSARY
  }, [q])

  return (
    <div className="hb-wrap">
      <div className="hb-body" id="hb-top">
        <header className="hb-hero">
          <div className="hb-hero-text">
            <p className="hb-eyebrow">Techmen · 5669 · Member handbook</p>
            <h1 className="hb-title">How we run the team</h1>
            <p className="hb-lede">Every rule, in 18 short lessons. Pass each lesson's two questions, then sign. The quick reference has the essentials on one screen.</p>
            <p className="hb-version">Version {HB.version}</p>
          </div>
          <div className="hb-meter" aria-label={`${passed} of ${LESSONS.length} lessons passed`}>
            <div className="hb-meter-top">
              <span className="hb-meter-n"><b>{passed}</b>/{LESSONS.length}</span>
              <span className={`hb-pill hb-pill-${status}`}>{status === 'signed' ? `Signed ${fmtDate(sign.at)}` : status === 'ready' ? 'Ready to sign' : 'In progress'}</span>
            </div>
            <span className="hb-meter-label">Lessons passed</span>
            <div className="hb-bar" aria-hidden="true"><span style={{ width: `${(passed / LESSONS.length) * 100}%` }} /></div>
            <div className="hb-ticks" aria-hidden="true">
              {LESSONS.map(l => <span key={l.id} className={progress.passed[l.id] ? 'on' : ''} />)}
            </div>
          </div>
        </header>

        <div className="hb-tabs" role="tablist" aria-label="Handbook">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k}
              className={`hb-tab${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {tab === 'quick' && (
          <div role="tabpanel">
            <div className="hb-glance">
              <p className="hb-glance-text"><Inline text={GLANCE.blocks.find(b => b.type === 'p').text} /></p>
              <Diagram k="standards" />
            </div>
            <QuickRef goLesson={goLesson} />
          </div>
        )}

        {tab === 'lessons' && (
          <div role="tabpanel" className="hb-lessons-layout">
            <nav className="hb-index" aria-label="Lessons">
              <p className="hb-index-label">{passed} of {LESSONS.length} passed</p>
              <ol>
                {LESSONS.map((l, i) => (
                  <li key={l.id}>
                    <button type="button" className={`hb-index-item${openLesson === l.id ? ' active' : ''}${progress.passed[l.id] ? ' done' : ''}`} onClick={() => goLesson(l.id)}>
                      <span className="hb-index-n">{pad(i + 1)}</span>{l.title}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="hb-lessons">
              {LESSONS.map((l, i) => (
                <Lesson key={l.id} lesson={l} index={i} open={openLesson === l.id}
                  onToggle={() => { const next = openLesson === l.id ? null : l.id; setOpenLesson(next); if (next) scrollTo.current = `lesson-${l.id}` }}
                  progress={progress} onAnswer={onAnswer} onNext={() => onNext(i)}
                  openTerm={openTerm} setOpenTerm={setOpenTerm} />
              ))}
            </div>
          </div>
        )}

        {tab === 'glossary' && (
          <div role="tabpanel" className="hb-glossary">
            <label className="hb-search">
              <span className="hb-search-label">Find a word</span>
              <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Kickoff, probation, CAD..." />
            </label>
            {glossary.length === 0 ? <p className="hb-empty">No word matches “{q}”.</p> : (
              <dl className="hb-terms">
                {glossary.map(g => (
                  <div key={g.term} className="hb-term-row"><dt>{g.term}</dt><dd>{g.def}</dd></div>
                ))}
              </dl>
            )}
          </div>
        )}

        {tab === 'sign' && (
          <div role="tabpanel" className={`hb-sign${isStaff ? ' hb-sign-staff' : ''}`}>
            {!canSign ? (
              <div className="hb-locked">
                <p className="hb-card-label">Signing opens after every lesson</p>
                <h3 className="hb-card-title">{LESSONS.length - passed} {LESSONS.length - passed === 1 ? 'lesson' : 'lessons'} to go</h3>
                <ul className="hb-todo">
                  {LESSONS.filter(l => !progress.passed[l.id]).map(l => (
                    <li key={l.id}><button type="button" className="hb-link" onClick={() => goLesson(l.id)}>{l.title}</button></li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="hb-sign-card">
                <p className="hb-card-label">{signerRole === 'mentor' ? 'Mentor' : signerRole === 'parent' ? 'Parent or guardian' : 'Student'} · version {HB.version}</p>
                <h3 className="hb-card-title">By signing, I agree that:</h3>
                {lines ? (
                  <ol className="hb-agree">{lines.map((t, i) => <li key={i}><Inline text={t} /></li>)}</ol>
                ) : (
                  <ol className="hb-agree"><li>I have read this handbook, version {HB.version}, and will follow it, including Section 20, Adults on the team. (Section 22)</li></ol>
                )}
                {sign.state === 'signed' ? (
                  <p className="hb-signed">Signed {fmtDate(sign.at)}. The app keeps this record.</p>
                ) : sign.state === 'unavailable' ? (
                  <p className="hb-empty">Signing in the app is not set up yet. Your lessons are saved on this device.</p>
                ) : sign.state === 'loading' ? (
                  <p className="hb-empty">Checking your signature...</p>
                ) : (
                  <>
                    <label className="hb-agree-box">
                      <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
                      <span>I have read the handbook and agree to every line above.</span>
                    </label>
                    <button type="button" className="hb-btn hb-btn-primary" disabled={!agree || busy} onClick={doSign}>{busy ? 'Signing...' : 'Sign the handbook'}</button>
                    {sign.state === 'error' && <p className="hb-error">Could not sign: {sign.message}</p>}
                  </>
                )}
                <p className="hb-fine">The printed signature page (Section 24) is still signed by the student and one parent, and mentors keep it.</p>
              </div>
            )}

            {isStaff && signers && (
              <div className="hb-signers">
                <p className="hb-card-label">Mentors only</p>
                <h3 className="hb-card-title">Signed this version: {signers.length}</h3>
                {signers.length === 0 ? <p className="hb-empty">Nobody has signed yet.</p> : (
                  <ul className="hb-signer-list">
                    {signers.map(s => (
                      <li key={`${s.member_id}-${s.signer_role}`}>
                        <span>{s.name}</span><span className="hb-mono">{s.signer_role}</span><span className="hb-mono">{fmtDate(s.signed_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
