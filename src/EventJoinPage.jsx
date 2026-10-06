// The event hub's OPEN link (/join, /join/<event id>; migration 0007). Like a
// Google Form: a parent or guardian opens it, picks their student, gives a
// name and email, ticks that they are the student's parent or guardian, and
// lands on their family's page (/e/<token>). It runs on integrity, by Mr.
// Pina's decision of 2026-10-05; the rules are in hub_join (SQL), and this
// page only renders. A token is remembered on this device per event, so
// opening the link again goes straight back.
import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from './supabase'
import { isSchemaMissing } from './schemaMissing'
import { fmtDate, forgetSavedFamily, readSavedFamily, serviceHoursSpots, writeSavedFamily } from './eventHub'
import { ServiceHoursLine } from './EventHubControls'
import './EventHub.css'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Is a remembered family link still good? Only the event-family function's
// own "not_found" answer means dead; anything else (offline, a 5xx) keeps it.
async function savedLinkDead(token) {
  try {
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-family`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, action: 'fetch' }),
    })
    if (res.status !== 404) return false
    const body = await res.json().catch(() => null)
    return body?.error === 'not_found'
  } catch {
    return false
  }
}

function refusal(error) {
  const m = /^hub:([a-z_]+)$/.exec(error?.message ?? '')
  return m ? { code: m[1], message: error.details || 'That did not work. Please check and try again.' } : null
}

// The rules queue the email; the deployed event-family function sends what is
// queued. Its "lost your link" action with no address sends the queue and
// nothing else (hub_resend_request ignores a blank address), so this needs no
// new function. Best effort: the hourly tick sends it anyway.
function sendQueuedMail() {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/event-family`
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resend_link', email: '' }) })
    .catch(() => { /* the hourly tick sends it */ })
}

export default function EventJoinPage() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  // "Add another student" on a family page comes here with the parent's name
  // and email, so a parent with two students types them once.
  const another = useLocation().state?.another ?? null
  const [state, setState] = useState({ mode: 'loading' })   // loading | ready | closed | offline
  const [q, setQ] = useState('')
  const [student, setStudent] = useState(null)
  const [name, setName] = useState(another?.name ?? '')
  const [email, setEmail] = useState(another?.email ?? '')
  const [guardian, setGuardian] = useState(!!another)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [fresh, setFresh] = useState(!!another)
  const [done, setDone] = useState(null)   // { status: 'emailed' | 'ask_mentor', student, to }

  const load = async () => {
    setState({ mode: 'loading' })
    const arg = eventId && UUID_RE.test(eventId) ? eventId : null
    if (eventId && !arg) { setState({ mode: 'closed', message: 'This link is not right. Ask the team for the current link.' }); return }
    const { data, error: err } = await supabase.rpc('hub_join_info', { p_event: arg })
    if (err) {
      const r = refusal(err)
      if (r) setState({ mode: 'closed', message: r.message })
      else if (isSchemaMissing(err)) setState({ mode: 'closed', message: 'Sign-up is not open yet. Please check back soon.' })
      else setState({ mode: 'offline' })
      return
    }
    setState({ mode: 'ready', info: data })
  }
  useEffect(() => { load() }, [eventId]) // eslint-disable-line react-hooks/exhaustive-deps

  const info = state.info
  const ev = info?.event
  const [checked, setChecked] = useState({})   // token -> 'ok' | 'dead'
  const remembered = ev && !fresh ? readSavedFamily(ev.id) : null
  const saved = remembered?.token && checked[remembered.token] === 'ok' ? remembered : null
  const checking = !!remembered?.token && !checked[remembered.token]
  // Offer "Continue" only for a link that still opens; forget one that does not.
  useEffect(() => {
    if (!ev || !remembered?.token || checked[remembered.token]) return undefined
    let live = true
    savedLinkDead(remembered.token).then((dead) => {
      if (!live) return
      if (dead) forgetSavedFamily(ev.id)
      setChecked((c) => ({ ...c, [remembered.token]: dead ? 'dead' : 'ok' }))
    })
    return () => { live = false }
  }, [ev, remembered?.token, checked]) // eslint-disable-line react-hooks/exhaustive-deps
  const students = useMemo(() => {
    const all = info?.students ?? []
    const t = q.trim().toLowerCase()
    return t ? all.filter((s) => s.name.toLowerCase().includes(t)) : all
  }, [info, q])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!student) { setError('Pick your student from the list.'); return }
    if (!guardian) { setError('Please tick the box to confirm you are this student\'s parent or guardian.'); return }
    setBusy(true)
    const { data, error: err } = await supabase.rpc('hub_join', {
      p_event: ev.id, p_student: student.id, p_name: name.trim(), p_email: email.trim(), p_guardian: guardian,
    })
    setBusy(false)
    if (err || !data?.status) {
      const r = refusal(err)
      setError(r ? r.message : 'Could not reach the team server. Check your connection and try again.')
      return
    }
    sendQueuedMail()
    if (data.status === 'in' && data.token) {
      writeSavedFamily(ev.id, { token: data.token, student: data.student })
      navigate(`/e/${data.token}`, { state: { joined: { email: email.trim(), student: data.student } } })
      return
    }
    setDone(data)
  }

  if (state.mode === 'loading' || (state.mode === 'ready' && checking)) {
    return <div className="eh-page"><p className="eh-hint" role="status">Loading…</p></div>
  }
  if (state.mode !== 'ready') {
    return (
      <div className="eh-page">
        <section className="eh-card eh-lost" data-testid="eh-join-closed">
          <img src="/assets/logos/Mark-Gold.svg" className="eh-mark" alt="Techmen" />
          <h1 className="eh-card-title">{state.mode === 'offline' ? 'Cannot reach the team server' : 'Sign-up is not open'}</h1>
          <p>{state.mode === 'offline' ? 'Check your connection and try again.' : state.message}</p>
          {state.mode === 'offline' && <button type="button" className="eh-btn" onClick={load}>Try again</button>}
        </section>
      </div>
    )
  }

  const dates = ev.first_day
    ? (ev.first_day === ev.last_day ? fmtDate(ev.first_day) : `${fmtDate(ev.first_day)} to ${fmtDate(ev.last_day)}`)
    : ''

  return (
    <div className="eh-page" data-testid="eh-join">
      <header className="eh-head">
        <img src="/assets/logos/Mark-Gold.svg" className="eh-mark" alt="Techmen" />
        <div>
          <h1 className="eh-title">{ev.title}</h1>
          <p className="eh-sub">{[ev.venue_name, dates].filter(Boolean).join(' · ')}</p>
        </div>
      </header>

      {done && (
        <section className="eh-card" role="status" data-testid="eh-join-done">
          {done.status === 'emailed' ? (
            <>
              <h2 className="eh-card-title">Your family already started</h2>
              <p>Someone in {done.student}'s family has already started this sign-up, so we emailed the family page link to {(done.to ?? []).join(' and ')}.</p>
              <p className="eh-hint">Whoever has that email can send you the link, or add you on the page under "Add another parent or guardian". Not sure who that is? Ask a mentor.</p>
            </>
          ) : (
            <>
              <h2 className="eh-card-title">Ask a mentor</h2>
              <p>{done.student}'s family page was set up by the team, and there is no email on it yet. Ask a mentor to add your email; they will send you the link.</p>
            </>
          )}
          <button type="button" className="eh-btn" onClick={() => { setDone(null); setStudent(null) }}>Back</button>
        </section>
      )}

      {!done && saved?.token && (
        <section className="eh-card" data-testid="eh-join-saved">
          <h2 className="eh-card-title">Welcome back</h2>
          <p>You already started for {saved.student}.</p>
          <div className="eh-inline">
            <Link className="eh-btn eh-btn-primary" to={`/e/${saved.token}`}>Continue for {saved.student}</Link>
            <button type="button" className="eh-btn" onClick={() => setFresh(true)}>Sign up another student</button>
          </div>
          <button type="button" className="eh-btn eh-btn-quiet" data-testid="eh-join-forget"
                  onClick={() => { forgetSavedFamily(ev.id); setFresh(true) }}>Not your family? Forget this on this device</button>
        </section>
      )}

      {!done && !saved?.token && (
        <form className="eh-card" onSubmit={submit} data-testid="eh-join-form">
          <h2 className="eh-card-title">{another ? 'Add another student' : 'Family sign-up'}</h2>
          {another
            ? <p className="eh-note" data-testid="eh-join-another">Your name and email are filled in from {another.from ? `${another.from}'s page` : 'your other page'}. Pick your other student and press Start. Both pages will list each other.</p>
            : <p className="eh-hint">For parents and guardians. About five minutes. Your answers save as you go, and you can come back and change them any time. More than one student on the team? Sign up one, then press "Add another student" at the top of their page.</p>}
          <ServiceHoursLine text={serviceHoursSpots(ev).join} testid="eh-sh-join" />

          <fieldset className="eh-q">
            <legend className="eh-q-label">Your student</legend>
            {student ? (
              <div className="eh-inline">
                <span className="eh-join-picked" data-testid="eh-join-picked">Selected: {student.name}</span>
                <button type="button" className="eh-btn" onClick={() => setStudent(null)}>Change</button>
              </div>
            ) : (
              <>
                <input className="eh-input" placeholder="Type your student's first or last name" value={q}
                       onChange={(e) => setQ(e.target.value)} aria-label="Search for your student" />
                <div className="eh-join-list" role="listbox" aria-label="Students">
                  {students.map((s) => (
                    <button key={s.id} type="button" role="option" aria-selected="false" className="eh-chip eh-join-opt"
                            onClick={() => { setStudent(s); setError(null) }}>{s.name}</button>
                  ))}
                  {students.length === 0 && <p className="eh-hint">No match. Only students who filled out this season's team application are listed. Ask your student, or a mentor, if yours is missing.</p>}
                </div>
              </>
            )}
          </fieldset>

          <label className="eh-field"><span className="eh-q-label">Your name</span>
            <input className="eh-input" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="eh-field"><span className="eh-q-label">Your email</span>
            <input className="eh-input" type="email" required autoComplete="email" inputMode="email" value={email}
                   onChange={(e) => setEmail(e.target.value)} />
            <span className="eh-hint">We email you a link back to your family's page.</span></label>

          <div className="eh-tick-wrap">
            <button type="button" role="checkbox" aria-checked={guardian} className={`eh-tick${guardian ? ' eh-tick-on' : ''}`}
                    onClick={() => setGuardian(!guardian)} data-testid="eh-join-guardian">
              <span className="eh-tick-box" aria-hidden="true">{guardian ? '✓' : ''}</span>
              <span>I am this student's parent or guardian</span>
            </button>
          </div>

          {error && <p className="eh-note eh-note-bad" role="alert" data-testid="eh-join-error">{error}</p>}
          <button type="submit" className="eh-btn eh-btn-primary eh-join-go" disabled={busy}>{busy ? 'Starting…' : 'Start'}</button>
        </form>
      )}

      <p className="eh-hint eh-join-mentor">
        Team mentors and staff only: <Link to={`/trips/${ev.id}/manage`}>sign in to add your car</Link> on the Carpool tab.
        Parents who will drive: pick your student above and press Start. You add your car in Rides.
      </p>
    </div>
  )
}
