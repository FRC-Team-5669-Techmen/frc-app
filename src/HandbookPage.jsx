// The member handbook (/handbook): a quick reference, the whole handbook in
// section order with search and a check (two questions) after each part, the
// glossary, and signing.
//
// The text is src/handbook/handbook.md, the release copy of the team's Claude
// Doc. Words that a freshman may not know are underlined; tapping one shows
// its glossary line. Progress lives in this browser (localStorage, per member
// and version); the signature is a row in handbook_acknowledgments
// (migration 0013), and until 0013 is pasted the Sign tab says so plainly.

import { useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from './supabase'
import { writeVia } from './writeVia'
import { isMissingTable } from './schemaMissing'
import handbookMd from './handbook/handbook.md?raw'
import { parseHandbook, parseInline, plain, glossaryOf, agreementsOf } from './handbook/content'
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
// A search hit is marked in place (ctx.hl); the rest still gets its terms.
function marked(str, ctx) {
  if (!ctx?.hl) return withTerms(str, ctx)
  return str.split(ctx.hl).map((part, i) => i % 2
    ? <mark key={`h${i}`} className="hb-hit">{part}</mark>
    : <Fragment key={`t${i}`}>{withTerms(part, ctx)}</Fragment>)
}
function inline(text, ctx) {
  return parseInline(text).map((tok, i) => {
    // Bold may hold a link (the FIRST Code of Conduct line): render it inside.
    if (tok.t === 'b') return <strong key={i}>{inline(tok.v, ctx)}</strong>
    if (tok.t === 'a') return <a key={i} href={tok.href} target="_blank" rel="noopener noreferrer">{tok.v.replace(/^https?:\/\//, '')}</a>
    return <Fragment key={i}>{marked(tok.v, ctx)}</Fragment>
  })
}

// The plain words of a section, for search.
function plainOf(sec) {
  const out = [sec.title]
  for (const b of sec.blocks) {
    if (b.type === 'p' || b.type === 'h3') out.push(plain(b.text))
    if (b.type === 'ul' || b.type === 'ol') for (const it of b.items) out.push(plain(it.text), ...it.children.map(plain))
    if (b.type === 'table') out.push(...b.head, ...b.rows.flat().map(plain))
  }
  return out.join(' ').toLowerCase()
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

// The handbook in order: each part is the sections one check covers. Section
// numbers are the only numbers shown, so "Section 4" in an email is findable.
const PARTS = LESSONS.map(l => ({ lesson: l, sections: l.sections.map(n => SECTION[n]) }))
const SEC_TEXT = Object.fromEntries(PARTS.flatMap(p => p.sections).map(sec => [sec.num, plainOf(sec)]))
const LAST_READ = Math.max(...LESSONS.flatMap(l => l.sections))
// Sections after the last part live on their own tabs.
const TAB_SECTIONS = HB.sections.filter(sec => sec.num > LAST_READ)
  .map(sec => ({ num: sec.num, title: sec.title, tab: /glossary/i.test(sec.title) ? 'glossary' : 'sign' }))
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
          <li><strong>Plan other activities</strong> around team meetings.</li>
          <li><strong>3 lates</strong> in a month count as 1 absence.</li>
        </ul>
      </Card>

      <Card label="Who to tell" title="Get help" lesson="start" pair>
        <ul className="hb-contacts">
          <li className="hb-contact-main"><span>Anything about the team</span><b>Mr. Pina</b><a href="mailto:apina@boscotech.edu" className="hb-mono">apina@boscotech.edu</a><a href="tel:+16264199320" className="hb-mono">(626) 419-9320</a></li>
          <li><span>You feel unsafe</span><b>Any mentor, teacher or counselor</b></li>
          <li><span>A crisis, any time</span><a href="tel:988" className="hb-mono">Call or text 988</a></li>
        </ul>
      </Card>
    </div>
  )
}

// ── One check (two questions after a part) ──────────────────────────────────
function Check({ lesson, index, progress, onAnswer, onNext }) {
  const passed = !!progress.passed[lesson.id]
  const right = lesson.questions.filter((q, i) => progress.answers[`${lesson.id}:${i}`] === q.a).length
  const state = passed ? 'passed' : right > 0 ? 'started' : 'new'
  const range = lesson.sections.length > 1 ? `Sections ${lesson.sections[0]} to ${lesson.sections[lesson.sections.length - 1]}` : `Section ${lesson.sections[0]}`
  return (
    <div className="hb-check" id={`check-${lesson.id}`} data-state={state}>
      <div className="hb-check-head">
        <p className="hb-check-label">Check yourself · {range}</p>
        <span className={`hb-pill hb-pill-${state}`}>{passed ? 'Passed' : `${right} of 2`}</span>
      </div>
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
          <span className="hb-passed-mark">Check passed</span>
          <button type="button" className="hb-btn" onClick={onNext}>{index + 1 < LESSONS.length ? 'Keep reading' : 'Go to signing'} <span aria-hidden="true">→</span></button>
        </div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
const TABS = [['quick', 'Quick reference'], ['read', 'Handbook'], ['glossary', 'Glossary'], ['sign', 'Sign']]

export default function HandbookPage({ session, hasRole }) {
  const userId = session?.user?.id
  const roles = ['mentor', 'lead', 'admin', 'parent', 'student'].filter(r => hasRole?.(r))
  const signerRole = signerRoleFor(roles)
  const isStaff = signerRole === 'mentor'
  const [params, setParams] = useSearchParams()
  // /handbook?section=6 opens the Handbook tab at Section 6, so an email or
  // message can cite the handbook with a link that lands. ?tab=lessons is the
  // old name of the Handbook tab and still works.
  const linkSection = Number(params.get('section'))
  const linkTab = SEC_TEXT[linkSection] != null ? 'read' : TAB_SECTIONS.find(x => x.num === linkSection)?.tab
  const askedTab = params.get('tab') === 'lessons' ? 'read' : params.get('tab')
  const tab = linkTab && !askedTab ? linkTab : TABS.some(([k]) => k === askedTab) ? askedTab : 'quick'
  const setTab = (k) => setParams(k === 'quick' ? {} : { tab: k }, { replace: true })

  const [progress, setProgress] = useState(() => loadProgress(userId))
  useEffect(() => { setProgress(loadProgress(userId)) }, [userId])
  const [openTerm, setOpenTerm] = useState(null)
  const [q, setQ] = useState('')
  const [find, setFind] = useState('')
  const [jump, setJump] = useState(0)
  const scrollTo = useRef(linkTab === 'read' ? `sec-${linkSection}` : null)

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
    // A link that lands on a section jumps at once; taps inside the page glide.
    const smooth = jump > 0 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (el) el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }, [jump, tab])

  function goTo(id) {
    scrollTo.current = id
    setJump(j => j + 1)
    setTab('read')
  }
  function goSection(n) {
    const x = TAB_SECTIONS.find(t => t.num === n)
    if (x) { setTab(x.tab); scrollTo.current = 'hb-top'; setJump(j => j + 1); return }
    setFind('')
    goTo(`sec-${n}`)
  }
  // A quick-reference card or a to-do line opens its part of the handbook.
  function goLesson(id, where = 'sec') {
    const l = LESSONS.find(x => x.id === id)
    setFind('')
    goTo(where === 'check' ? `check-${id}` : `sec-${l.sections[0]}`)
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
    const { error } = await writeVia(supabase, 'handbook_sign',
      { p_version: HANDBOOK_VERSION, p_signer_role: signerRole, p_lessons_passed: passed },
      { table: 'handbook_acknowledgments', op: 'insert', values: {
        member_id: userId, version: HANDBOOK_VERSION, signer_role: signerRole, lessons_passed: passed,
        // Sent for completeness; the 0013 trigger replaces it with the server clock.
        signed_at: new Date().toISOString(),
      } })
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
            <p className="hb-lede">The whole handbook is on the Handbook tab, in order, with search. Answer the two questions after each part, then sign. The quick reference has the essentials on one screen.</p>
            <p className="hb-version">Version {HB.version}</p>
          </div>
          <div className="hb-meter" aria-label={`${passed} of ${LESSONS.length} checks passed`}>
            <div className="hb-meter-top">
              <span className="hb-meter-n"><b>{passed}</b>/{LESSONS.length}</span>
              <span className={`hb-pill hb-pill-${status}`}>{status === 'signed' ? `Signed ${fmtDate(sign.at)}` : status === 'ready' ? 'Ready to sign' : 'In progress'}</span>
            </div>
            <span className="hb-meter-label">Checks passed</span>
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

        {tab === 'read' && (() => {
          const needle = find.trim().toLowerCase()
          const hl = needle.length >= 2 ? new RegExp(`(${esc(find.trim())})`, 'gi') : null
          const hits = hl ? Object.keys(SEC_TEXT).filter(n => SEC_TEXT[n].includes(needle)).length : 0
          return (
            <div role="tabpanel" className="hb-lessons-layout">
              <nav className="hb-index" aria-label="Sections">
                <p className="hb-index-label">Sections</p>
                <ol>
                  {PARTS.flatMap(p => p.sections.map(sec => (
                    <li key={sec.num}>
                      <button type="button" className={`hb-index-item${progress.passed[p.lesson.id] ? ' done' : ''}`} onClick={() => goSection(sec.num)}>
                        <span className="hb-index-n">{sec.num}</span>{sec.title}
                      </button>
                    </li>
                  )))}
                  {TAB_SECTIONS.map(x => (
                    <li key={x.num}>
                      <button type="button" className="hb-index-item" onClick={() => goSection(x.num)}>
                        <span className="hb-index-n">{x.num}</span>{x.title}
                      </button>
                    </li>
                  ))}
                </ol>
              </nav>
              <div className="hb-read">
                <div className="hb-read-tools">
                  <label className="hb-search">
                    <span className="hb-search-label">Search the handbook</span>
                    <input type="search" value={find} onChange={e => setFind(e.target.value)} placeholder="Sports, probation, sign out..." />
                  </label>
                  <label className="hb-search hb-jump">
                    <span className="hb-search-label">Go to section</span>
                    <select value="" onChange={e => e.target.value && goSection(Number(e.target.value))}>
                      <option value="">Choose a section</option>
                      {PARTS.flatMap(p => p.sections).concat(TAB_SECTIONS).map(sec => <option key={sec.num} value={sec.num}>{sec.num}. {sec.title}</option>)}
                    </select>
                  </label>
                </div>
                {hl && <p className="hb-hits" aria-live="polite">{hits === 0 ? `Nothing matches “${find.trim()}”. Words are also in the Glossary tab.` : `${hits} ${hits === 1 ? 'section matches' : 'sections match'} “${find.trim()}”`}</p>}
                {PARTS.map((p, i) => {
                  const shown = p.sections.filter(sec => !hl || SEC_TEXT[sec.num].includes(needle))
                  if (!shown.length) return null
                  const ctx = makeCtx(p.lesson.id, openTerm, setOpenTerm)
                  ctx.hl = hl
                  return (
                    <Fragment key={p.lesson.id}>
                      {shown.map(sec => (
                        <section key={sec.num} className="hb-section hb-sec-card" id={`sec-${sec.num}`}>
                          <h2 className="hb-sec-title"><span className="hb-sec-num">Section {sec.num}</span>{sec.title}</h2>
                          {blocksOf(sec.blocks, ctx)}
                        </section>
                      ))}
                      {!hl && <Check lesson={p.lesson} index={i} progress={progress} onAnswer={onAnswer} onNext={() => onNext(i)} />}
                    </Fragment>
                  )
                })}
              </div>
            </div>
          )
        })()}

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

        {tab === 'sign' && <HandbookChanges isAdmin={!!hasRole?.('admin')} />}
        {tab === 'sign' && (
          <div role="tabpanel" className={`hb-sign${isStaff ? ' hb-sign-staff' : ''}`}>
            {!canSign ? (
              <div className="hb-locked">
                <p className="hb-card-label">Signing opens after every check</p>
                <h3 className="hb-card-title">{LESSONS.length - passed} {LESSONS.length - passed === 1 ? 'check' : 'checks'} to go</h3>
                <ul className="hb-todo">
                  {LESSONS.filter(l => !progress.passed[l.id]).map(l => (
                    <li key={l.id}><button type="button" className="hb-link" onClick={() => goLesson(l.id, 'check')}>{l.sections.length > 1 ? `Sections ${l.sections[0]} to ${l.sections[l.sections.length - 1]}` : `Section ${l.sections[0]}`}: {l.title}</button></li>
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

// The change feed (handbook Section 22, migration 0017): every version
// numbered, announced in the app, effective 7 days later (a safety change at
// once); a major change is signed again. An admin publishes a version here
// after the text in src/handbook/ and HANDBOOK_VERSION change.
function HandbookChanges({ isAdmin }) {
  const [rows, setRows] = useState(null)
  const [form, setForm] = useState({ version: HANDBOOK_VERSION, summary: '', major: false, safety: false })
  const [msg, setMsg] = useState(null)
  const load = () => supabase.from('handbook_versions').select('*').order('published_at', { ascending: false })
    .then(({ data, error }) => setRows(error ? [] : data ?? []))
  useEffect(() => { load() }, [])
  if (!rows || (!rows.length && !isAdmin)) return null
  async function publish() {
    const { error } = await supabase.rpc('publish_handbook_version', { p_version: form.version.trim(), p_summary: form.summary.trim(), p_major: form.major, p_safety: form.safety })
    setMsg(error ? (error.message || 'Not published') : 'Published. Every member was told.')
    if (!error) load()
  }
  return (
    <section className="hb-changes" data-card="changes">
      <p className="hb-card-label">What changed</p>
      <ul className="hb-todo">{rows.map((r) => (
        <li key={r.version}><b>Version {r.version}</b>{r.major ? ' · major, sign again' : ''}{r.safety ? ' · safety' : ''} · in effect {new Date(r.effective_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}<br />{r.summary}</li>))}</ul>
      {isAdmin && (
        <div className="hb-publish">
          <p className="hb-card-label">Publish a version (after the text and HANDBOOK_VERSION change)</p>
          <input className="hb-search" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} aria-label="Version" />
          <textarea className="hb-search" rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="What changed, in a line or two" aria-label="Summary" />
          <label className="hb-agree-box"><input type="checkbox" checked={form.major} onChange={(e) => setForm({ ...form, major: e.target.checked })} /><span>Major: eligibility, travel, safety, costs or conduct (members sign again)</span></label>
          <label className="hb-agree-box"><input type="checkbox" checked={form.safety} onChange={(e) => setForm({ ...form, safety: e.target.checked })} /><span>Safety change: in effect at once</span></label>
          <button type="button" className="hb-btn hb-btn-primary" disabled={form.summary.trim().length < 3} onClick={publish}>Publish</button>
          {msg && <p className="hb-fine">{msg}</p>}
        </div>
      )}
    </section>
  )
}
